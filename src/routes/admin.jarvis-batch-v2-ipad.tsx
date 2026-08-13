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
import { estimateQuestionsInText, loadPdfForRender, loadPdfForRenderPreferWorker, clearPdfRenderCache } from "@/lib/pdf-page-render";
import { renderPageToCanvas, canvasToJpegBase64, cropRegionToJpegBase64, base64ToBlob, type CutRegion } from "@/lib/pdf-page-image";
import { splitPdfInto2PageBlobs, miniPdfAsFile, type MiniPdf } from "@/lib/pdf-split";
import { sliceByBookends, sliceByNumbers, type Bookend } from "@/lib/bookend-slicer";
import {
  createJobV2Ipad, extractBookendsV2Ipad, submitChunkV2Ipad, markChunkV2Ipad, retryChunkV2Ipad,
  pollChunkV2Ipad, importChunkV2Ipad, listJobsV2Ipad, getJobV2Ipad, deleteJobV2Ipad,
  getGeminiKeyStatusV2Ipad, extractPagesTextV2Ipad,
} from "@/lib/jarvis-batch-v2-ipad.functions";
import {
  createImageJobIpad, cutPageImageIpad, submitImageChunkIpad, importImageChunkIpad,
} from "@/lib/jarvis-image-ipad.functions";

const QUESTION_IMAGE_BUCKET = "question-images";



