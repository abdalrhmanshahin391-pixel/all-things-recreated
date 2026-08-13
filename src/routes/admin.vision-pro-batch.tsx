import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Upload, RefreshCw, Trash2, Loader2, KeyRound, RotateCw, Download, ScanEye } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadPdfForRenderPreferWorker, clearPdfRenderCache } from "@/lib/pdf-page-render";
import { renderPageToCanvas, canvasToJpegBase64, cropRegionToJpegBase64, base64ToBlob, type CutRegion } from "@/lib/pdf-page-image";
import { splitPdfInto2PageBlobs, miniPdfAsFile, type MiniPdf } from "@/lib/pdf-split";
import {
  markChunkV2Ipad, retryChunkV2Ipad, pollChunkV2Ipad, listJobsV2Ipad, getJobV2Ipad,
  deleteJobV2Ipad, getGeminiKeyStatusV2Ipad,
} from "@/lib/jarvis-batch-v2-ipad.functions";
import {
  createImageJobIpad, cutPageImageIpad, submitImageChunkIpad, importImageChunkIpad,
} from "@/lib/jarvis-image-ipad.functions";

const QUESTION_IMAGE_BUCKET = "question-images";
/** Marker written into pdf_name so this page only ever lists its own jobs. */
const VP_TAG = "VP·";

