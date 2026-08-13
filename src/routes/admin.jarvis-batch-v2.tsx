import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Upload, Wand2, BookOpen, Layers, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, Download, KeyRound, RotateCw } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPdfPageCount, getPdfPageTexts, estimateQuestionsInText } from "@/lib/pdf-page-render";
import { sliceByBookends, type Bookend } from "@/lib/bookend-slicer";
import {
  createJobV2, extractBookendsV2, submitChunkV2, markChunkV2, retryChunkV2,
  pollChunkV2, importChunkV2, listJobsV2, getJobV2, deleteJobV2,
  getGeminiKeyStatusV2,
} from "@/lib/jarvis-batch-v2.functions";


export const Route = createFileRoute("/admin/jarvis-batch-v2")({
  head: () => ({
    meta: [
      { title: "Jarvis Batch v2 — PDF Import" },
      { name: "description", content: "Admin PDF import workflow with chunked text extraction, bookend slicing, and batch solving." },
      { property: "og:title", content: "Jarvis Batch v2 — PDF Import" },
      { property: "og:description", content: "Chunked PDF question extraction and batch solving for the admin workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JarvisBatchV2,
});

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type Subject = { id: string; name: string; group_id: string };

type ChunkRow = {
  id: string; chunk_index: number; page_from: number; page_to: number;
  status: string; batch_id: string | null; imported_count: number; error: string | null;
  results: any; question_blocks?: string[] | null; chunk_text?: string | null;
};
type JobRow = { id: string; pdf_name: string; total_pages: number; subject_id: string | null; status: string; created_at: string };

// Per-chunk local status shown while the client is driving submission.
type LocalStage = "queued" | "text" | "bookends" | "slicing" | "submitting" | "done" | "skipped" | "error";
type LocalStatus = {
  stage: LocalStage;
  expected: number;
  sliced: number;
  message?: string;
  previews?: string[];
};

// ---------- generic helpers ----------
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}
async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 1500, label = "call"): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      if (i === tries - 1) break;
      const msg = String(e?.message || e || "");
      // only backoff on transient-looking errors; still retry once on unknown
      const delay = baseMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
      // eslint-disable-next-line no-console
      console.warn(`[${label}] retry ${i + 1}/${tries - 1} after: ${msg.slice(0, 200)}`);
    }
  }
  throw lastErr;
}

