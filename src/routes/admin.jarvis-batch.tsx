import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  MoonStar, Upload, Loader2, RefreshCw, Trash2, CheckCircle2, AlertCircle, Download, FileText, Brain, ListChecks,
} from "lucide-react";
import {
  submitJarvisBatch, listJarvisBatchJobs, pollJarvisBatch, ingestJarvisBatch, deleteJarvisBatch,
  submitClassifierBatch, ingestClassifierBatch, importReviewedQuestions,
} from "@/lib/jarvis-batch.functions";
import { extractBookends } from "@/lib/jarvis-pdf.functions";
import { sliceByBookends } from "@/lib/bookend-slicer";
import { loadPdfForRender, getPageText, estimateQuestionsInText } from "@/lib/pdf-page-render";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/jarvis-batch")({
  component: JarvisBatchPage,
});

type Subject = { id: string; name: string; group_id?: string };
type Group = { id: string; name: string; course_id: string };
type Course = { id: string; title: string; year?: number | null };

function JarvisBatchPage() {
  const callSubmit = useServerFn(submitJarvisBatch);
  const callList = useServerFn(listJarvisBatchJobs);
  const callPoll = useServerFn(pollJarvisBatch);
  const callIngest = useServerFn(ingestJarvisBatch);
  const callDelete = useServerFn(deleteJarvisBatch);
  const callExtractBookends = useServerFn(extractBookends);
  const callSubmitClassifier = useServerFn(submitClassifierBatch);
  const callIngestClassifier = useServerFn(ingestClassifierBatch);
  const callImportReviewed = useServerFn(importReviewedQuestions);

  const [courses, setCourses] = useState<Course[]>([]);
  const [groupsByCourse, setGroupsByCourse] = useState<Record<string, Group[]>>({});
  const [subjectsByGroup, setSubjectsByGroup] = useState<Record<string, Subject[]>>({});
  const [courseId, setCourseId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("__auto__");
  const [twoPass, setTwoPass] = useState<boolean>(false);
  const [hint, setHint] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [reviewOpen, setReviewOpen] = useState<Record<string, boolean>>({});
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, Record<string, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    const { data } = await (supabase.from as any)("courses")
      .select("id,title,year,kind").eq("kind", "questions").order("year");
    setCourses((data ?? []) as Course[]);
    refreshJobs();
  })(); }, []);

  useEffect(() => { (async () => {
    if (!courseId || groupsByCourse[courseId]) return;
    const { data } = await (supabase.from as any)("subject_groups")
      .select("id,course_id,name").eq("course_id", courseId).order("sort_order");
    setGroupsByCourse((m) => ({ ...m, [courseId]: (data ?? []) as Group[] }));
  })(); }, [courseId]);

  useEffect(() => { (async () => {
    if (!groupId || subjectsByGroup[groupId]) return;
    const { data } = await (supabase.from as any)("subjects")
      .select("id,group_id,name").eq("group_id", groupId).order("sort_order");
    setSubjectsByGroup((m) => ({ ...m, [groupId]: (data ?? []) as Subject[] }));
  })(); }, [groupId]);

  const groups = groupsByCourse[courseId] ?? [];
  const subjects = subjectsByGroup[groupId] ?? [];

  async function refreshJobs() {
    try {
      const r: any = await callList();
      setJobs(r.rows ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed to load jobs"); }
  }

  const autoSort = subjectId === "__auto__";
  const subjectCandidates = useMemo(
    () => autoSort ? subjects.map((s) => s.name) : undefined,
    [autoSort, subjects],
  );

  async function onSubmit() {
    if (!file) { toast.error("Pick a PDF first"); return; }
    if (autoSort) {
      if (!courseId || !groupId) { toast.error("Pick a course and section for auto-sort"); return; }
      if (subjects.length === 0) { toast.error("This section has no subjects yet"); return; }
    } else if (!subjectId) { toast.error("Pick a subject (or Auto-sort)"); return; }
    setBusy("Reading PDF…"); setProgress(null);
    try {
      const pdfDoc = await loadPdfForRender(file);
      const totalPages = pdfDoc.numPages;
      const CHUNK_PAGES = 4;
      const chunks: { s: number; e: number }[] = [];
      for (let p = 1; p <= totalPages; p += CHUNK_PAGES) chunks.push({ s: p, e: Math.min(totalPages, p + CHUNK_PAGES - 1) });

      const allSlices: { text: string }[] = [];
      let totalQuestions = 0, chunksDone = 0;
      setProgress({ done: 0, total: chunks.length });

      async function runRange(startPage: number, endPage: number, depth = 0): Promise<void> {
        let chunkText = "";
        let expected = 0;
        for (let p = startPage; p <= endPage; p++) {
          const t = await getPageText(pdfDoc, p).catch(() => "");
          if (t) {
            chunkText += (chunkText ? "\n\n" : "") + t;
            expected += estimateQuestionsInText(t).expected;
          }
        }
        if (chunkText.trim().length < 80) return;
        try {
          const be: any = await callExtractBookends({ data: {
            chunkText: chunkText.slice(0, 200_000),
            startPage, endPage, hint: hint.trim() || undefined,
          } as any });
          const bookends = be?.bookends ?? [];
          // Under-coverage retry: halve when AI returns < 80% of estimated count.
          const minAcceptable = Math.max(1, Math.floor(expected * 0.8));
          const underCovered = expected > 0 && bookends.length < minAcceptable;
          if ((bookends.length === 0 || underCovered) && depth < 2 && endPage > startPage) {
            const mid = Math.floor((startPage + endPage) / 2);
            await runRange(startPage, mid, depth + 1);
            await runRange(mid + 1, endPage, depth + 1);
            return;
          }
          const slices = sliceByBookends(chunkText, bookends);
          for (const s of slices) {
            if (s.text && s.text.length >= 5) { allSlices.push({ text: s.text }); totalQuestions++; }
          }
        } catch (e: any) { console.warn("Bookend chunk failed", { startPage, endPage }, e?.message); }
      }

      const PARALLEL = 6;
      const queue = chunks.slice();
      async function worker() {
        while (queue.length) {
          const c = queue.shift()!;
          await runRange(c.s, c.e);
          chunksDone++;
          setBusy(`Bookend extraction ${chunksDone}/${chunks.length} chunks · ${totalQuestions} questions found`);
          setProgress({ done: chunksDone, total: chunks.length });
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, () => worker()));

      if (allSlices.length === 0) { toast.error("No questions detected in this PDF."); setBusy(""); return; }

      const BATCH_SIZE = 100;
      const batches: { text: string }[][] = [];
      for (let i = 0; i < allSlices.length; i += BATCH_SIZE) batches.push(allSlices.slice(i, i + BATCH_SIZE));

      const mode = autoSort && twoPass ? "two_pass" : "single";
      setBusy(`Submitting ${batches.length} batch job(s) to Gemini (${mode})…`);
      let submitted = 0;
      for (let i = 0; i < batches.length; i++) {
        await callSubmit({ data: {
          pdfName: `${file.name}${batches.length > 1 ? ` (part ${i + 1}/${batches.length})` : ""}`,
          subjectId: autoSort ? null : subjectId,
          autoSort, mode,
          subjectCandidates, hint: hint.trim() || undefined,
          slices: batches[i],
        } as any });
        submitted++;
      }
      toast.success(`Submitted ${submitted} batch(es) with ${allSlices.length} questions. Click Refresh later.`);
      setFile(null); if (fileRef.current) fileRef.current.value = "";
      refreshJobs();
    } catch (e: any) { toast.error(e?.message || "Submission failed"); }
    finally { setBusy(""); setProgress(null); }
  }

  async function onPoll(jobId: string) {
    try { const r: any = await callPoll({ data: { jobId } as any }); toast.success(`State: ${r.state} (${r.kind})`); refreshJobs(); }
    catch (e: any) { toast.error(e?.message || "Poll failed"); }
  }
  async function onIngest(jobId: string) {
    setBusy("Importing solver results…");
    try {
      const r: any = await callIngest({ data: { jobId } as any });
      toast.success(`Imported ${r.inserted}, queued ${r.queued} for review (${r.failed} failed)`);
      refreshJobs();
    } catch (e: any) { toast.error(e?.message || "Ingest failed"); }
    finally { setBusy(""); }
  }
  async function onSubmitClassifier(jobId: string) {
    setBusy("Submitting classifier batch…");
    try {
      const r: any = await callSubmitClassifier({ data: { jobId } as any });
      toast.success(`Classifier submitted (${r.count} questions). Refresh later.`);
      refreshJobs();
    } catch (e: any) { toast.error(e?.message || "Classifier submit failed"); }
    finally { setBusy(""); }
  }
  async function onIngestClassifier(jobId: string) {
    setBusy("Loading classifier results…");
    try {
      const r: any = await callIngestClassifier({ data: { jobId } as any });
      toast.success(`Classifier returned ${r.classified} suggestions. Review and import below.`);
      refreshJobs();
    } catch (e: any) { toast.error(e?.message || "Classifier ingest failed"); }
    finally { setBusy(""); }
  }
  async function onImportReviewed(jobId: string) {
    setBusy("Importing reviewed questions…");
    try {
      const overrides = reviewOverrides[jobId] || {};
      const r: any = await callImportReviewed({ data: { jobId, overrides } as any });
      toast.success(`Imported ${r.inserted}, ${r.remaining} still need review`);
      setReviewOverrides((m) => { const { [jobId]: _, ...rest } = m; return rest; });
      refreshJobs();
    } catch (e: any) { toast.error(e?.message || "Import failed"); }
    finally { setBusy(""); }
  }
  async function onDelete(jobId: string) {
    if (!confirm("Delete this batch job record?")) return;
    try { await callDelete({ data: { jobId } as any }); refreshJobs(); }
    catch (e: any) { toast.error(e?.message || "Delete failed"); }
  }

  function setOverride(jobId: string, key: string, subjectId: string) {
    setReviewOverrides((m) => ({ ...m, [jobId]: { ...(m[jobId] || {}), [key]: subjectId } }));
  }

  function ReviewPanel({ job }: { job: any }) {
    const pending: any[] = Array.isArray(job.pending_review) ? job.pending_review : [];
    const candidates: string[] = Array.isArray(job.slice_map)
      ? (job.slice_map.find((x: any) => Array.isArray(x?.subjectCandidates))?.subjectCandidates ?? [])
      : [];
    // We need ids for the dropdown. Use subjects in state if present; else fetch on demand.
    const [idsByName, setIdsByName] = useState<Record<string, string>>({});
    useEffect(() => { (async () => {
      if (candidates.length === 0) return;
      const { data } = await (supabase.from as any)("subjects").select("id,name").in("name", candidates);
      const m: Record<string, string> = {};
      for (const s of (data ?? [])) m[s.name] = s.id;
      setIdsByName(m);
    })(); }, [job.id]);

    return (
      <div className="mt-3 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.04] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-indigo-200">
            <ListChecks className="inline w-3.5 h-3.5 mr-1" />
            Review {pending.length} classification(s)
          </div>
          <button
            onClick={() => onImportReviewed(job.id)}
            disabled={!!busy}
            className="text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-2.5 py-1 font-semibold text-black"
          >
            Import with picks
          </button>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {pending.map((p) => {
            const suggestedName = (p.suggested_index && p.suggested_index >= 1 && p.suggested_index <= candidates.length)
              ? candidates[p.suggested_index - 1] : "";
            const currentOverride = reviewOverrides[job.id]?.[p.key];
            const currentValue = currentOverride ?? (suggestedName ? (idsByName[suggestedName] || "") : "");
            const confColor = p.confidence === "high" ? "text-emerald-300"
              : p.confidence === "medium" ? "text-amber-300"
              : p.confidence === "pending" ? "text-white/50" : "text-rose-300";
            return (
              <div key={p.key} className="rounded-md border border-white/10 bg-black/30 p-2">
                <div className="text-[12px] text-white/80 line-clamp-2">{p.preview || p.prompt?.slice(0, 120)}</div>
                <div className="text-[11px] text-white/50 mt-1">
                  <span className="text-white/70">{p.concept_tag || "—"}</span>
                  {" · "}
                  <span className={confColor}>conf: {p.confidence}</span>
                  {p.reason && <> {" · "} <i className="text-white/50">"{p.reason}"</i></>}
                  {suggestedName && <> {" · "} suggested: <b className="text-indigo-200">{suggestedName}</b></>}
                </div>
                <select
                  value={currentValue}
                  onChange={(e) => setOverride(job.id, p.key, e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs"
                >
                  <option value="" className="bg-zinc-900">— skip (don't import) —</option>
                  {candidates.map((name) => {
                    const id = idsByName[name];
                    return id ? <option key={id} value={id} className="bg-zinc-900">{name}</option> : null;
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <MoonStar className="text-indigo-300" />
          <h1 className="text-2xl font-bold">Jarvis Batch — 50% off (async)</h1>
        </div>
        <p className="text-sm text-white/60 mb-6">
          Uses Gemini's Batch API (Gemini Flash-Lite (latest)). Subject picking is now <b>index-based</b> — Gemini returns a number from your subject list, so spelling or case mismatches can't break it.
        </p>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
          <h2 className="font-semibold mb-3">1. Submit a new batch</h2>

          <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">PDF file</label>
          <input ref={fileRef} type="file" accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2 text-sm font-semibold">
              <Upload className="w-4 h-4" /> Choose PDF
            </button>
            <span className="text-xs text-white/60">{file ? file.name : "No PDF selected"}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Course</label>
              <select value={courseId}
                onChange={(e) => { setCourseId(e.target.value); setGroupId(""); setSubjectId("__auto__"); }}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm">
                <option value="" className="bg-zinc-900">— select a course —</option>
                {courses.map((c) => <option key={c.id} value={c.id} className="bg-zinc-900">{c.year ? `Y${c.year} · ` : ""}{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Section</label>
              <select value={groupId}
                onChange={(e) => { setGroupId(e.target.value); setSubjectId("__auto__"); }}
                disabled={!courseId}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm disabled:opacity-50">
                <option value="" className="bg-zinc-900">{courseId ? "— select a section —" : "pick course first"}</option>
                {groups.map((g) => <option key={g.id} value={g.id} className="bg-zinc-900">{g.name}</option>)}
              </select>
            </div>
          </div>

          <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Subject</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!groupId}
            className={`w-full rounded-lg border px-3 py-2 text-sm mb-3 disabled:opacity-50 ${autoSort ? "border-fuchsia-400 bg-fuchsia-500/10" : "border-white/15 bg-black/40"}`}>
            <option value="__auto__" className="bg-zinc-900">🪄 Auto-sort by subject ({subjects.length || "all"} subjects in section)</option>
            {subjects.map((s) => <option key={s.id} value={s.id} className="bg-zinc-900">{s.name}</option>)}
          </select>

          {autoSort && groupId && (
            <label className="flex items-start gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/[0.06] px-3 py-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={twoPass} onChange={(e) => setTwoPass(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-indigo-100">
                <Brain className="inline w-3.5 h-3.5 mr-1" />
                <b>High-accuracy classification (2 batches)</b>
                <span className="block text-indigo-200/70 mt-0.5">
                  Solver writes the explanation first; a second dedicated classifier batch then picks the subject from your list with full attention. Slower (2 async waits) and slightly more credits, but far better sorting.
                </span>
              </span>
            </label>
          )}

          <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Hint (optional)</label>
          <input type="text" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Cardiology MCQs"
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm mb-4" />

          <button onClick={onSubmit} disabled={!file || !!busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2 font-semibold">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy || "Submit batch"}
          </button>
          {progress && <span className="ml-3 text-xs text-white/60">Chunk {progress.done}/{progress.total}</span>}

          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/70 leading-relaxed">
            <b className="text-white/90">Pipeline</b>
            <ol className="list-decimal pl-5 mt-1 space-y-1">
              <li>Browser reads PDF text locally (free).</li>
              <li>Bookend phase finds question boundaries (cheap).</li>
              <li>Each question is sliced locally — no extra tokens.</li>
              <li>Solver batch processes everything (50% off, async).</li>
              <li>If two-pass: classifier batch picks subjects with full attention.</li>
              <li>Anything Gemini isn't confident about → manual review panel below.</li>
            </ol>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">2. Your batch jobs</h2>
            <button onClick={refreshJobs} className="inline-flex items-center gap-2 text-xs rounded-md border border-white/15 hover:bg-white/5 px-3 py-1.5">
              <RefreshCw className="w-3 h-3" /> Refresh list
            </button>
          </div>
          {jobs.length === 0 && <p className="text-sm text-white/50">No jobs yet.</p>}
          <div className="space-y-3">
            {jobs.map((j) => {
              const created = new Date(j.created_at).toLocaleString();
              const ageMin = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60000);
              const isSolverDone = j.status === "succeeded";
              const isIngested = j.status === "ingested";
              const isFailed = j.status === "failed" || j.status === "expired" || j.status === "cancelled";
              const needsReview = j.status === "needs_review";
              const classifying = j.status === "classifying";
              const count = Array.isArray(j.slice_map) ? j.slice_map.length : 0;
              const pendingCount = Array.isArray(j.pending_review) ? j.pending_review.length : 0;
              const isTwoPass = j.mode === "two_pass";
              const classifierDone = j.classifier_status === "succeeded";
              const classifierPending = isTwoPass && j.classifier_batch_id && !classifierDone;
              const open = !!reviewOpen[j.id];
              return (
                <div key={j.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono text-sm truncate">
                        <FileText className="w-4 h-4 text-white/50 shrink-0" /> {j.pdf_name}
                      </div>
                      <div className="text-[11px] text-white/50 mt-0.5">
                        {created} · {ageMin}min ago · {count} questions · {j.auto_sort ? "🪄 auto-sort" : "fixed subject"}
                        {isTwoPass && <span className="ml-1 text-indigo-300">· 2-pass</span>}
                      </div>
                      {j.last_error && <div className="mt-1 text-[11px] text-rose-300/90 break-words">⚠ {j.last_error.slice(0, 200)}</div>}
                      {j.result_summary && (
                        <div className="mt-1 text-[11px] text-emerald-300">
                          ✓ Imported {j.result_summary.inserted ?? 0}
                          {(j.result_summary.queued ?? 0) > 0 && <> · queued {j.result_summary.queued}</>}
                          {(j.result_summary.failed ?? 0) > 0 && <> · failed {j.result_summary.failed}</>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={"text-[11px] rounded-full px-2 py-0.5 border " + (
                        isIngested ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : needsReview ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        : classifying ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-200"
                        : isSolverDone ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                        : isFailed ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                        : "border-white/15 bg-white/5 text-white/70")}>{j.status}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!isIngested && (
                      <button onClick={() => onPoll(j.id)} className="inline-flex items-center gap-1.5 text-xs rounded-md border border-white/15 hover:bg-white/5 px-2.5 py-1">
                        <RefreshCw className="w-3 h-3" /> Check status
                      </button>
                    )}
                    {isSolverDone && !isTwoPass && (
                      <button onClick={() => onIngest(j.id)} className="inline-flex items-center gap-1.5 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 font-semibold text-black">
                        <Download className="w-3 h-3" /> Import (auto + queue rest)
                      </button>
                    )}
                    {isSolverDone && isTwoPass && !j.classifier_batch_id && (
                      <button onClick={() => onSubmitClassifier(j.id)} className="inline-flex items-center gap-1.5 text-xs rounded-md bg-indigo-500 hover:bg-indigo-400 px-2.5 py-1 font-semibold">
                        <Brain className="w-3 h-3" /> Submit classifier batch
                      </button>
                    )}
                    {classifierPending && (
                      <span className="inline-flex items-center gap-1 text-xs text-indigo-300">
                        <Loader2 className="w-3 h-3 animate-spin" /> classifier: {j.classifier_status}
                      </span>
                    )}
                    {classifierDone && pendingCount === 0 && (
                      <button onClick={() => onIngestClassifier(j.id)} className="inline-flex items-center gap-1.5 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 font-semibold text-black">
                        <Download className="w-3 h-3" /> Load classifier results
                      </button>
                    )}
                    {pendingCount > 0 && (
                      <button onClick={() => setReviewOpen((m) => ({ ...m, [j.id]: !open }))}
                        className="inline-flex items-center gap-1.5 text-xs rounded-md border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-2.5 py-1 text-amber-200 font-semibold">
                        <ListChecks className="w-3 h-3" /> {open ? "Hide" : "Review"} {pendingCount}
                      </button>
                    )}
                    {isIngested && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Imported</span>}
                    {isFailed && <span className="inline-flex items-center gap-1 text-xs text-rose-300"><AlertCircle className="w-3 h-3" /> {j.status}</span>}
                    <button onClick={() => onDelete(j.id)} className="ml-auto inline-flex items-center gap-1.5 text-xs rounded-md border border-white/15 hover:bg-white/5 px-2.5 py-1 text-rose-300">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                  {open && pendingCount > 0 && <ReviewPanel job={j} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