export const Route = createFileRoute("/admin/vision-pro-batch")({
  head: () => ({
    meta: [
      { title: "Vision Pro Batch 50% — AquaQBank Admin" },
      { name: "description", content: "Advanced vision import: every exam page is cut into question pictures and solved through the Gemini batch API at half price." },
      { property: "og:title", content: "Vision Pro Batch 50% — AquaQBank Admin" },
      { property: "og:description", content: "Cut scanned exam pages into question images and solve them with the 50%-off Gemini batch pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisionProBatch,
});

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type Subject = { id: string; name: string; group_id: string };

type ChunkRow = {
  id: string; chunk_index: number; page_from: number; page_to: number;
  status: string; batch_id: string | null; imported_count: number; error: string | null;
  results: any; question_blocks?: string[] | null;
};
type JobRow = { id: string; pdf_name: string; total_pages: number; subject_id: string | null; status: string; created_at: string };
type PageState = { stage: string; message?: string; cut: number };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}
async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 1500): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i === tries - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

/** Widen the Gemini bands a little so stems + all options land inside one crop. */
function expandRegions(regions: CutRegion[]): CutRegion[] {
  const clamp = (v: number) => Math.max(0, Math.min(1000, Number.isFinite(v) ? v : 0));
  const cleaned = regions
    .map((r, index) => {
      const yTop = clamp(Math.min(Number(r.y_top), Number(r.y_bottom)));
      const yBottom = clamp(Math.max(Number(r.y_top), Number(r.y_bottom)));
      const xLeft = clamp(Math.min(Number(r.x_left ?? 0), Number(r.x_right ?? 1000)));
      const xRight = clamp(Math.max(Number(r.x_left ?? 0), Number(r.x_right ?? 1000)));
      return { ...r, y_top: yTop, y_bottom: yBottom, x_left: xLeft, x_right: xRight, index };
    })
    .filter((r) => r.y_bottom - r.y_top >= 12 && (r.x_right ?? 1000) - (r.x_left ?? 0) >= 80)
    .sort((a, b) => a.y_top - b.y_top);

  return cleaned.map((r, i) => {
    const prev = cleaned[i - 1];
    const next = cleaned[i + 1];
    const topLimit = prev ? clamp(prev.y_bottom + 6) : 0;
    const bottomLimit = next ? clamp(next.y_top - 10) : 1000;
    const yTop = clamp(Math.max(topLimit, r.y_top - 150));
    const yBottom = clamp(Math.min(bottomLimit, Math.max(r.y_bottom + 190, yTop + 120)));
    return { ...r, y_top: yTop, y_bottom: yBottom, x_left: 0, x_right: 1000 } as CutRegion;
  });
}

function summarize(chunks: ChunkRow[]) {
  const s = { pages: chunks.length, cut: 0, waiting: 0, ready: 0, imported: 0, importedCount: 0, needsRetry: 0, skipped: 0 };
  for (const c of chunks) {
    s.cut += Number(c.results?.found_count ?? 0);
    if (c.status === "awaiting_batch" || c.status === "submitting") s.waiting++;
    else if (c.status === "ready") s.ready++;
    else if (c.status === "imported") s.imported++;
    else if (c.status === "empty") s.skipped++;
    else if (c.status === "failed" || c.status === "text_failed") s.needsRetry++;
    s.importedCount += c.imported_count || 0;
  }
  return s;
}

function VisionProBatch() {
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
  const [subjectId, setSubjectId] = useState("__auto__");

  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [runLog, setRunLog] = useState<string[]>([]);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunksByJob, setChunksByJob] = useState<Record<string, ChunkRow[]>>({});
  const [pageState, setPageState] = useState<Record<string, PageState>>({});
  const [keyStatus, setKeyStatus] = useState<{ present: boolean; slot?: number; masked?: string } | null>(null);

  const miniByChunkId = useRef<Record<string, File>>({});
  const miniByPage = useRef<Record<number, File>>({});

  const createJobFn = useServerFn(createImageJobIpad);
  const cutPageFn = useServerFn(cutPageImageIpad);
  const submitFn = useServerFn(submitImageChunkIpad);
  const importFn = useServerFn(importImageChunkIpad);
  const markChunkFn = useServerFn(markChunkV2Ipad);
  const retryChunkFn = useServerFn(retryChunkV2Ipad);
  const pollChunkFn = useServerFn(pollChunkV2Ipad);
  const listJobsFn = useServerFn(listJobsV2Ipad);
  const getJobFn = useServerFn(getJobV2Ipad);
  const deleteJobFn = useServerFn(deleteJobV2Ipad);
  const keyStatusFn = useServerFn(getGeminiKeyStatusV2Ipad);

  function log(msg: string) { setRunLog((prev) => [msg, ...prev].slice(0, 10)); }
  function patchPage(chunkId: string, patch: Partial<PageState>) {
    setPageState((prev) => ({ ...prev, [chunkId]: { ...(prev[chunkId] || { stage: "queued", cut: 0 }), ...patch } }));
  }

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year,kind").eq("kind", "questions").order("year");
      setCourses((data ?? []) as Course[]);
    })();
    refreshJobs();
    (async () => {
      try { setKeyStatus(await keyStatusFn() as any); } catch { setKeyStatus({ present: false }); }
    })();
  }, []);

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

  async function refreshJobs() {
    try {
      const r: any = await listJobsFn();
      const rows = ((r?.rows ?? []) as JobRow[]).filter((j) => (j.pdf_name || "").includes(VP_TAG));
      setJobs(rows);
    } catch { /* silent */ }
  }

  async function loadChunks(jobId: string): Promise<ChunkRow[]> {
    const r: any = await getJobFn({ data: { jobId } });
    const chunks = (r.chunks ?? []) as ChunkRow[];
    setChunksByJob((prev) => ({ ...prev, [jobId]: chunks }));
    return chunks;
  }

  const ready = useMemo(() => Boolean(courseId && groupId && file && !busy), [courseId, groupId, file, busy]);

  // ---- one page: render -> Gemini finds question bands -> crop -> upload -> batch submit
  async function processPage(
    jobId: string,
    chunk: { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number },
  ): Promise<boolean> {
    const { chunkId } = chunk;
    let canvas: HTMLCanvasElement | null = null;
    try {
      patchPage(chunkId, { stage: "reading", message: `opening page ${chunk.pageFrom}` });
      await markChunkFn({ data: { chunkId, status: "text", error: null } });

      const mini = miniByChunkId.current[chunkId] || miniByPage.current[chunk.pageFrom];
      if (!mini) throw new Error("Re-select the PDF so it can be split again.");
      const doc = await withTimeout(loadPdfForRenderPreferWorker(mini), 60_000, `page ${chunk.pageFrom} open`);

      patchPage(chunkId, { stage: "rendering", message: `rendering page ${chunk.pageFrom}` });
      canvas = await withTimeout(renderPageToCanvas(doc, 1, 1200), 60_000, `page ${chunk.pageFrom} render`);
      const pageB64 = canvasToJpegBase64(canvas, 0.68);

      patchPage(chunkId, { stage: "cutting", message: "asking Gemini where each question sits" });
      const cut: any = await withRetry(() => withTimeout(cutPageFn({ data: { chunkId, imageBase64: pageB64 } }), 120_000, `page ${chunk.pageFrom} cut`), 2, 1500);
      const regions = expandRegions((cut?.regions ?? []) as CutRegion[]);

      if (!regions.length) {
        await markChunkFn({
          data: {
            chunkId, status: "empty", error: null,
            results: { mode: "image", expected_count: 0, found_count: 0, no_questions: true, note: "No questions on this page." },
          },
        });
        patchPage(chunkId, { stage: "skipped", cut: 0, message: "no questions on this page" });
        log(`Page ${chunk.pageFrom}: no questions`);
        await loadChunks(jobId);
        return true;
      }

      patchPage(chunkId, { stage: "cropping", cut: regions.length, message: `cutting ${regions.length} question picture(s)` });
      const crops: { path: string; base64: string; label: string }[] = [];
      for (let i = 0; i < regions.length; i++) {
        if (!canvas) throw new Error("Page picture was released before cropping");
        let b64: string;
        try { b64 = cropRegionToJpegBase64(canvas, regions[i], { padding: 14, quality: 0.8 }); } catch { continue; }
        const path = `${jobId}/p${chunk.pageFrom}-q${i + 1}-${Date.now()}.jpg`;
        patchPage(chunkId, { message: `uploading picture ${i + 1}/${regions.length}` });
        const { error: upErr } = await withTimeout(
          supabase.storage.from(QUESTION_IMAGE_BUCKET).upload(path, base64ToBlob(b64), { contentType: "image/jpeg", upsert: true }),
          60_000, `upload picture ${i + 1}`,
        );
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        crops.push({ path, base64: b64, label: `${regions[i].label || `Q${i + 1}`} · ${path}` });
      }
      if (!crops.length) throw new Error("Every crop on this page failed");

      patchPage(chunkId, { stage: "submitting", cut: crops.length, message: `sending ${crops.length} picture(s) to the 50%-off batch` });
      await withRetry(() => withTimeout(submitFn({ data: { chunkId, crops } }), 180_000, "submit pictures"), 2, 2000);

      patchPage(chunkId, { stage: "waiting", cut: crops.length, message: `${crops.length} submitted · waiting on Gemini` });
      log(`Page ${chunk.pageFrom}: ${crops.length} question picture(s) submitted`);
      await loadChunks(jobId);
      return true;
    } catch (e: any) {
      const msg = (e?.message || String(e)).slice(0, 400);
      try { await markChunkFn({ data: { chunkId, status: "failed", error: msg } }); } catch { /* ignore */ }
      patchPage(chunkId, { stage: "error", message: msg });
      log(`Page ${chunk.pageFrom}: failed — ${msg}`);
      await loadChunks(jobId);
      return false;
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
    }
  }

  async function handleStart() {
    if (!file || !courseId || !groupId) return;
    setBusy(true);
    setRunLog([`Splitting ${file.name}`]);
    setPageState({});
    miniByChunkId.current = {};
    miniByPage.current = {};
    clearPdfRenderCache();
    try {
      setProgress(`Splitting ${file.name} into single pages…`);
      const mini: MiniPdf[] = await withTimeout(
        splitPdfInto2PageBlobs(file, (done, total) => setProgress(`Splitting ${file.name}: ${done}/${total} pages ready`), 1),
        180_000, "PDF split",
      );
      if (!mini.length) throw new Error("PDF appears empty after splitting.");
      const totalPages = mini.reduce((sum, m) => sum + (m.pageTo - m.pageFrom + 1), 0);
      for (const m of mini) miniByPage.current[m.pageFrom] = miniPdfAsFile(m, file.name);

      const subjectCandidates = subjectId === "__auto__" ? subjects.map((s) => s.name) : [];
      const created: any = await createJobFn({
        data: {
          courseId, groupId,
          subjectId: subjectId === "__auto__" ? null : subjectId,
          pdfName: `${VP_TAG} ${file.name}`,
          totalPages, subjectCandidates,
        },
      });
      const jobId = created.jobId as string;
      const chunks = created.chunks as { chunkId: string; chunkIndex: number; pageFrom: number; pageTo: number }[];
      for (const c of chunks) {
        const f = miniByPage.current[c.pageFrom];
        if (f) miniByChunkId.current[c.chunkId] = f;
      }
      const init: Record<string, PageState> = {};
      for (const c of chunks) init[c.chunkId] = { stage: "queued", cut: 0 };
      setPageState(init);

      await refreshJobs();
      setExpanded(jobId);
      await loadChunks(jobId);

      setProgress(`${file.name}: reading ${totalPages} page(s), one at a time…`);
      let failed = 0;
      for (const c of chunks) {
        const ok = await processPage(jobId, c);
        if (!ok) failed++;
      }
      clearPdfRenderCache();
      const stats = summarize(await loadChunks(jobId));
      setProgress(failed || stats.needsRetry
        ? `Sent ${stats.cut} question picture(s). ${stats.needsRetry || failed} page(s) need retry.`
        : `All ${stats.cut} question picture(s) sent to the 50%-off batch. Checking for answers…`);
      autoFinish(jobId).catch(() => {});
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
      log(e?.message || "failed");
    } finally {
      setBusy(false);
      await refreshJobs();
    }
  }

  async function pollAndImport(jobId: string, quiet = false): Promise<ChunkRow[]> {
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
    let imported = 0;
    for (const c of chunks.filter((x) => x.status === "ready")) {
      try { await importFn({ data: { chunkId: c.id } }); imported++; } catch { /* leave ready */ }
    }
    chunks = await loadChunks(jobId);
    if (!quiet && (changed || imported)) toast.success(`Updated ${changed} · imported ${imported}`);
    return chunks;
  }

  async function autoFinish(jobId: string) {
    for (let i = 0; i < 90; i++) {
      const chunks = await pollAndImport(jobId, true);
      const waiting = chunks.some((c) => c.status === "awaiting_batch" || c.status === "ready" || c.status === "submitting");
      if (!waiting) {
        const stats = summarize(chunks);
        setProgress(stats.needsRetry
          ? `Finished what I could. ${stats.importedCount} question(s) imported · ${stats.needsRetry} page(s) need retry.`
          : `Done. Imported ${stats.importedCount} question(s).`);
        if (!stats.needsRetry) toast.success("Vision Pro batch finished");
        return;
      }
      setProgress("Gemini is answering in the background. Checking and importing automatically…");
      await new Promise((r) => setTimeout(r, 8_000));
    }
    setProgress("Gemini is still answering. Leave this page open, or press Check later.");
  }

  async function retryPage(jobId: string, chunk: ChunkRow) {
    const hasMini = Boolean(miniByChunkId.current[chunk.id] || miniByPage.current[chunk.page_from]);
    if (!hasMini) { toast.error("Re-select the PDF and press Start so the page can be rendered again."); return; }
    try {
      await retryChunkFn({ data: { chunkId: chunk.id } });
      await processPage(jobId, { chunkId: chunk.id, chunkIndex: chunk.chunk_index, pageFrom: chunk.page_from, pageTo: chunk.page_to });
      toast.success(`Page ${chunk.page_from} retried`);
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    }
  }

  async function removeJob(jobId: string) {
    if (!confirm("Delete this job?")) return;
    await deleteJobFn({ data: { jobId } });
    await refreshJobs();
  }

  const selectCls = "w-full rounded-xl border-2 bg-white px-3 py-2 text-sm font-bold text-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="relative pt-28 pb-10 md:pt-32 md:pb-14 overflow-hidden">
        <FloatingMedicalBackdrop />
        <div className="relative mx-auto max-w-3xl px-4 md:px-8 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ borderColor: "color-mix(in oklab, #7c3aed 30%, white)", color: "#7c3aed" }}
          >
            <Sparkles size={12} strokeWidth={3} />
            vision pro · every question cut as a picture · gemini batch 50% off
          </span>
          <h1 className="mt-6 font-display font-black leading-[1.05] tracking-tight lowercase" style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}>
            vision pro batch 50%.
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            the advanced scan importer: each page is photographed, every question is cut out as its own picture, then solved through the half-price batch queue.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 md:px-8 pb-24 space-y-8">
        {/* Gemini key */}
        <div
          className="rounded-2xl bg-white border-2 p-4 flex items-center gap-3"
          style={{ borderColor: keyStatus?.present ? "color-mix(in oklab, var(--primary) 25%, white)" : "color-mix(in oklab, #ef4444 30%, white)" }}
        >
          <div className="grid place-items-center h-10 w-10 rounded-xl shrink-0 text-white" style={{ background: keyStatus?.present ? "var(--primary)" : "#ef4444" }}>
            <KeyRound size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Google Gemini API key</div>
            {keyStatus === null ? <div className="text-sm text-muted-foreground">Checking…</div>
              : keyStatus.present ? (
                <div className="text-sm font-bold text-foreground">
                  Connected · slot {keyStatus.slot} <span className="font-mono text-xs text-muted-foreground">{keyStatus.masked}</span>
                </div>
              ) : <div className="text-sm font-bold text-red-600">No key configured</div>}
          </div>
          <a href="/admin/gemini-keys" className="btn-chunky !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1 shrink-0">
            {keyStatus?.present ? "Manage" : "Add key"}
          </a>
        </div>

        {/* Setup */}
        <div
          className="rounded-3xl bg-white border-2 p-6 md:p-8 space-y-5"
          style={{ borderColor: "color-mix(in oklab, #7c3aed 20%, white)", boxShadow: "0 10px 0 color-mix(in oklab, #7c3aed 15%, white)" }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Course</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={selectCls} disabled={busy}>
                <option value="">Choose…</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Group</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls} disabled={!courseId || busy}>
                <option value="">Choose…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={selectCls} disabled={!groupId || busy}>
                <option value="__auto__">Auto-sort by subject</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <input
              ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (fileRef.current) fileRef.current.value = ""; }}
            />
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full rounded-2xl border-2 border-dashed px-4 py-8 text-center hover:bg-muted/40 transition disabled:opacity-50"
              style={{ borderColor: "color-mix(in oklab, #7c3aed 30%, white)" }}
            >
              <ScanEye className="mx-auto mb-2 text-muted-foreground" size={26} />
              <div className="text-sm font-bold">{file ? file.name : "Click to choose a PDF"}</div>
              <div className="text-xs text-muted-foreground mt-1">scans, photos and equation-heavy exams</div>
            </button>
          </div>

          <button
            type="button" onClick={handleStart} disabled={!ready}
            className="btn-chunky w-full justify-center inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            {busy ? "Working…" : "Start vision pro import (50% off)"}
          </button>

          {progress && <div className="text-sm text-muted-foreground">{progress}</div>}
          {runLog.length > 0 && (
            <div className="rounded-2xl bg-muted/40 p-3 text-xs space-y-1">
              {runLog.map((l, i) => <div key={i} className="text-muted-foreground">{l}</div>)}
            </div>
          )}
          {Object.entries(pageState).length > 0 && busy && (
            <div className="space-y-1 text-xs">
              {Object.entries(pageState).map(([id, st]) => (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="font-bold">{st.stage}</span>
                  <span className="text-muted-foreground truncate">{st.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Jobs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-black text-xl lowercase">recent vision pro jobs</h2>
            <button type="button" onClick={refreshJobs} className="btn-chunky !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {jobs.length === 0 && <div className="text-sm text-muted-foreground">No vision pro jobs yet.</div>}

          {jobs.map((job) => {
            const chunks = chunksByJob[job.id] || [];
            const stats = summarize(chunks);
            const open = expanded === job.id;
            return (
              <div key={job.id} className="rounded-2xl bg-white border-2 p-4 space-y-3" style={{ borderColor: "color-mix(in oklab, #7c3aed 18%, white)" }}>
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <button
                    type="button"
                    onClick={async () => { setExpanded(open ? null : job.id); if (!open) await loadChunks(job.id); }}
                    className="text-left min-w-0"
                  >
                    <div className="font-bold truncate">{job.pdf_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.total_pages} page(s) · {new Date(job.created_at).toLocaleString()} · {job.subject_id ? "fixed subject" : "auto-sort"}
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => pollAndImport(job.id)} className="btn-chunky !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1">
                      <RefreshCw size={12} /> Check
                    </button>
                    <button type="button" onClick={() => pollAndImport(job.id)} className="btn-chunky !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1">
                      <Download size={12} /> Import ready
                    </button>
                    <button type="button" onClick={() => removeJob(job.id)} className="text-red-600 p-1.5" aria-label="Delete job">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {open && (
                  <>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                      <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">pages {stats.pages}</span>
                      <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">questions cut {stats.cut}</span>
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">waiting {stats.waiting}</span>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">ready {stats.ready}</span>
                      <span className="rounded-full bg-emerald-200 text-emerald-900 px-2 py-0.5">imported {stats.importedCount}</span>
                      {stats.needsRetry > 0 && <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5">needs retry {stats.needsRetry}</span>}
                    </div>

                    <div className="space-y-1.5">
                      {chunks.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs border-t pt-1.5">
                          <span className="font-bold">page {c.page_from}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5">{c.status}</span>
                          {Number(c.results?.found_count ?? 0) > 0 && <span className="text-muted-foreground">{c.results.found_count} picture(s)</span>}
                          {c.imported_count > 0 && <span className="text-emerald-700 font-bold">imported {c.imported_count}</span>}
                          {c.error && <span className="text-red-600 truncate max-w-[45%]">{c.error}</span>}
                          {(c.status === "failed" || c.status === "text_failed") && (
                            <button type="button" onClick={() => retryPage(job.id, c)} className="ml-auto btn-chunky !py-1 !px-2 text-[10px] inline-flex items-center gap-1">
                              <RotateCw size={10} /> retry
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