export const Route = createFileRoute("/admin/jarvis-batch-v2-ipad")({
  head: () => ({
    meta: [
      { title: "Jarvis Batch v2 iPad — PDF Import" },
      { name: "description", content: "iPad-safe admin PDF import. Pre-splits the PDF into 2-page pieces so Safari never hangs while opening large documents." },
      { property: "og:title", content: "Jarvis Batch v2 iPad — PDF Import" },
      { property: "og:description", content: "Pre-split, chunked PDF question extraction that runs on iPad Safari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JarvisBatchV2Ipad,
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

type LocalStage = "queued" | "text" | "bookends" | "slicing" | "submitting" | "done" | "skipped" | "error";
type LocalStatus = {
  stage: LocalStage;
  expected: number;
  sliced: number;
  message?: string;
  previews?: string[];
};

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
      const delay = baseMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
      // eslint-disable-next-line no-console
      console.warn(`[${label}] retry ${i + 1}/${tries - 1} after: ${msg.slice(0, 200)}`);
    }
  }
  throw lastErr;
}

function expandImageQuestionRegions(regions: CutRegion[]): CutRegion[] {
  const clamp = (value: number) => Math.max(0, Math.min(1000, Number.isFinite(value) ? value : 0));
  const cleaned = regions
    .map((r, index) => {
      const yTop = clamp(Math.min(Number(r.y_top), Number(r.y_bottom)));
      const yBottom = clamp(Math.max(Number(r.y_top), Number(r.y_bottom)));
      const xLeft = clamp(Math.min(Number(r.x_left ?? 0), Number(r.x_right ?? 1000)));
      const xRight = clamp(Math.max(Number(r.x_left ?? 0), Number(r.x_right ?? 1000)));
      return { ...r, y_top: yTop, y_bottom: yBottom, x_left: xLeft, x_right: xRight, index };
    })
    .filter((r) => r.y_bottom - r.y_top >= 12 && (r.x_right ?? 1000) - (r.x_left ?? 0) >= 80);

  const hasLeft = cleaned.some((r) => (((r.x_left ?? 0) + (r.x_right ?? 1000)) / 2) < 430 && ((r.x_right ?? 1000) - (r.x_left ?? 0)) < 650);
  const hasRight = cleaned.some((r) => (((r.x_left ?? 0) + (r.x_right ?? 1000)) / 2) > 570 && ((r.x_right ?? 1000) - (r.x_left ?? 0)) < 650);
  const twoColumn = hasLeft && hasRight && cleaned.length >= 4;

  const grouped = new Map<string, typeof cleaned>();
  for (const r of cleaned) {
    const center = ((r.x_left ?? 0) + (r.x_right ?? 1000)) / 2;
    const key = twoColumn ? (center < 500 ? "left" : "right") : "full";
    const rows = grouped.get(key) ?? [];
    rows.push(r);
    grouped.set(key, rows);
  }

  const expanded = new Map<number, CutRegion>();
  for (const [key, rows] of grouped) {
    const sorted = rows.slice().sort((a, b) => a.y_top - b.y_top);
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const prev = sorted[i - 1];
      const next = sorted[i + 1];
      const topLimit = prev ? clamp(prev.y_bottom + 6) : 0;
      const bottomLimit = next ? clamp(next.y_top - 10) : 1000;
      let yTop = clamp(Math.max(topLimit, r.y_top - 165));
      let yBottom = clamp(Math.min(bottomLimit, Math.max(r.y_bottom + 210, yTop + 125)));
      if (yBottom - yTop < 80) {
        yTop = clamp(Math.max(topLimit, r.y_top - 95));
        yBottom = clamp(Math.min(bottomLimit, r.y_bottom + 125));
      }

      const center = ((r.x_left ?? 0) + (r.x_right ?? 1000)) / 2;
      const xLeft = key === "full" ? 0 : center < 500 ? 0 : 470;
      const xRight = key === "full" ? 1000 : center < 500 ? 530 : 1000;
      expanded.set(r.index, { ...r, y_top: yTop, y_bottom: yBottom, x_left: xLeft, x_right: xRight });
    }
  }

  return cleaned
    .map((r) => expanded.get(r.index))
    .filter((r): r is CutRegion => Boolean(r));
}

function JarvisBatchV2Ipad() {
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
  type QueueItem = {
    key: string;
    file: File;
    status: "queued" | "processing" | "submitted" | "error";
    jobId?: string;
    error?: string;
    stageNote?: string;
  };
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const [runLog, setRunLog] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunksByJob, setChunksByJob] = useState<Record<string, ChunkRow[]>>({});
  const [localByChunk, setLocalByChunk] = useState<Record<string, LocalStatus>>({});
  // Per-chunk mini-PDF cache (iPad-safe). We split the whole PDF once and then
  // feed pdf.js tiny 2-page files so Safari never has to parse a big document.
  const activeFileRef = useRef<File | null>(null);
  const miniPdfsRef = useRef<Record<number, File>>({}); // by chunk_index
  const miniPdfByChunkIdRef = useRef<Record<string, File>>({}); // by chunkId
  const chunkTextCacheRef = useRef<Record<string, string>>({});
  // Jobs created by IMAGE mode in this session (so Check/Import/Retry use the image pipeline).
  const imageJobIdsRef = useRef<Record<string, boolean>>({});


  const [keyStatus, setKeyStatus] = useState<{ present: boolean; slot?: number; masked?: string } | null>(null);
  const [splitProgress, setSplitProgress] = useState<{ done: number; total: number } | null>(null);

  const createJobFn = useServerFn(createJobV2Ipad);
  const extractBookendsFn = useServerFn(extractBookendsV2Ipad);
  const submitChunkFn = useServerFn(submitChunkV2Ipad);
  const markChunkFn = useServerFn(markChunkV2Ipad);
  const retryChunkFn = useServerFn(retryChunkV2Ipad);
  const pollChunkFn = useServerFn(pollChunkV2Ipad);
  const importChunkFn = useServerFn(importChunkV2Ipad);
  const listJobsFn = useServerFn(listJobsV2Ipad);
  const getJobFn = useServerFn(getJobV2Ipad);
  const deleteJobFn = useServerFn(deleteJobV2Ipad);
  const keyStatusFn = useServerFn(getGeminiKeyStatusV2Ipad);
  const extractPagesFn = useServerFn(extractPagesTextV2Ipad);
  const createImageJobFn = useServerFn(createImageJobIpad);
  const cutPageFn = useServerFn(cutPageImageIpad);
  const submitImageChunkFn = useServerFn(submitImageChunkIpad);
  const importImageChunkFn = useServerFn(importImageChunkIpad);

  function patchLocal(chunkId: string, patch: Partial<LocalStatus>) {
    setLocalByChunk((prev) => {
      const base: LocalStatus = prev[chunkId] || { stage: "queued", expected: 0, sliced: 0 };
      return { ...prev, [chunkId]: { ...base, ...patch } };
    });
  }

  function logStep(message: string) {
    setRunLog((prev) => [message, ...prev].slice(0, 8));
  }

  /** An image-mode job: created here in this session, marked with 🖼, or any chunk in image mode. */
  function isImageJob(jobId: string): boolean {
    if (imageJobIdsRef.current[jobId]) return true;
    const job = jobs.find((j) => j.id === jobId);
    if (job?.pdf_name?.startsWith("🖼")) return true;
    return (chunksByJob[jobId] || []).some((c) => c?.results?.mode === "image");
  }


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

  const ready = useMemo(() => Boolean(courseId && groupId && queue.length > 0 && !busy), [courseId, groupId, queue, busy]);

  function updateQueueItem(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }
  function addFilesToQueue(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    const additions: QueueItem[] = list.map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: "queued",
    }));
    setQueue((prev) => [...prev, ...additions]);
  }
  function moveQueue(key: string, dir: -1 | 1) {
    setQueue((prev) => {
      const idx = prev.findIndex((q) => q.key === key);
      if (idx < 0) return prev;
      const swap = idx + dir;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function removeQueue(key: string) {
    setQueue((prev) => prev.filter((q) => q.key !== key));
  }


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

  // Send the pre-split 2-page mini PDF to the server, which extracts pure
  // selectable text via pdfjs. iPad Safari never has to parse PDFs itself.
  async function getChunkText(chunk: { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number }): Promise<{ text: string; pageTexts: string[] }> {
    const cached = chunkTextCacheRef.current[chunk.chunkId];
    if (cached) return { text: cached, pageTexts: cached.split("\n\n--- page break ---\n\n") };
    const miniFile = miniPdfByChunkIdRef.current[chunk.chunkId] || miniPdfsRef.current[chunk.chunkIndex];
    if (!miniFile) throw new Error("Re-select the PDF first so we can split it into small pieces.");
    const buf = await miniFile.arrayBuffer();
    // Chunked base64 encode to keep the main thread responsive on iPad.
    const bytes = new Uint8Array(buf);
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)) as any);
    }
    const pdfBase64 = btoa(binary);
    const r: any = await withRetry(
      () => withTimeout(extractPagesFn({ data: { pdfBase64 } }), 45_000, `pages ${chunk.pageFrom}–${chunk.pageTo} text`),
      2, 1200, "extract-pages",
    );
    const parts: string[] = Array.isArray(r?.pages) ? r.pages.map((s: any) => String(s || "")) : [];
    const text = parts.join("\n\n--- page break ---\n\n").trim();
    chunkTextCacheRef.current[chunk.chunkId] = text;
    return { text, pageTexts: parts };
  }

  async function bookendAndSlice(chunkId: string, text: string): Promise<{ text: string }[]> {
    const r: any = await withRetry(
      () => withTimeout(extractBookendsFn({ data: { chunkId, chunkText: text } }), 90_000, "bookends"),
      3, 1500, "bookends",
    );
    const bookends: Bookend[] = (r?.bookends ?? []) as Bookend[];
    return sliceByBookends(text, bookends);
  }

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

      const threshold = Math.max(2, Math.ceil(est.expected * 0.8));
      if (est.expected >= 2 && slices.length < threshold) {
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
          } catch { /* ignore */ }
        }
        // Local no-AI numbered fallback: scoop up anything the AI still missed.
        const numbered = sliceByNumbers(chunkText);
        const seen = new Set<string>();
        const combined = [...slices, ...merged, ...numbered].filter((s) => {
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

  // ---------------- IMAGE MODE (equations / diagrams) ----------------
  // One PDF page at a time: render -> Gemini marks where each question sits ->
  // we crop those bands into images -> upload -> Gemini batch solves the image.
  async function processOnePageImage(
    jobId: string,
    chunk: { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number },
    miniDocFor: (pageNumber: number) => Promise<{ doc: any; pageInDoc: number }>,
  ): Promise<boolean> {
    const { chunkId } = chunk;
    let canvas: HTMLCanvasElement | null = null;
    try {
      patchLocal(chunkId, { stage: "text", message: `opening page ${chunk.pageFrom}` });
      logStep(`Page ${chunk.pageFrom}: opening`);
      await markChunkFn({ data: { chunkId, status: "text", error: null } });

      // Opening the PDF can hang on iPad Safari — always bound it.
      const { doc, pageInDoc } = await withTimeout(
        miniDocFor(chunk.pageFrom), 60_000, `page ${chunk.pageFrom} open`,
      );
      patchLocal(chunkId, { message: `rendering page ${chunk.pageFrom}` });
      canvas = await withTimeout(renderPageToCanvas(doc, pageInDoc, 1200), 60_000, `page ${chunk.pageFrom} render`);
      const pageB64 = canvasToJpegBase64(canvas, 0.68);

      patchLocal(chunkId, { stage: "bookends", message: "asking Gemini where each question is" });
      const cut: any = await withRetry(
        () => withTimeout(cutPageFn({ data: { chunkId, imageBase64: pageB64 } }), 120_000, `page ${chunk.pageFrom} cut`),
        2, 1500, "cut",
      );
      const rawRegions: CutRegion[] = (cut?.regions ?? []) as CutRegion[];
      const regions = expandImageQuestionRegions(rawRegions);


      if (!regions.length) {
        await markChunkFn({
          data: {
            chunkId, status: "empty", error: null,
            results: { mode: "image", expected_count: 0, found_count: 0, no_questions: true, note: "No questions on this page — moving on." },
          },
        });
        patchLocal(chunkId, { stage: "skipped", expected: 0, sliced: 0, message: "no questions on this page" });
        logStep(`Page ${chunk.pageFrom}: no questions here`);
        await loadChunks(jobId);
      return true;
      }

      patchLocal(chunkId, { stage: "slicing", sliced: regions.length, message: `cutting ${regions.length} question image${regions.length === 1 ? "" : "s"}` });
      const crops: { path: string; base64: string; label: string }[] = [];
      for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        let b64: string;
        if (!canvas) throw new Error("Page canvas was released before cropping");
        try { b64 = cropRegionToJpegBase64(canvas, r, { padding: 14, quality: 0.8 }); } catch { continue; }
        const path = `${jobId}/p${chunk.pageFrom}-q${i + 1}-${Date.now()}.jpg`;
        patchLocal(chunkId, { message: `uploading picture ${i + 1}/${regions.length}` });
        const { error: upErr } = await withTimeout(
          supabase.storage.from(QUESTION_IMAGE_BUCKET)
            .upload(path, base64ToBlob(b64), { contentType: "image/jpeg", upsert: true }),
          60_000, `upload picture ${i + 1}`,
        );
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        crops.push({ path, base64: b64, label: `${r.label || `Q${i + 1}`} · ${path}` });
      }
      if (!crops.length) throw new Error("Every crop on this page failed");

      patchLocal(chunkId, { stage: "submitting", sliced: crops.length, message: `sending ${crops.length} question image${crops.length === 1 ? "" : "s"} to Gemini` });
      await withRetry(
        () => withTimeout(submitImageChunkFn({ data: { chunkId, crops } }), 180_000, "submit images"),
        2, 2000, "submit-images",
      );

      patchLocal(chunkId, {
        stage: "done", sliced: crops.length,
        previews: crops.map((c) => `${c.label} · image question`),
        message: `submitted ${crops.length}`,
      });
      setProgress(`Page ${chunk.pageFrom}: ${crops.length} question image${crops.length === 1 ? "" : "s"} sent to Gemini.`);
      logStep(`Page ${chunk.pageFrom}: sent ${crops.length} question images`);
      await loadChunks(jobId);
      return true;
    } catch (e: any) {
      const msg = e?.message?.slice(0, 400) || String(e).slice(0, 400);
      try { await markChunkFn({ data: { chunkId, status: "failed", error: msg } }); } catch {}
      patchLocal(chunkId, { stage: "error", message: msg });
      logStep(`Page ${chunk.pageFrom}: failed — ${msg}`);
      await loadChunks(jobId);
      return false;
    } finally {
      // Free the page bitmap right away so iPad memory does not grow page to page.
      if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
    }
  }


  async function processOneFileImageMode(file: File): Promise<string> {
    setProgress(`Image mode · splitting ${file.name} into small pieces (iPad safe)…`);
    setRunLog([`Splitting ${file.name}`]);
    miniPdfsRef.current = {};
    miniPdfByChunkIdRef.current = {};
    activeFileRef.current = file;
    setLocalByChunk({});
    setSplitProgress({ done: 0, total: 0 });
    clearPdfRenderCache();

    const mini: MiniPdf[] = await withTimeout(
      splitPdfInto2PageBlobs(file, (done, total) => {
        setSplitProgress({ done, total });
        setProgress(`Splitting ${file.name}: ${done}/${total} pieces ready`);
      }, 1),
      180_000,
      "PDF split",
    );
    if (!mini.length) throw new Error("PDF appears empty after splitting.");
    const totalPages = mini.reduce((sum, m) => sum + (m.pageTo - m.pageFrom + 1), 0);
    for (const m of mini) miniPdfsRef.current[m.chunkIndex] = miniPdfAsFile(m, file.name);
    logStep(`Split ${file.name}: ${totalPages} pages`);

    const subjectCandidates = subjectId === "__auto__" ? subjects.map((s) => s.name) : [];
    const created: any = await createImageJobFn({
      data: {
        courseId, groupId,
        subjectId: subjectId === "__auto__" ? null : subjectId,
        pdfName: file.name, totalPages, subjectCandidates,
      },
    });
    const jobId = created.jobId as string;
    const chunks = created.chunks as { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number }[];
    imageJobIdsRef.current[jobId] = true;
    for (const c of chunks) {
      const m = miniPdfsRef.current[c.pageFrom - 1];
      if (m) miniPdfByChunkIdRef.current[c.chunkId] = m;
    }

    const initLocal: Record<string, LocalStatus> = {};
    for (const c of chunks) initLocal[c.chunkId] = { stage: "queued", expected: 0, sliced: 0 };
    setLocalByChunk(initLocal);

    await refreshJobs();
    setExpanded(jobId);
    await loadChunks(jobId);

    // Map an absolute page number onto the 2-page mini PDF that holds it.
    const miniDocFor = async (pageNumber: number) => {
      const miniIdx = pageNumber - 1;
      const f = miniPdfsRef.current[miniIdx];
      if (!f) throw new Error("Re-select the PDF so we can split it again.");
      const doc = await loadPdfForRenderPreferWorker(f);
      return { doc, pageInDoc: 1 };
    };


    setProgress(`${file.name}: image mode, one page at a time…`);
    let failedPages = 0;
    for (const c of chunks) {
      const ok = await processOnePageImage(jobId, c, miniDocFor);
      if (!ok) failedPages++;
    }
    clearPdfRenderCache();
    const finalChunks = await loadChunks(jobId);
    const stats = summarizeChunks(finalChunks);
    if (failedPages || stats.needsRetry) {
      setProgress(`${file.name}: finished what I could. ${stats.found} picture question(s) sent, ${stats.needsRetry || failedPages} page(s) need retry.`);
      logStep(`${file.name}: ${stats.needsRetry || failedPages} page(s) need retry`);
    } else {
      setProgress(`${file.name}: all page pictures submitted to Gemini batch.`);
      logStep(`${file.name}: submitted to Gemini`);
    }
    return jobId;
  }

  // Process one file: split, submit chunks to Gemini batch. Returns jobId so
  // the caller can poll it in the background after the local phase is done.
  // We deliberately do NOT call autoFinishJob here — that keeps the server
  // free to start the next queued PDF while Gemini answers in the cloud.
  async function processOneFile(file: File): Promise<string> {
    setProgress(`Splitting ${file.name} into small 2-page pieces (iPad safe)…`);
    setRunLog([`Splitting ${file.name}`]);
    chunkTextCacheRef.current = {};
    miniPdfsRef.current = {};
    miniPdfByChunkIdRef.current = {};
    activeFileRef.current = file;
    setLocalByChunk({});
    setSplitProgress({ done: 0, total: 0 });

    const baseName = file.name;
    const mini: MiniPdf[] = await withTimeout(
      splitPdfInto2PageBlobs(file, (done, total) => {
        setSplitProgress({ done, total });
        setProgress(`Splitting ${file.name}: ${done}/${total} pieces ready`);
      }),
      180_000,
      "PDF split",
    );
    if (!mini.length) throw new Error("PDF appears empty after splitting.");
    const totalPages = mini.reduce((sum, m) => sum + (m.pageTo - m.pageFrom + 1), 0);
    for (const m of mini) miniPdfsRef.current[m.chunkIndex] = miniPdfAsFile(m, baseName);
    logStep(`Split ${file.name}: ${mini.length} pieces · ${totalPages} pages`);

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

    for (const c of chunks) {
      const m = miniPdfsRef.current[c.chunkIndex];
      if (m) miniPdfByChunkIdRef.current[c.chunkId] = m;
    }
    const initLocal: Record<string, LocalStatus> = {};
    for (const c of chunks) initLocal[c.chunkId] = { stage: "queued", expected: 0, sliced: 0 };
    setLocalByChunk(initLocal);

    await refreshJobs();
    setExpanded(jobId);
    await loadChunks(jobId);

    setProgress(`${file.name}: processing ${chunks.length} pieces, two pages at a time…`);
    await runPool(chunks, 1, async (c) => {
      await processChunk(jobId, c);
    });

    setProgress(`${file.name}: all pages submitted to Gemini batch.`);
    logStep(`${file.name}: submitted to Gemini`);
    return jobId;
  }

  async function handleStartQueue() {
    if (!queue.length || !groupId) return;
    setBusy(true);
    const submittedJobIds: string[] = [];
    try {
      for (const item of queue) {
        if (item.status === "submitted" || item.status === "processing") continue;
        updateQueueItem(item.key, { status: "processing", error: undefined, stageNote: "splitting + extracting" });
        try {
          const jobId = imageMode ? await processOneFileImageMode(item.file) : await processOneFile(item.file);
          updateQueueItem(item.key, { status: "submitted", jobId, stageNote: "waiting on Gemini" });
          submittedJobIds.push(jobId);
        } catch (e: any) {
          updateQueueItem(item.key, { status: "error", error: e?.message || "failed" });
          logStep(`${item.file.name} failed: ${e?.message || "error"}`);
        }
      }
      // Every PDF has been handed to Gemini batch. Now poll each job in
      // the background so the admin sees answers stream in automatically.
      setProgress("All PDFs handed to Gemini. Polling for answers in the background…");
      for (const jobId of submittedJobIds) {
        // fire-and-forget; autoFinishJob has its own timeout loop
        autoFinishJob(jobId).catch(() => {});
      }
    } finally {
      setBusy(false);
      setSplitProgress(null);
      await refreshJobs();
    }
  }


  async function retryChunkClient(jobId: string, chunkId: string) {
    const meta = (chunksByJob[jobId] || []).find((c) => c.id === chunkId);
    if (!meta) return;
    const hasMini = Boolean(miniPdfByChunkIdRef.current[chunkId] || miniPdfsRef.current[meta.chunk_index]);
    if (!hasMini) {
      toast.error("Re-select the PDF and press Start so we can split it again for iPad.");
      return;
    }
    try {
      await retryChunkFn({ data: { chunkId } });
      delete chunkTextCacheRef.current[chunkId];
      await loadChunks(jobId);
      if (isImageJob(jobId)) {
        const miniDocFor = async (pageNumber: number) => {
          const f = miniPdfByChunkIdRef.current[chunkId] || miniPdfsRef.current[pageNumber - 1] || miniPdfsRef.current[Math.floor((pageNumber - 1) / 2)];
          if (!f) throw new Error("Re-select the PDF so we can split it again.");
          const doc = await loadPdfForRenderPreferWorker(f);
          return { doc, pageInDoc: Number(doc.numPages || 0) === 1 ? 1 : ((pageNumber - 1) % 2) + 1 };
        };
        await processOnePageImage(jobId, {
          chunkId, chunkIndex: meta.chunk_index, pageFrom: meta.page_from, pageTo: meta.page_to,
        }, miniDocFor);
      } else {
        await processChunk(jobId, {
          chunkId, chunkIndex: meta.chunk_index, pageFrom: meta.page_from, pageTo: meta.page_to,
        });
      }
      toast.success(isImageJob(jobId) ? `Page ${meta.page_from} retried` : `Chunk ${meta.chunk_index + 1} retried`);
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    }
  }

  async function pollJob(jobId: string) {
    await pollAndImportReady(jobId, false);
  }

  async function importChunk(jobId: string, chunkId: string) {
    const meta = (chunksByJob[jobId] || []).find((c) => c.id === chunkId);
    const isImage = meta?.results?.mode === "image" || isImageJob(jobId);
    try {
      const r = isImage ? await importImageChunkFn({ data: { chunkId } }) : await importChunkFn({ data: { chunkId } });

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
      try {
        if (c.results?.mode === "image" || isImageJob(jobId)) await importImageChunkFn({ data: { chunkId: c.id } });
        else await importChunkFn({ data: { chunkId: c.id } });
        ok++;
      } catch { fail++; }
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
        if (c.results?.mode === "image" || isImageJob(jobId)) await importImageChunkFn({ data: { chunkId: c.id } });
        else await importChunkFn({ data: { chunkId: c.id } });
        imported++;
      } catch { /* leave ready */ }
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
          toast.success("Jarvis Batch v2 iPad is done");
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
            iPad safe · v2 · pre-split · gemini batch 50% off
          </span>
          <h1
            className="mt-6 font-display font-black text-foreground leading-[1.05] tracking-tight lowercase"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}
          >
            jarvis batch v2 iPad.
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            same 50%-off batch pipeline as v2, but the PDF is split into 2-page pieces first so iPad Safari never has to open a big document.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 md:px-8 pb-24 space-y-8">
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
            <div
              className="rounded-2xl border-2 p-4 flex items-start gap-3"
              style={{
                borderColor: imageMode ? "color-mix(in oklab, #7c3aed 35%, white)" : "color-mix(in oklab, var(--primary) 18%, white)",
                background: imageMode ? "color-mix(in oklab, #7c3aed 6%, white)" : "white",
              }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={imageMode}
                disabled={busy}
                onClick={() => setImageMode((v) => !v)}
                className="mt-0.5 relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: imageMode ? "#7c3aed" : "#cbd5e1" }}
              >
                <span
                  className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
                  style={{ left: imageMode ? "1.65rem" : "0.25rem" }}
                />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-black">
                  {imageMode ? "Image mode (equations & diagrams)" : "Pure text mode (default)"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {imageMode
                    ? "Each page is cut into question pictures. The student sees the exact printed question with its equations and picks A/B/C/D. Slower and costs more — use it for physics/chemistry/maths papers."
                    : "Reads selectable text only. Fastest and cheapest — use it for normal medical MCQ PDFs. Turn the switch on for exams with equations, fractions or figures."}
                </p>
              </div>
            </div>

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

            <Field label="Choose PDFs" icon={<Upload size={14} strokeWidth={2.5} />} step={4}>
              <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden"
                onChange={(e) => { addFilesToQueue(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                  className="btn-chunky inline-flex items-center gap-2">
                  <Upload size={14} strokeWidth={3} />
                  {queue.length ? "Add more PDFs" : "Choose PDFs"}
                </button>
                <span className="text-sm text-muted-foreground font-medium">
                  {queue.length === 0 ? "no files selected" : `${queue.length} file${queue.length === 1 ? "" : "s"} queued`}
                </span>
              </div>
              {queue.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {queue.map((q, i) => {
                    const tone =
                      q.status === "processing" ? "bg-blue-50 border-blue-200" :
                      q.status === "submitted" ? "bg-emerald-50 border-emerald-200" :
                      q.status === "error" ? "bg-red-50 border-red-200" :
                      "bg-slate-50 border-slate-200";
                    return (
                      <li key={q.key} className={`rounded-xl border-2 px-3 py-2 flex items-center gap-2 ${tone} transition-all`}>
                        <span className="grid place-items-center h-7 w-7 rounded-full text-white text-xs font-black shrink-0"
                              style={{ background: "var(--primary)" }}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate">{q.file.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {(q.file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                            {q.status === "queued" && "waiting in line"}
                            {q.status === "processing" && (q.stageNote || "processing on our server…")}
                            {q.status === "submitted" && (q.stageNote || "sent to Gemini — answers coming")}
                            {q.status === "error" && (q.error || "failed")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => moveQueue(q.key, -1)} disabled={busy || i === 0}
                            className="grid place-items-center h-7 w-7 rounded-lg border border-slate-300 bg-white disabled:opacity-30" aria-label="Move up">
                            <span aria-hidden>↑</span>
                          </button>
                          <button type="button" onClick={() => moveQueue(q.key, 1)} disabled={busy || i === queue.length - 1}
                            className="grid place-items-center h-7 w-7 rounded-lg border border-slate-300 bg-white disabled:opacity-30" aria-label="Move down">
                            <span aria-hidden>↓</span>
                          </button>
                          <button type="button" onClick={() => removeQueue(q.key)} disabled={busy || q.status === "processing"}
                            className="grid place-items-center h-7 w-7 rounded-lg border border-red-200 bg-white text-red-600 disabled:opacity-30" aria-label="Remove">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Field>

            <div className="pt-2">
              <button type="button" disabled={!ready} onClick={handleStartQueue}
                title="Processes each queued PDF one at a time on our server, sends it to Gemini's 50%-off batch API, then starts the next PDF."
                className="btn-chunky btn-chunky--lg inline-flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={3} />}
                {busy ? "working through the queue…" : queue.length > 1 ? `▶ Start queue (${queue.length} PDFs)` : "▶ Start import"}
              </button>

              {splitProgress && splitProgress.total > 0 && (
                <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Splitting PDF (iPad safe)</div>
                  <div className="mt-1 h-2 rounded-full bg-blue-200 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((splitProgress.done / splitProgress.total) * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-blue-900 font-semibold">{splitProgress.done} / {splitProgress.total} pieces ready</div>
                </div>
              )}
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
              const imgJob = isImageJob(j.id);
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
                        {imgJob ? "image mode · " : "text mode · "}
                        {j.total_pages} pages · {new Date(j.created_at).toLocaleString()}
                        {j.subject_id ? " · fixed subject" : " · auto-sort"}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => pollJob(j.id)}
                        title={imgJob
                          ? "Backup: ask Gemini if the question pictures are solved yet"
                          : "Backup button: manually check Gemini if automatic checking stops"}
                        className="btn-chunky !py-1 !px-3 text-xs inline-flex items-center gap-1">
                        <RefreshCw size={12} /> {imgJob ? "check pictures" : "backup check"}
                      </button>
                      <button onClick={() => importAllReady(j.id)}
                        title={imgJob
                          ? "Backup: import the solved question pictures into the course"
                          : "Backup button: manually import ready answers if automatic import stops"}
                        className="btn-chunky !py-1 !px-3 text-xs inline-flex items-center gap-1">
                        <Download size={12} /> {imgJob ? "import pictures" : "backup import"}
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
                        const chunkIsImage = imgJob || c.results?.mode === "image";
                        const canRetry = ["failed", "low_coverage", "text_failed"].includes(c.status) || (c.status === "empty" && !isNoQuestions) || isLowCoverage || (chunkIsImage && c.status === "pending" && local?.stage === "error");
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
                                {c.error && <span className="text-red-600 whitespace-normal break-words" title={c.error}>· {c.error}</span>}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {c.status === "ready" && (
                                  <button onClick={() => importChunk(j.id, c.id)}
                                    className="btn-chunky !py-1 !px-3 text-[11px] inline-flex items-center gap-1">
                                    <Download size={11} /> {chunkIsImage ? "import picture" : "import"}
                                  </button>
                                )}
                                {canRetry && (
                                  <button
                                    onClick={() => retryChunkClient(j.id, c.id)}
                                    disabled={!miniPdfByChunkIdRef.current[c.id] && !miniPdfsRef.current[c.chunk_index]}
                                    title={(miniPdfByChunkIdRef.current[c.id] || miniPdfsRef.current[c.chunk_index])
                                      ? chunkIsImage ? "Re-render this page, cut question pictures, and submit again" : "Re-run pure text extraction + submit for this chunk"
                                      : "Re-select the PDF and press Start to enable retry"}
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
          Desktop version:{" "}
          <a href="/admin/jarvis-batch-v2" className="font-bold underline" style={{ color: "var(--primary)" }}>
            Jarvis Batch v2
          </a>
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