function JarvisBatchV2() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState<string>("__auto__");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunksByJob, setChunksByJob] = useState<Record<string, ChunkRow[]>>({});
  const [localByChunk, setLocalByChunk] = useState<Record<string, LocalStatus>>({});
  // Cache the selected file and per-chunk text for retry so we don't re-extract unnecessarily.
  const activeFileRef = useRef<File | null>(null);
  const chunkTextCacheRef = useRef<Record<string, string>>({});

  const [keyStatus, setKeyStatus] = useState<{ present: boolean; slot?: number; masked?: string } | null>(null);

  const createJobFn = useServerFn(createJobV2);
  const extractBookendsFn = useServerFn(extractBookendsV2);
  const submitChunkFn = useServerFn(submitChunkV2);
  const markChunkFn = useServerFn(markChunkV2);
  const retryChunkFn = useServerFn(retryChunkV2);
  const pollChunkFn = useServerFn(pollChunkV2);
  const importChunkFn = useServerFn(importChunkV2);
  const listJobsFn = useServerFn(listJobsV2);
  const getJobFn = useServerFn(getJobV2);
  const deleteJobFn = useServerFn(deleteJobV2);
  const keyStatusFn = useServerFn(getGeminiKeyStatusV2);

  function patchLocal(chunkId: string, patch: Partial<LocalStatus>) {
    setLocalByChunk((prev) => {
      const base: LocalStatus = prev[chunkId] || { stage: "queued", expected: 0, sliced: 0 };
      return { ...prev, [chunkId]: { ...base, ...patch } };
    });
  }

  function logStep(message: string) {
    setRunLog((prev) => [message, ...prev].slice(0, 8));
  }

  // Courses + key status
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year,kind").eq("kind", "questions").order("year");
      setCourses((data ?? []) as Course[]);
    })();
    refreshJobs();
    refreshKeyStatus();
  }, []);

  async function refreshKeyStatus() {
    try {
      const r: any = await keyStatusFn();
      setKeyStatus(r);
    } catch {
      setKeyStatus({ present: false });
    }
  }

  useEffect(() => {
    if (!courseId) { setGroups([]); setGroupId(""); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subject_groups")
        .select("id,course_id,name").eq("course_id", courseId).order("sort_order");
      setGroups((data ?? []) as Group[]);
      setGroupId(""); setSubjectId("__auto__");
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) { setSubjects([]); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,group_id,name").eq("group_id", groupId).order("sort_order");
      setSubjects((data ?? []) as Subject[]);
      setSubjectId("__auto__");
    })();
  }, [groupId]);

  const ready = useMemo(() => Boolean(courseId && groupId && file && !busy), [courseId, groupId, file, busy]);

  async function refreshJobs() {
    try {
      const r: any = await listJobsFn();
      setJobs((r?.rows ?? []) as JobRow[]);
    } catch { /* silent */ }
  }

  async function loadChunks(jobId: string): Promise<ChunkRow[]> {
    const r = await getJobFn({ data: { jobId } });
    const chunks = (r as any).chunks as ChunkRow[];
    setChunksByJob((prev) => ({ ...prev, [jobId]: chunks }));
    return chunks;
  }

  function previewQuestion(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function noQuestionReason(text: string, expected: number) {
    const compact = text.replace(/\s+/g, " ").trim();
    const answerMarkers = (compact.match(/\b(?:Ans|Answer)\s*[\.:：]?/gi) || []).length;
    const optionMarkers = (compact.match(/\b[A-D]\s*[\).:]/g) || []).length;
    const questionMarks = (compact.match(/\?/g) || []).length;
    if (expected === 0 && answerMarkers === 0 && optionMarkers < 4 && questionMarks === 0) {
      return "No complete questions on these pages — moving on.";
    }
    return "";
  }

  // Extract pure selectable text for a chunk (cached by chunkId). No OCR, no rendering.
  async function getChunkText(chunk: { chunkId: string; pageFrom: number; pageTo: number }): Promise<{ text: string; pageTexts: string[] }> {
    const cached = chunkTextCacheRef.current[chunk.chunkId];
    if (cached) return { text: cached, pageTexts: cached.split("\n\n--- page break ---\n\n") };
    const activeFile = activeFileRef.current;
    if (!activeFile) throw new Error("Re-select the PDF first so we can read text from it.");
    let parts = await withTimeout(
      getPdfPageTexts(activeFile, chunk.pageFrom, chunk.pageTo),
      90_000,
      `pages ${chunk.pageFrom}–${chunk.pageTo} text`,
    );
    if (parts.join(" ").trim().length < 40) {
      await new Promise((r) => setTimeout(r, 250));
      const retry = await withTimeout(
        getPdfPageTexts(activeFile, chunk.pageFrom, chunk.pageTo),
        90_000,
        `pages ${chunk.pageFrom}–${chunk.pageTo} text retry`,
      );
      if (retry.join(" ").trim().length > parts.join(" ").trim().length) parts = retry;
    }
    const text = parts.join("\n\n--- page break ---\n\n").trim();
    chunkTextCacheRef.current[chunk.chunkId] = text;
    return { text, pageTexts: parts };
  }

  // Bookend + slice for an arbitrary text range. Returns slices.
  async function bookendAndSlice(chunkId: string, text: string): Promise<{ text: string }[]> {
    const r: any = await withRetry(
      () => withTimeout(extractBookendsFn({ data: { chunkId, chunkText: text } }), 90_000, "bookends"),
      3, 1500, "bookends",
    );
    const bookends: Bookend[] = (r?.bookends ?? []) as Bookend[];
    return sliceByBookends(text, bookends);
  }

  // Process one chunk end-to-end. Never throws — records error on chunk instead.
  async function processChunk(
    jobId: string,
    chunk: { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number },
  ) {
    const { chunkId } = chunk;
    try {
      patchLocal(chunkId, { stage: "text", message: `reading pages ${chunk.pageFrom}–${chunk.pageTo}` });
      logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: reading text`);
      await markChunkFn({ data: { chunkId, status: "text", error: null } });
      const { text: chunkText, pageTexts } = await getChunkText(chunk);
      if (chunkText.length < 20) {
        await markChunkFn({
          data: {
            chunkId,
            status: "empty",
            error: null,
            chunkText,
            questionBlocks: [],
            results: { expected_count: 0, found_count: 0, no_questions: true, note: "No readable question text on these pages — moving on." },
          },
        });
        patchLocal(chunkId, { stage: "skipped", expected: 0, sliced: 0, message: "no readable question text — moving on" });
        setProgress(`Pages ${chunk.pageFrom}–${chunk.pageTo}: no questions here, moving on.`);
        logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: no readable question text`);
        await loadChunks(jobId);
        return;
      }

      const est = estimateQuestionsInText(chunkText);
      const skipReason = noQuestionReason(chunkText, est.expected);
      if (skipReason) {
        await markChunkFn({
          data: {
            chunkId,
            status: "empty",
            error: null,
            chunkText,
            questionBlocks: [],
            results: { expected_count: 0, found_count: 0, no_questions: true, note: skipReason },
          },
        });
        patchLocal(chunkId, { stage: "skipped", expected: 0, sliced: 0, message: skipReason });
        setProgress(`Pages ${chunk.pageFrom}–${chunk.pageTo}: no questions here, moving on.`);
        logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: no questions here`);
        await loadChunks(jobId);
        return;
      }
      patchLocal(chunkId, { stage: "bookends", expected: est.expected, message: `~${est.expected} questions expected · asking Gemini for bookends` });
      logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: about ${est.expected} questions, finding boundaries`);

      let slices = await bookendAndSlice(chunkId, chunkText);
      patchLocal(chunkId, { stage: "slicing", sliced: slices.length, message: `sliced ${slices.length}${est.expected ? `/${est.expected}` : ""}` });

      // Coverage retry: if we got noticeably fewer than expected, split in halves.
      const threshold = Math.max(2, Math.ceil(est.expected * 0.8));
      if (est.expected >= 2 && slices.length < threshold) {
        // Split the raw text roughly in half at a paragraph boundary.
        const mid = Math.floor(chunkText.length / 2);
        const cut = chunkText.indexOf("\n", mid);
        const splitAt = cut > 0 && cut < chunkText.length - 20 ? cut : mid;
        const pageHalves = pageTexts.map((s) => s.trim()).filter((s) => s.length >= 20);
        const roughHalves = [chunkText.slice(0, splitAt), chunkText.slice(splitAt)].map((s) => s.trim()).filter((s) => s.length >= 20);
        const halves = pageHalves.length > 1 ? pageHalves : roughHalves;
        const merged: { text: string }[] = [];
        for (const half of halves) {
          try {
            const s = await bookendAndSlice(chunkId, half);
            merged.push(...s);
          } catch { /* ignore, keep what we have */ }
        }
        // Dedup by first 40 chars.
        const seen = new Set<string>();
        const combined = [...slices, ...merged].filter((s) => {
          const k = s.text.slice(0, 40).replace(/\s+/g, " ").toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
        if (combined.length > slices.length) slices = combined;
        patchLocal(chunkId, { stage: "slicing", sliced: slices.length, message: `after split-retry: ${slices.length}${est.expected ? `/${est.expected}` : ""}` });
      }

      if (!slices.length) {
        await markChunkFn({ data: { chunkId, status: "empty", error: "Gemini found no complete questions here. Retry is available if this is wrong." } });
        patchLocal(chunkId, { stage: "error", message: "no complete questions found — retry is available" });
        logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: found 0 questions, retry available`);
        await loadChunks(jobId);
        return;
      }

      // Low coverage but non-empty → still submit what we have, but mark it so the user sees the gap.
      const lowCoverage = est.expected >= 2 && slices.length < threshold;
      const previews = slices.map((s) => previewQuestion(s.text));
      setProgress(`Pages ${chunk.pageFrom}–${chunk.pageTo}: found ${slices.length} question${slices.length === 1 ? "" : "s"}, sending to Gemini.`);
      logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: found ${slices.length} question${slices.length === 1 ? "" : "s"}`);
      await markChunkFn({
        data: {
          chunkId,
          status: lowCoverage ? "low_coverage" : "submitting",
          chunkText,
          questionBlocks: slices.map((s) => s.text),
          results: { expected_count: est.expected, found_count: slices.length, previews },
          error: lowCoverage ? `Only ${slices.length}/${est.expected} questions found — submitted, but retry is available.` : null,
        },
      });

      patchLocal(chunkId, { stage: "submitting", sliced: slices.length, message: `submitting ${slices.length} questions to 50%-off batch` });
      await withRetry(
        () => withTimeout(submitChunkFn({ data: { chunkId, questionBlocks: slices.map((s) => s.text) } }), 90_000, "submit"),
        3, 1500, "submit",
      );

      patchLocal(chunkId, { stage: "done", sliced: slices.length, previews, message: lowCoverage ? `submitted ${slices.length}/${est.expected} (low coverage)` : `submitted ${slices.length}` });
      setProgress(`Pages ${chunk.pageFrom}–${chunk.pageTo}: sent to Gemini. Continuing with the next pages.`);
      logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: sent ${slices.length} to Gemini Batch`);
      await loadChunks(jobId);
    } catch (e: any) {
      const msg = e?.message?.slice(0, 400) || String(e).slice(0, 400);
      try { await markChunkFn({ data: { chunkId, status: "failed", error: msg } }); } catch {}
      patchLocal(chunkId, { stage: "error", message: msg });
      logStep(`Pages ${chunk.pageFrom}–${chunk.pageTo}: failed — ${msg}`);
      await loadChunks(jobId);
    }
  }

  // Concurrency pool.
  async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
    let idx = 0;
    const runners = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        await worker(items[i]);
      }
    });
    await Promise.all(runners);
  }

  async function handleSubmit() {
    if (!file || !groupId) return;
    setBusy(true);
    setProgress("Reading page count…");
    setRunLog(["Opening PDF and reading page count"]);
    chunkTextCacheRef.current = {};
    activeFileRef.current = file;
    setLocalByChunk({});
    try {
      const totalPages = await withTimeout(getPdfPageCount(file), 90_000, "PDF open");
      logStep(`PDF opened: ${totalPages} pages`);
      setProgress(`PDF has ${totalPages} pages. Creating job…`);

      const subjectCandidates = subjectId === "__auto__" ? subjects.map((s) => s.name) : [];
      const created = await createJobFn({
        data: {
          courseId, groupId,
          subjectId: subjectId === "__auto__" ? null : subjectId,
          pdfName: file.name,
          totalPages,
          subjectCandidates,
        },
      });
      const chunks = (created as any).chunks as { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number }[];
      const jobId = (created as any).jobId as string;

      // Prime local status for each chunk so they render immediately.
      const initLocal: Record<string, LocalStatus> = {};
      for (const c of chunks) initLocal[c.chunkId] = { stage: "queued", expected: 0, sliced: 0 };
      setLocalByChunk(initLocal);
      logStep(`Created ${chunks.length} chunks. Starting pages ${chunks[0]?.pageFrom ?? 1}–${chunks[0]?.pageTo ?? 2}`);

      await refreshJobs();
      setExpanded(jobId);
      await loadChunks(jobId);

      setProgress(`Processing ${chunks.length} chunks with pure text extraction, two pages at a time…`);
      await runPool(chunks, 1, async (c) => {
        await processChunk(jobId, c);
        await pollAndImportReady(jobId, true);
      });

      setProgress("All pages checked. Waiting for Gemini answers and importing them automatically…");
      await autoFinishJob(jobId);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
      setProgress(`Error: ${e?.message || "failed"}`);
      logStep(`Stopped: ${e?.message || "failed"}`);
    } finally {
      setBusy(false);
      await refreshJobs();
    }
  }

  async function retryChunkClient(jobId: string, chunkId: string) {
    if (!activeFileRef.current) {
      toast.error("Re-select the PDF first so we can re-read those pages.");
      return;
    }
    const chunks = chunksByJob[jobId] || [];
    const meta = chunks.find((c) => c.id === chunkId);
    if (!meta) return;
    try {
      await retryChunkFn({ data: { chunkId } });
      // clear cached text so we truly re-extract
      delete chunkTextCacheRef.current[chunkId];
      await loadChunks(jobId);
      await processChunk(jobId, {
        chunkId, chunkIndex: meta.chunk_index, pageFrom: meta.page_from, pageTo: meta.page_to,
      });
      toast.success(`Chunk ${meta.chunk_index + 1} retried`);
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    }
  }

  async function pollJob(jobId: string) {
    await pollAndImportReady(jobId, false);
  }

  async function importChunk(jobId: string, chunkId: string) {
    try {
      const r = await importChunkFn({ data: { chunkId } });
      const { inserted, skipped, failed } = r as any;
      toast.success(`Imported ${inserted} · skipped ${skipped} · failed ${failed}`);
      await loadChunks(jobId);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    }
  }

  async function importAllReady(jobId: string) {
    const chunks = chunksByJob[jobId] || [];
    const ready = chunks.filter((c) => c.status === "ready");
    if (!ready.length) { toast.info("Nothing ready to import."); return; }
    let ok = 0, fail = 0;
    for (const c of ready) {
      try { await importChunkFn({ data: { chunkId: c.id } }); ok++; } catch { fail++; }
    }
    await loadChunks(jobId);
    toast.success(`Imported ${ok} chunks · ${fail} failed`);
  }

  async function pollAndImportReady(jobId: string, quiet = false): Promise<ChunkRow[]> {
    let chunks = await loadChunks(jobId);
    let changed = 0;
    for (const c of chunks) {
      if (c.status !== "awaiting_batch") continue;
      try {
        const r: any = await pollChunkFn({ data: { chunkId: c.id } });
        if (r?.status && r.status !== c.status) changed++;
      } catch { /* keep waiting */ }
    }

    chunks = await loadChunks(jobId);
    const ready = chunks.filter((c) => c.status === "ready");
    let imported = 0;
    for (const c of ready) {
      try {
        await importChunkFn({ data: { chunkId: c.id } });
        imported++;
      } catch { /* leave ready so the backup import button can retry */ }
    }
    chunks = await loadChunks(jobId);
    if (!quiet && (changed || imported)) toast.success(`Updated ${changed} · imported ${imported}`);
    if (imported) setProgress(`Imported ${imported} finished chunk${imported === 1 ? "" : "s"}. Still watching the rest.`);
    return chunks;
  }

  async function autoFinishJob(jobId: string) {
    const maxChecks = 90;
    for (let i = 0; i < maxChecks; i++) {
      const chunks = await pollAndImportReady(jobId, true);
      const waiting = chunks.some((c) => c.status === "awaiting_batch" || c.status === "ready");
      const working = chunks.some((c) => c.status === "text" || c.status === "bookends" || c.status === "submitting");
      const needsRetry = chunks.some((c) => ["failed", "text_failed"].includes(c.status) || (c.status === "empty" && !c.results?.no_questions));
      if (!waiting && !working) {
        const stats = summarizeChunks(chunks);
        if (needsRetry) {
          setProgress(`Finished what I could. ${stats.totalImported} questions imported, and ${stats.needsRetry} chunk(s) need retry.`);
        } else {
          setProgress(`Done. Imported ${stats.totalImported} questions. No-question pages were skipped automatically.`);
          toast.success("Jarvis Batch v2 is done");
        }
        return;
      }
      setProgress("Gemini is answering in the background. I am checking and importing automatically…");
      await new Promise((r) => setTimeout(r, 8_000));
    }
    setProgress("Gemini is still answering. Leave this page open, or use the backup check button later.");
  }

  async function removeJob(jobId: string) {
    if (!confirm("Delete this job?")) return;
    await deleteJobFn({ data: { jobId } });
    await refreshJobs();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="relative pt-28 pb-10 md:pt-32 md:pb-14 overflow-hidden">
        <FloatingMedicalBackdrop />
        <div className="relative mx-auto max-w-3xl px-4 md:px-8 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ borderColor: "color-mix(in oklab, var(--primary) 25%, white)", color: "var(--primary)", boxShadow: "0 3px 0 color-mix(in oklab, var(--primary) 20%, white)" }}
          >
            <Sparkles size={12} strokeWidth={3} />
            new · v2 · live
          </span>
          <h1
            className="mt-6 font-display font-black text-foreground leading-[1.05] tracking-tight lowercase"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}
          >
            jarvis batch v2.
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            choose a course, choose a section, upload the PDF, then press Start. Jarvis reads two pages at a time and imports finished answers automatically.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 md:px-8 pb-24 space-y-8">
        {/* Gemini API key status */}
        <div
          className="rounded-2xl bg-white border-2 p-4 flex items-center gap-3"
          style={{
            borderColor: keyStatus?.present
              ? "color-mix(in oklab, var(--primary) 25%, white)"
              : "color-mix(in oklab, #ef4444 30%, white)",
          }}
        >
          <div
            className="grid place-items-center h-10 w-10 rounded-xl shrink-0 text-white"
            style={{ background: keyStatus?.present ? "var(--primary)" : "#ef4444" }}
          >
            <KeyRound size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Google Gemini API key
            </div>
            {keyStatus === null ? (
              <div className="text-sm text-muted-foreground">Checking…</div>
            ) : keyStatus.present ? (
              <div className="text-sm font-bold text-foreground">
                Connected · slot {keyStatus.slot}{" "}
                <span className="font-mono text-xs text-muted-foreground">{keyStatus.masked}</span>
              </div>
            ) : (
              <div className="text-sm font-bold text-red-600">No key configured</div>
            )}
          </div>
          <a
            href="/admin/gemini-keys"
            className="btn-chunky !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1 shrink-0"
          >
            {keyStatus?.present ? "Manage" : "Add key"}
          </a>
        </div>


        <div
          className="relative rounded-3xl bg-white border-2 p-6 md:p-8"
          style={{
            borderColor: "color-mix(in oklab, var(--primary) 20%, white)",
            boxShadow: "0 10px 0 color-mix(in oklab, var(--primary) 18%, white)",
          }}
        >
          <div className="space-y-6">
            <Field label="Choose course" icon={<BookOpen size={14} strokeWidth={2.5} />} step={1}>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={selectCls} disabled={busy}>
                <option value="">Choose a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.year ? `Y${c.year} · ` : ""}{c.title}</option>
                ))}
              </select>
            </Field>

            <Field label="Choose section" icon={<Layers size={14} strokeWidth={2.5} />} step={2} disabled={!courseId}>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!courseId || busy} className={selectCls}>
                <option value="">{courseId ? "Choose a section…" : "Pick a course first"}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>

            <Field label="Subject sorting" icon={<Wand2 size={14} strokeWidth={2.5} />} step={3} disabled={!groupId}>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!groupId || busy} className={selectCls}>
                <option value="__auto__">✨ Auto-sort by subject{groupId ? ` (${subjects.length} in section)` : ""}</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <Field label="Choose PDF" icon={<Upload size={14} strokeWidth={2.5} />} step={4}>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                  className="btn-chunky inline-flex items-center gap-2">
                  <Upload size={14} strokeWidth={3} />
                  {file ? "Change PDF" : "Choose PDF"}
                </button>
                <span className="text-sm text-muted-foreground font-medium truncate max-w-[16rem]">
                  {file ? file.name : "no file selected"}
                </span>
              </div>
            </Field>

            <div className="pt-2">
              <button type="button" disabled={!ready} onClick={handleSubmit}
                title="Reads the PDF two pages at a time, then submits each question to Gemini's 50%-off batch API"
                className="btn-chunky btn-chunky--lg inline-flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={3} />}
                {busy ? "working automatically…" : "▶ Start import"}
              </button>
              {progress && (
                <p className="mt-3 text-sm font-bold" style={{ color: "var(--primary)" }}>
                  {progress}
                </p>
              )}
              {runLog.length > 0 && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">What is happening now</div>
                  <ul className="mt-1 space-y-1 text-xs font-semibold text-slate-700">
                    {runLog.map((line, idx) => <li key={`${idx}-${line}`}>{line}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Jobs dashboard */}
        <div className="rounded-3xl bg-white border-2 p-4 md:p-6"
             style={{ borderColor: "color-mix(in oklab, var(--primary) 15%, white)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black">Recent jobs</h2>
            <button onClick={refreshJobs} className="btn-chunky inline-flex items-center gap-1 !py-1 !px-3 text-xs">
              <RefreshCw size={12} strokeWidth={3} /> refresh
            </button>
          </div>
          {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
          <ul className="space-y-3">
            {jobs.map((j) => {
              const isOpen = expanded === j.id;
              const chunks = chunksByJob[j.id] ?? [];
              const stats = summarizeChunks(chunks);
              return (
                <li key={j.id} className="rounded-2xl border-2 p-3"
                    style={{ borderColor: "color-mix(in oklab, var(--primary) 12%, white)" }}>
                  <div className="flex items-center gap-2 justify-between flex-wrap">
                    <button onClick={async () => {
                      const next = isOpen ? null : j.id;
                      setExpanded(next);
                      if (next) await loadChunks(j.id);
                    }} className="text-left flex-1 min-w-0">
                      <div className="font-bold truncate">{j.pdf_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {j.total_pages} pages · {new Date(j.created_at).toLocaleString()}
                        {j.subject_id ? " · fixed subject" : " · auto-sort"}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => pollJob(j.id)}
                        title="Backup button: manually check Gemini if automatic checking stops"
                        className="btn-chunky !py-1 !px-3 text-xs inline-flex items-center gap-1">
                        <RefreshCw size={12} /> backup check
                      </button>
                      <button onClick={() => importAllReady(j.id)}
                        title="Backup button: manually import ready answers if automatic import stops"
                        className="btn-chunky !py-1 !px-3 text-xs inline-flex items-center gap-1">
                        <Download size={12} /> backup import
                      </button>
                      <button onClick={() => removeJob(j.id)} title="Delete this job"
                              className="text-red-600 hover:bg-red-50 p-2 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 space-y-2">
                      {chunks.length > 0 && (() => {
                        const allImported = (stats.imported + stats.noQuestions) === chunks.length && chunks.length > 0;
                        const pagesRead = chunks.length - chunks.filter((c) => c.status === "pending" || c.status === "text" || c.status === "text_failed").length;
                        return (
                          <>
                            {allImported && (
                              <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 px-4 py-3 flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-700" />
                                <span className="font-black text-emerald-800">All done. {stats.totalImported} questions imported.</span>
                              </div>
                            )}
                            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Overall progress</div>
                              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(((stats.imported + stats.noQuestions) / chunks.length) * 100)}%` }} />
                              </div>
                              <div className="mt-2 text-xs text-slate-600">{stats.imported} imported · {stats.noQuestions} no-question chunks skipped · {chunks.length} total chunks</div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <SummaryPill label="pages read" value={pagesRead} tone="blue" />
                              <SummaryPill label="questions found" value={stats.found} tone="emerald" />
                              {stats.noQuestions > 0 && <SummaryPill label="no questions here" value={stats.noQuestions} tone="slate" />}
                              <SummaryPill label="waiting on Gemini" value={stats.waitingQuestions} tone="blue" />
                              <SummaryPill label="ready to import" value={stats.ready} tone="emerald" />
                              <SummaryPill label="imported" value={stats.totalImported} tone="green" />
                              {stats.lowCoverage > 0 && <SummaryPill label="low coverage" value={stats.lowCoverage} tone="amber" />}
                              {stats.needsRetry > 0 && <SummaryPill label="needs retry" value={stats.needsRetry} tone="red" />}
                            </div>
                          </>
                        );
                      })()}
                      {chunks.length === 0 && <p className="text-xs text-muted-foreground">Loading chunks…</p>}
                      {chunks.map((c) => {
                        const local = localByChunk[c.id];
                        const isLowCoverage = c.status === "low_coverage" || Boolean(c.results?.low_coverage);
                        const isNoQuestions = c.status === "empty" && Boolean(c.results?.no_questions);
                        const canRetry = ["failed", "low_coverage", "text_failed"].includes(c.status) || (c.status === "empty" && !isNoQuestions) || isLowCoverage;
                        const previews = local?.previews ?? (Array.isArray(c.results?.previews) ? c.results.previews : []);
                        const foundCount = Number(c.results?.found_count ?? (Array.isArray(c.question_blocks) ? c.question_blocks.length : 0));
                        return (
                          <div key={c.id} className="text-xs rounded-xl bg-slate-50 px-3 py-2 space-y-2">
                            <div className="flex items-center gap-2 justify-between flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <StatusPill status={c.status} />
                                <span className="font-bold whitespace-nowrap">#{c.chunk_index + 1} · pp {c.page_from}–{c.page_to}</span>
                                {foundCount > 0 && <span className="text-emerald-700 whitespace-nowrap">· {foundCount} found</span>}
                                {isNoQuestions && <span className="text-slate-600 whitespace-nowrap">· no questions here</span>}
                                {isLowCoverage && <span className="text-amber-700 whitespace-nowrap">· low coverage</span>}
                                {c.imported_count > 0 && <span className="text-emerald-700 whitespace-nowrap">· {c.imported_count} imported</span>}
                                {local && local.stage !== "queued" && local.stage !== "done" && (
                                  <span className="text-slate-600 truncate">· {local.message}</span>
                                )}
                                {c.error && <span className="text-red-600 truncate" title={c.error}>· {c.error}</span>}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {c.status === "ready" && (
                                  <button onClick={() => importChunk(j.id, c.id)}
                                    className="btn-chunky !py-1 !px-3 text-[11px] inline-flex items-center gap-1">
                                    <Download size={11} /> import
                                  </button>
                                )}
                                {canRetry && (
                                  <button
                                    onClick={() => retryChunkClient(j.id, c.id)}
                                    disabled={!file && !activeFileRef.current}
                                    title={(file || activeFileRef.current) ? "Re-run pure text extraction + submit for this chunk" : "Re-select the PDF file to enable retry"}
                                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed text-amber-900 px-2 py-1 text-[11px] font-black"
                                  >
                                    <RotateCw size={11} /> retry
                                  </button>
                                )}
                              </div>
                            </div>
                            {previews.length > 0 && (
                              <div className="grid gap-1 pl-1">
                                {previews.slice(0, 4).map((p: string, idx: number) => (
                                  <div key={`${c.id}-preview-${idx}`} className="truncate rounded-lg bg-white px-2 py-1 text-[11px] text-slate-600 border border-slate-200">
                                    Q{idx + 1}: {p}
                                  </div>
                                ))}
                                {previews.length > 4 && <div className="text-[10px] font-bold text-slate-500">+{previews.length - 4} more waiting in this chunk</div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Looking for the old flow? It still lives at{" "}
          <a href="/admin/jarvis-batch" className="font-bold underline" style={{ color: "var(--primary)" }}>
            Jarvis Batch (50% off)
          </a>.
        </p>
      </section>
    </div>
  );
}

function summarizeChunks(chunks: ChunkRow[]) {
  const s = { textOk: 0, submitted: 0, ready: 0, imported: 0, failed: 0, empty: 0, noQuestions: 0, textFailed: 0, lowCoverage: 0, totalImported: 0, found: 0, waitingQuestions: 0, needsRetry: 0 };
  for (const c of chunks) {
    const found = Number(c.results?.found_count ?? (Array.isArray(c.question_blocks) ? c.question_blocks.length : 0));
    const isNoQuestions = c.status === "empty" && Boolean(c.results?.no_questions);
    s.found += found || 0;
    if (c.status !== "pending" && c.status !== "text_failed") s.textOk++;
    if (c.status === "awaiting_batch") { s.submitted++; s.waitingQuestions += found || 0; }
    else if (c.status === "ready") s.ready++;
    else if (c.status === "imported") s.imported++;
    else if (c.status === "failed") s.failed++;
    else if (c.status === "empty") { s.empty++; if (isNoQuestions) s.noQuestions++; }
    else if (c.status === "text_failed") s.textFailed++;
    if (c.status === "low_coverage" || Boolean(c.results?.low_coverage)) s.lowCoverage++;
    if (c.status === "failed" || c.status === "text_failed" || (c.status === "empty" && !isNoQuestions)) s.needsRetry++;
    s.totalImported += c.imported_count || 0;
  }
  return s;
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "slate" | "blue" | "emerald" | "green" | "amber" | "red" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
    emerald: "bg-emerald-100 text-emerald-800",
    green: "bg-emerald-200 text-emerald-900",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${tones[tone]}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: "pending", color: "bg-slate-200 text-slate-700", icon: null },
    text: { label: "text", color: "bg-blue-100 text-blue-800", icon: Loader2 },
    submitting: { label: "submitting", color: "bg-blue-100 text-blue-800", icon: Loader2 },
    bookends: { label: "slicing", color: "bg-amber-100 text-amber-800", icon: Loader2 },
    awaiting_batch: { label: "batch running", color: "bg-blue-100 text-blue-800", icon: Loader2 },
    ready: { label: "ready", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
    imported: { label: "imported", color: "bg-emerald-200 text-emerald-900", icon: CheckCircle2 },
    failed: { label: "failed", color: "bg-red-100 text-red-800", icon: AlertCircle },
    empty: { label: "no questions", color: "bg-slate-100 text-slate-500", icon: null },
    text_failed: { label: "text failed", color: "bg-red-100 text-red-800", icon: AlertCircle },
    low_coverage: { label: "low coverage", color: "bg-amber-100 text-amber-800", icon: AlertCircle },
  };
  const m = map[status] ?? { label: status, color: "bg-slate-100 text-slate-700", icon: null };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${m.color}`}>
      {Icon && <Icon size={10} className={["awaiting_batch", "bookends", "text", "submitting"].includes(status) ? "animate-spin" : ""} />}
      {m.label}
    </span>
  );
}

const selectCls =
  "w-full appearance-none rounded-xl border-2 bg-white px-4 py-3 text-sm font-semibold text-foreground outline-none transition disabled:opacity-50 disabled:cursor-not-allowed focus:ring-4";

function Field({
  label, icon, step, disabled, children,
}: {
  label: string; icon: React.ReactNode; step: number; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label className={`block ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black text-white"
              style={{ background: "var(--primary)" }}>{step}</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--primary)" }}>
          {icon}{label}
        </span>
      </div>
      <div className="rounded-xl"
           style={{ ["--tw-ring-color" as any]: "color-mix(in oklab, var(--primary) 20%, white)" } as React.CSSProperties}>
        {children}
      </div>
    </label>
  );
}
