import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap, Upload, BookOpen, Layers, Wand2, Loader2, CheckCircle2,
  AlertCircle, Trash2, KeyRound, X, RefreshCw,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPdfPageCount, getPdfPageTexts, estimateQuestionsInText, clearPdfRenderCache } from "@/lib/pdf-page-render";
import { sliceByBookends, type Bookend } from "@/lib/bookend-slicer";
import {
  createSonicJob, extractSonicBookends, solveSonicQuestion, importSonicQuestion,
  markSonicChunk, markSonicPdf, finishSonicJob,
  listSonicJobs, getSonicJob, deleteSonicJob, getSonicKeyStatus,
} from "@/lib/sonic.functions";

export const Route = createFileRoute("/admin/sonic")({
  head: () => ({
    meta: [
      { title: "Sonic — Immediate PDF Import" },
      { name: "description", content: "Overnight-style immediate PDF import: two pages at a time, questions solved and saved instantly." },
      { property: "og:title", content: "Sonic — Immediate PDF Import" },
      { property: "og:description", content: "Immediate per-question import with pure text extraction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SonicPage,
});

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type Subject = { id: string; name: string; group_id: string };

type PdfSlot = {
  key: string;
  file: File;
  courseId: string;
  groupId: string;
  subjectId: string; // "__auto__" or a uuid
  // discovered async:
  totalPages?: number;
  // filled once run starts:
  pdfId?: string;
  status?: "pending" | "running" | "done" | "failed";
  imported?: number;
  found?: number;
  skipped?: number;
  currentMsg?: string;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}
async function withRetry<T>(fn: () => Promise<T>, tries = 2, baseMs = 1500): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i === tries - 1) break; await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i))); }
  }
  throw last;
}

function SonicPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && (!user || !isAdmin)) guardRedirect(navigate); }, [loading, user, isAdmin, navigate]);

  const [courses, setCourses] = useState<Course[]>([]);
  const groupsCacheRef = useRef<Record<string, Group[]>>({});
  const subjectsCacheRef = useRef<Record<string, Subject[]>>({});
  const [, setBump] = useState(0);
  const forceRerender = () => setBump((n) => n + 1);

  const [pdfs, setPdfs] = useState<PdfSlot[]>([]);
  const [hint, setHint] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const [jobs, setJobs] = useState<any[]>([]);
  const [keyStatus, setKeyStatus] = useState<{ present: boolean; slot?: number; masked?: string } | null>(null);

  const createJobFn = useServerFn(createSonicJob);
  const bookendsFn = useServerFn(extractSonicBookends);
  const solveFn = useServerFn(solveSonicQuestion);
  const importFn = useServerFn(importSonicQuestion);
  const markChunkFn = useServerFn(markSonicChunk);
  const markPdfFn = useServerFn(markSonicPdf);
  const finishJobFn = useServerFn(finishSonicJob);
  const listJobsFn = useServerFn(listSonicJobs);
  const deleteJobFn = useServerFn(deleteSonicJob);
  const keyFn = useServerFn(getSonicKeyStatus);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year,kind").eq("kind", "questions").order("year");
      setCourses((data ?? []) as Course[]);
      refreshJobs();
      refreshKey();
    })();
  }, []);

  async function refreshKey() {
    try { const r: any = await keyFn(); setKeyStatus(r); } catch { setKeyStatus({ present: false }); }
  }
  async function refreshJobs() {
    try { const r: any = await listJobsFn(); setJobs((r?.rows ?? [])); } catch {}
  }

  async function loadGroups(courseId: string) {
    if (groupsCacheRef.current[courseId]) return groupsCacheRef.current[courseId];
    const { data } = await (supabase.from as any)("subject_groups")
      .select("id,course_id,name").eq("course_id", courseId).order("sort_order");
    groupsCacheRef.current[courseId] = (data ?? []) as Group[];
    forceRerender();
    return groupsCacheRef.current[courseId];
  }
  async function loadSubjects(groupId: string) {
    if (subjectsCacheRef.current[groupId]) return subjectsCacheRef.current[groupId];
    const { data } = await (supabase.from as any)("subjects")
      .select("id,group_id,name").eq("group_id", groupId).order("sort_order");
    subjectsCacheRef.current[groupId] = (data ?? []) as Subject[];
    forceRerender();
    return subjectsCacheRef.current[groupId];
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: PdfSlot[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.name.toLowerCase().endsWith(".pdf")) continue;
      next.push({
        key: `${Date.now()}-${i}-${f.name}`,
        file: f,
        courseId: "",
        groupId: "",
        subjectId: "__auto__",
      });
    }
    setPdfs((prev) => [...prev, ...next].slice(0, 20));
    // Read page count in background.
    for (const slot of next) {
      getPdfPageCount(slot.file).then((count) => {
        setPdfs((prev) => prev.map((p) => p.key === slot.key ? { ...p, totalPages: count } : p));
      }).catch(() => {
        setPdfs((prev) => prev.map((p) => p.key === slot.key ? { ...p, totalPages: 0 } : p));
      });
      clearPdfRenderCache();
    }
  }

  function updatePdf(key: string, patch: Partial<PdfSlot>) {
    setPdfs((prev) => prev.map((p) => p.key === key ? { ...p, ...patch } : p));
  }
  function removePdf(key: string) { setPdfs((prev) => prev.filter((p) => p.key !== key)); }

  const canStart = useMemo(() => {
    if (busy || pdfs.length === 0) return false;
    return pdfs.every((p) => p.courseId && p.groupId && (p.totalPages ?? 0) > 0);
  }, [busy, pdfs]);

  function logStep(msg: string) {
    setRunLog((prev) => [msg, ...prev].slice(0, 12));
  }

  async function handleStart() {
    if (!canStart) return;
    setBusy(true);
    abortRef.current = { aborted: false };
    setProgress("Preparing queue…");
    setRunLog(["Starting Sonic queue"]);

    try {
      // Build payload with subject candidates for auto-sort PDFs.
      const payload = await Promise.all(pdfs.map(async (p) => {
        let subjectCandidates: string[] = [];
        if (p.subjectId === "__auto__") {
          const subs = await loadSubjects(p.groupId);
          subjectCandidates = subs.map((s) => s.name);
        }
        return {
          fileName: p.file.name,
          totalPages: p.totalPages || 0,
          courseId: p.courseId,
          groupId: p.groupId,
          subjectId: p.subjectId === "__auto__" ? null : p.subjectId,
          subjectCandidates,
        };
      }));
      const created: any = await createJobFn({
        data: { pdfs: payload, hint: hint.trim() || null, skipDuplicates, autoRetry },
      });
      setCurrentJobId(created.jobId);
      logStep(`Job created with ${created.pdfs.length} PDF${created.pdfs.length === 1 ? "" : "s"}`);

      // Attach pdfId back to slots.
      setPdfs((prev) => prev.map((p) => {
        const match = (created.pdfs as any[]).find((cp) => cp.fileName === p.file.name);
        return match ? { ...p, pdfId: match.pdfId, status: "pending", imported: 0, found: 0, skipped: 0 } : p;
      }));

      // Process each PDF sequentially.
      for (const pdfMeta of created.pdfs) {
        if (abortRef.current.aborted) break;
        const slot = pdfs.find((p) => p.file.name === pdfMeta.fileName);
        if (!slot) continue;

        updatePdf(slot.key, { status: "running", currentMsg: "starting…" });
        await markPdfFn({ data: { pdfId: pdfMeta.pdfId, status: "running", error: null } });
        clearPdfRenderCache();
        // Pre-cache the doc for text extraction (single load per PDF)
        try { await withTimeout(getPdfPageTexts(slot.file, 1, 1), 90_000, `open ${slot.file.name}`); } catch {}

        let subjectCandidates: string[] = [];
        if (slot.subjectId === "__auto__") {
          subjectCandidates = (await loadSubjects(slot.groupId)).map((s) => s.name);
        }

        let pdfImported = 0;
        let pdfFound = 0;
        let pdfSkipped = 0;

        for (const chunk of pdfMeta.chunks) {
          if (abortRef.current.aborted) break;
          const label = `${slot.file.name} · pp ${chunk.pageFrom}–${chunk.pageTo}`;
          setProgress(`${label}: reading text`);
          updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: reading text` });
          try {
            await markChunkFn({ data: { chunkId: chunk.chunkId, status: "text", error: null } });
            let parts: string[] = [];
            try {
              parts = await withTimeout(getPdfPageTexts(slot.file, chunk.pageFrom, chunk.pageTo), 90_000, `${label} text`);
            } catch (e: any) {
              await markChunkFn({ data: { chunkId: chunk.chunkId, status: "failed", error: e?.message?.slice(0, 400) } });
              logStep(`${label}: text extraction failed — ${e?.message || e}`);
              continue;
            }
            const text = parts.join("\n\n--- page break ---\n\n").trim();
            if (text.length < 20) {
              await markChunkFn({ data: { chunkId: chunk.chunkId, status: "empty", chunkText: text, results: { no_questions: true, note: "no readable text" } } });
              updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: no text` });
              continue;
            }
            const est = estimateQuestionsInText(text);
            if (est.expected === 0) {
              await markChunkFn({ data: { chunkId: chunk.chunkId, status: "empty", chunkText: text, results: { no_questions: true, note: "no question markers" } } });
              updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: no questions here — moving on` });
              logStep(`${label}: no questions here`);
              continue;
            }

            // Bookends
            updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: finding boundaries (~${est.expected})` });
            let bookends: Bookend[] = [];
            try {
              const r: any = await withRetry(() => withTimeout(bookendsFn({ data: { chunkId: chunk.chunkId, chunkText: text } }), 90_000, "bookends"), autoRetry ? 2 : 1);
              bookends = (r?.bookends ?? []) as Bookend[];
            } catch (e: any) {
              await markChunkFn({ data: { chunkId: chunk.chunkId, status: "failed", error: e?.message?.slice(0, 400) } });
              logStep(`${label}: bookends failed — ${e?.message || e}`);
              continue;
            }
            const slices = sliceByBookends(text, bookends);
            if (!slices.length) {
              await markChunkFn({ data: { chunkId: chunk.chunkId, status: "empty", chunkText: text, results: { no_questions: true, note: "Gemini found no questions" } } });
              updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: none found — moving on` });
              logStep(`${label}: no questions found`);
              continue;
            }

            pdfFound += slices.length;
            updatePdf(slot.key, { found: pdfFound, currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: found ${slices.length}, solving…` });
            await markChunkFn({
              data: {
                chunkId: chunk.chunkId,
                status: "solving",
                chunkText: text,
                questionBlocks: slices.map((s) => s.text),
                results: { found_count: slices.length, previews: slices.map((s) => s.text.replace(/\s+/g, " ").slice(0, 140)) },
              },
            });

            // Solve + import each question immediately.
            for (let qi = 0; qi < slices.length; qi++) {
              if (abortRef.current.aborted) break;
              const qb = slices[qi].text;
              updatePdf(slot.key, { currentMsg: `pp ${chunk.pageFrom}–${chunk.pageTo}: solving Q${qi + 1}/${slices.length}` });
              setProgress(`${label}: solving Q${qi + 1}/${slices.length}`);
              try {
                const solved: any = await withRetry(
                  () => withTimeout(solveFn({ data: { chunkId: chunk.chunkId, question: qb, subjectCandidates, hint: hint.trim() || null } }), 90_000, "solve"),
                  autoRetry ? 2 : 1,
                );
                const imp: any = await withTimeout(importFn({
                  data: { pdfId: pdfMeta.pdfId, chunkId: chunk.chunkId, solved: solved.solved, skipDuplicates },
                }), 60_000, "import");
                if (imp.inserted) {
                  pdfImported++;
                } else {
                  pdfSkipped++;
                }
                updatePdf(slot.key, { imported: pdfImported, skipped: pdfSkipped });
              } catch (e: any) {
                pdfSkipped++;
                updatePdf(slot.key, { skipped: pdfSkipped });
                logStep(`${label} Q${qi + 1}: ${e?.message || e}`);
              }
            }

            await markChunkFn({ data: { chunkId: chunk.chunkId, status: "done", results: { found_count: slices.length, imported_here: pdfImported } } });
            logStep(`${label}: ${slices.length} found, running total ${pdfImported} imported`);
          } catch (e: any) {
            const msg = e?.message?.slice(0, 400) || String(e);
            try { await markChunkFn({ data: { chunkId: chunk.chunkId, status: "failed", error: msg } }); } catch {}
            logStep(`${label}: failed — ${msg}`);
          }
        }

        await markPdfFn({ data: { pdfId: pdfMeta.pdfId, status: "done", error: null } });
        updatePdf(slot.key, { status: "done", currentMsg: `finished · ${pdfImported} imported` });
        logStep(`${slot.file.name}: finished — ${pdfImported} imported, ${pdfFound} found, ${pdfSkipped} skipped`);
      }

      await finishJobFn({ data: { jobId: created.jobId, status: abortRef.current.aborted ? "cancelled" : "done" } });
      setProgress(abortRef.current.aborted ? "Stopped." : "All PDFs finished!");
      if (!abortRef.current.aborted) toast.success("Sonic queue complete");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
      setProgress(`Error: ${e?.message || "failed"}`);
    } finally {
      setBusy(false);
      refreshJobs();
    }
  }

  function stopQueue() {
    abortRef.current.aborted = true;
    setProgress("Stopping after the current question…");
  }

  async function removeJob(jobId: string) {
    if (!confirm("Delete this job?")) return;
    await deleteJobFn({ data: { jobId } });
    refreshJobs();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="pt-28 pb-8 md:pt-32 md:pb-10">
        <div className="mx-auto max-w-4xl px-4 md:px-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border-2 border-indigo-300 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700"
                style={{ boxShadow: "0 3px 0 #c7d2fe" }}>
            <Zap size={12} strokeWidth={3} /> sonic · immediate import
          </span>
          <h1 className="mt-6 font-display font-black leading-[1.05] tracking-tight lowercase" style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}>
            sonic overnight batch.
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            queue multiple PDFs, each with its own course and section. Sonic reads 2 pages at a time, solves each question with Gemini right away, and imports it before the next page — no waiting on batch APIs.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 md:px-8 pb-24 space-y-6">
        {/* Key status */}
        <div className="rounded-2xl bg-white border-2 p-4 flex items-center gap-3"
             style={{ borderColor: keyStatus?.present ? "#c7d2fe" : "#fecaca" }}>
          <div className="grid place-items-center h-10 w-10 rounded-xl text-white shrink-0"
               style={{ background: keyStatus?.present ? "#6366f1" : "#ef4444" }}>
            <KeyRound size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Google Gemini API key</div>
            {keyStatus === null ? <div className="text-sm text-muted-foreground">Checking…</div>
              : keyStatus.present ? <div className="text-sm font-bold">Connected · slot {keyStatus.slot} <span className="font-mono text-xs text-muted-foreground">{keyStatus.masked}</span></div>
              : <div className="text-sm font-bold text-red-600">No key configured</div>}
          </div>
          <a href="/admin/ai-keys" className="btn-chunky !py-1.5 !px-3 text-[11px]">{keyStatus?.present ? "Manage" : "Add key"}</a>
        </div>

        {/* Setup */}
        <div className="rounded-3xl bg-white border-2 border-indigo-200 p-6 space-y-5" style={{ boxShadow: "0 10px 0 #e0e7ff" }}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-[11px] font-black uppercase tracking-widest text-indigo-700 mb-1.5">Model</div>
              <div className="rounded-xl bg-indigo-50 border-2 border-indigo-200 px-3 py-2 text-sm font-semibold">
                Gemini 2.5 Flash-Lite (free · immediate)
              </div>
            </label>
            <label className="block">
              <div className="text-[11px] font-black uppercase tracking-widest text-indigo-700 mb-1.5">Optional hint</div>
              <input value={hint} onChange={(e) => setHint(e.target.value)} disabled={busy}
                     placeholder="e.g. Cardiology exam, prefer Egyptian conventions"
                     className="w-full rounded-xl border-2 bg-white px-3 py-2 text-sm font-medium" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} disabled={busy} />
              Skip duplicate questions
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoRetry} onChange={(e) => setAutoRetry(e.target.checked)} disabled={busy} />
              Auto-retry failed pages
            </label>
          </div>
        </div>

        {/* PDFs list */}
        <div className="rounded-3xl bg-white border-2 border-indigo-200 p-6 space-y-4" style={{ boxShadow: "0 10px 0 #e0e7ff" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-black">PDFs in queue ({pdfs.length}/20)</h2>
            <label className="btn-chunky inline-flex items-center gap-2 cursor-pointer">
              <Upload size={14} strokeWidth={3} />
              Add PDFs
              <input type="file" accept="application/pdf" multiple className="hidden"
                     onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} disabled={busy} />
            </label>
          </div>
          {pdfs.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-indigo-200 py-12 text-center text-sm text-muted-foreground">
              No PDFs yet. Click <b>Add PDFs</b> to select one or more files.
            </div>
          )}
          <ul className="space-y-3">
            {pdfs.map((p) => {
              const groups = p.courseId ? groupsCacheRef.current[p.courseId] ?? [] : [];
              const subjects = p.groupId ? subjectsCacheRef.current[p.groupId] ?? [] : [];
              return (
                <li key={p.key} className="rounded-2xl border-2 border-indigo-100 p-3 space-y-2 bg-indigo-50/30">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{p.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.totalPages === undefined ? "reading page count…" : p.totalPages > 0 ? `${p.totalPages} pages` : "could not read pages"}
                        {p.status && <> · <span className="font-bold text-indigo-700">{p.status}</span></>}
                        {typeof p.imported === "number" && <> · {p.imported} imported</>}
                        {typeof p.found === "number" && p.found > 0 && <> · {p.found} found</>}
                        {typeof p.skipped === "number" && p.skipped > 0 && <> · {p.skipped} skipped</>}
                      </div>
                      {p.currentMsg && (
                        <div className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                          {p.status === "running" && <Loader2 size={11} className="animate-spin text-indigo-600" />}
                          {p.status === "done" && <CheckCircle2 size={11} className="text-emerald-600" />}
                          {p.currentMsg}
                        </div>
                      )}
                    </div>
                    {!busy && (
                      <button onClick={() => removePdf(p.key)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Remove">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <select value={p.courseId} disabled={busy}
                            onChange={async (e) => {
                              updatePdf(p.key, { courseId: e.target.value, groupId: "", subjectId: "__auto__" });
                              if (e.target.value) await loadGroups(e.target.value);
                            }}
                            className={selectCls}>
                      <option value="">Course…</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.year ? `Y${c.year} · ` : ""}{c.title}</option>)}
                    </select>
                    <select value={p.groupId} disabled={busy || !p.courseId}
                            onChange={async (e) => {
                              updatePdf(p.key, { groupId: e.target.value, subjectId: "__auto__" });
                              if (e.target.value) await loadSubjects(e.target.value);
                            }}
                            className={selectCls}>
                      <option value="">{p.courseId ? "Section…" : "pick course first"}</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <select value={p.subjectId} disabled={busy || !p.groupId}
                            onChange={(e) => updatePdf(p.key, { subjectId: e.target.value })}
                            className={selectCls}>
                      <option value="__auto__">✨ Auto-sort ({subjects.length} subjects)</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button onClick={handleStart} disabled={!canStart}
                    className="btn-chunky btn-chunky--lg inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#6366f1", color: "white", boxShadow: "0 6px 0 #4338ca" }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} strokeWidth={3} />}
              {busy ? "running…" : "▶ Start queue"}
            </button>
            {busy && (
              <button onClick={stopQueue} className="btn-chunky inline-flex items-center gap-2 !bg-red-100 !text-red-800">
                Stop after current question
              </button>
            )}
            {progress && (
              <p className="text-sm font-bold text-indigo-700">{progress}</p>
            )}
          </div>

          {runLog.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Live log</div>
              <ul className="mt-1 space-y-1 text-xs font-semibold text-slate-700 max-h-48 overflow-auto">
                {runLog.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Recent jobs */}
        <div className="rounded-3xl bg-white border-2 p-4 md:p-6" style={{ borderColor: "#e0e7ff" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black">Recent Sonic jobs</h2>
            <button onClick={refreshJobs} className="btn-chunky !py-1 !px-3 text-xs inline-flex items-center gap-1">
              <RefreshCw size={12} strokeWidth={3} /> refresh
            </button>
          </div>
          {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-xl border-2 border-indigo-100 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">Job {j.id.slice(0, 8)} · {j.status}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(j.created_at).toLocaleString()} · model {j.model}{j.hint ? ` · hint: ${String(j.hint).slice(0, 60)}` : ""}
                  </div>
                </div>
                <button onClick={() => removeJob(j.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const selectCls =
  "w-full appearance-none rounded-xl border-2 bg-white px-3 py-2 text-sm font-semibold text-foreground outline-none disabled:opacity-50 disabled:cursor-not-allowed";
