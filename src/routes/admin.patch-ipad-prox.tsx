import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Upload, Loader2, ScanEye, Trash2, CheckCircle2, PlayCircle, Download, Clock3, AlertTriangle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadPdfForRenderPreferWorker, clearPdfRenderCache } from "@/lib/pdf-page-render";
import { renderPageToCanvas, canvasToJpegBase64, cropRegionToJpegBase64, base64ToBlob, type CutRegion } from "@/lib/pdf-page-image";
import { splitPdfInto2PageBlobs, miniPdfAsFile, type MiniPdf } from "@/lib/pdf-split";
import {
  createProxJob, submitCutBatchProX, pollCutBatchProX, saveCropsProX,
  submitSolveBatchProX, pollSolveBatchProX, importProxJob,
  listProxJobs, getProxJob, deleteProxJob,
} from "@/lib/patch-ipad-prox.functions";

const BUCKET = "question-images";
const CUT_PAGES_PER_BATCH = 8;
const SOLVE_ITEMS_PER_BATCH = 10;

export const Route = createFileRoute("/admin/patch-ipad-prox")({
  head: () => ({
    meta: [
      { title: "Patch iPad ProX — AquaQBank Admin" },
      { name: "description", content: "Two-phase exam importer: page borders and answers both run through the 50%-off Gemini batch API." },
      { property: "og:title", content: "Patch iPad ProX — AquaQBank Admin" },
      { property: "og:description", content: "Cut exam pages and solve every question picture through the 50%-off Gemini batch API, one phase at a time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatchIpadProX,
});

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type Subject = { id: string; name: string; group_id: string };
type PageRow = { id: string; page_number: number; status: string; regions: any[]; crops: any[]; error: string | null };
type ItemRow = { id: string; page_number: number; item_index: number; image_path: string; status: string; correct_letter: string | null; error: string | null };
type JobRow = { id: string; pdf_name: string; total_pages: number; phase: string; imported_count: number; error: string | null; created_at: string };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

/** Widen the Gemini bands a little so stems + all options land inside one crop. */
function expandRegions(regions: CutRegion[]): CutRegion[] {
  const clamp = (v: number) => Math.max(0, Math.min(1000, Number.isFinite(v) ? v : 0));
  const cleaned = regions
    .map((r) => {
      const yTop = clamp(Math.min(Number(r.y_top), Number(r.y_bottom)));
      const yBottom = clamp(Math.max(Number(r.y_top), Number(r.y_bottom)));
      return { ...r, y_top: yTop, y_bottom: yBottom };
    })
    .filter((r) => r.y_bottom - r.y_top >= 12)
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

function PatchIpadProX() {
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<any | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  const miniByPage = useRef<Record<number, File>>({});
  const pollingRef = useRef(false);

  const createJobFn = useServerFn(createProxJob);
  const submitCutFn = useServerFn(submitCutBatchProX);
  const pollCutFn = useServerFn(pollCutBatchProX);
  const saveCropsFn = useServerFn(saveCropsProX);
  const submitSolveFn = useServerFn(submitSolveBatchProX);
  const pollSolveFn = useServerFn(pollSolveBatchProX);
  const importFn = useServerFn(importProxJob);
  const listFn = useServerFn(listProxJobs);
  const getFn = useServerFn(getProxJob);
  const delFn = useServerFn(deleteProxJob);

  function addLog(m: string) { setLog((p) => [`${new Date().toLocaleTimeString()} · ${m}`, ...p].slice(0, 40)); }

  async function refreshJobs() {
    try {
      const r: any = await listFn();
      const rows = (r?.rows ?? []) as JobRow[];
      setJobs(rows);
      return rows;
    } catch {
      return [] as JobRow[];
    }
  }
  async function loadJob(id: string) {
    const r: any = await getFn({ data: { jobId: id } });
    setJob(r.job); setPages(r.pages as PageRow[]); setItems(r.items as ItemRow[]);
    return r;
  }

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year,kind").eq("kind", "questions").order("year");
      setCourses((data ?? []) as Course[]);
    })();
    void (async () => {
      const rows = await refreshJobs();
      const active = rows.find((row) => row.phase !== "imported") ?? rows[0];
      if (active) {
        setJobId(active.id);
        await loadJob(active.id).catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    if (!courseId) { setGroups([]); setGroupId(""); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subject_groups")
        .select("id,course_id,name").eq("course_id", courseId).order("sort_order");
      setGroups((data ?? []) as Group[]); setGroupId(""); setSubjectId("__auto__");
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) { setSubjects([]); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,group_id,name").eq("group_id", groupId).order("sort_order");
      setSubjects((data ?? []) as Subject[]); setSubjectId("__auto__");
    })();
  }, [groupId]);

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(() => { loadJob(jobId).catch(() => {}); }, 10_000);
    return () => clearInterval(t);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || busy) return;
    const waitingForCut = job?.phase === "cut_submitted";
    const waitingForSolve = job?.phase === "solve_submitted";
    if (!waitingForCut && !waitingForSolve) return;

    const check = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const r: any = waitingForCut
          ? await pollCutFn({ data: { jobId } })
          : await pollSolveFn({ data: { jobId } });
        setLastChecked(new Date().toLocaleTimeString());
        setPollError(r?.error ?? null);
        await loadJob(jobId);
        if (r?.terminal) {
          setProgress(r.error || "The Gemini batch failed. Only the failed work needs retrying.");
        } else if (r?.done && waitingForCut) {
          if (Object.keys(miniByPage.current).length) await cropAndUpload(jobId);
          else setProgress("Gemini found the question borders. Select the same PDF once to create the question pictures.");
        } else if (r?.done) {
          setProgress("All Gemini answers are saved. The questions are ready to import.");
        } else {
          const states = (r?.states ?? []).join(", ") || "queued";
          setProgress(`Gemini batch is ${states}. This page is checking automatically.`);
        }
      } catch (e: any) {
        setPollError(e?.message || "Could not check Gemini");
      } finally {
        pollingRef.current = false;
      }
    };

    void check();
    const timer = setInterval(check, 12_000);
    return () => clearInterval(timer);
  }, [jobId, job?.phase, busy]);

  const stats = useMemo(() => {
    const cutDone = pages.filter((p) => p.status === "cropped" || p.status === "empty").length;
    const solved = items.filter((i) => i.status === "solved" || i.status === "imported").length;
    const failedItems = items.filter((i) => i.status === "failed").length;
    return {
      pages: pages.length,
      cutDone,
      crops: items.length,
      solved,
      failedItems,
      phase1Done: pages.length > 0 && cutDone === pages.length,
      phase2Done: items.length > 0 && solved === items.length,
    };
  }, [pages, items]);

  const canStartPhase1 = Boolean(courseId && groupId && file && !busy);
  const canStartPhase2 = Boolean(jobId && stats.phase1Done && items.length > 0 && !busy
    && items.every((i) => i.status === "pending" || i.status === "failed"));
  const canImport = Boolean(jobId && job?.phase !== "imported" && stats.phase2Done && stats.solved > 0 && !busy);
  const cutReadyPages = pages.filter((p) => p.status === "cut_ready");
  const failedPages = pages.filter((p) => p.status.includes("failed"));
  const waitingForCut = job?.phase === "cut_submitted";
  const waitingForSolve = job?.phase === "solve_submitted";

  async function prepareExistingPdfAndCrop() {
    if (!file || !jobId || !job) return;
    setBusy(true);
    setPollError(null);
    miniByPage.current = {};
    clearPdfRenderCache();
    try {
      if (file.name !== job.pdf_name) throw new Error(`Choose the same PDF used for this run: ${job.pdf_name}`);
      setProgress(`Opening ${file.name} to finish the saved Gemini borders…`);
      const mini = await withTimeout(
        splitPdfInto2PageBlobs(file, (done, total) => setProgress(`Preparing PDF: ${done}/${total} pages`), 1),
        180_000,
        "PDF preparation",
      );
      if (mini.length !== job.total_pages) throw new Error(`This PDF has ${mini.length} pages; the selected run expects ${job.total_pages}.`);
      for (const m of mini) miniByPage.current[m.pageFrom] = miniPdfAsFile(m, file.name);
      await cropAndUpload(jobId);
    } catch (e: any) {
      const message = e?.message || "Could not finish cutting the PDF";
      setPollError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      await loadJob(jobId).catch(() => {});
    }
  }

  // ---------- PHASE 1 ----------
  async function runPhase1() {
    if (!file || !courseId || !groupId) return;
    setBusy(true); setLog([]); miniByPage.current = {}; clearPdfRenderCache();
    try {
      setProgress(`Splitting ${file.name}…`);
      const mini: MiniPdf[] = await withTimeout(
        splitPdfInto2PageBlobs(file, (done, total) => setProgress(`Splitting: ${done}/${total} pages`), 1),
        180_000, "PDF split",
      );
      if (!mini.length) throw new Error("PDF appears empty after splitting.");
      for (const m of mini) miniByPage.current[m.pageFrom] = miniPdfAsFile(m, file.name);
      const totalPages = mini.length;

      const subjectCandidates = subjectId === "__auto__" ? subjects.map((s) => s.name) : [];
      const created: any = await createJobFn({
        data: {
          courseId, groupId,
          subjectId: subjectId === "__auto__" ? null : subjectId,
          pdfName: file.name, totalPages, subjectCandidates,
        },
      });
      const id = created.jobId as string;
      setJobId(id);
      await refreshJobs();
      await loadJob(id);
      addLog(`job created · ${totalPages} page(s)`);

      // render every page, send them to the cut batch in slices
      let slice: { pageNumber: number; base64: string }[] = [];
      for (const m of mini) {
        setProgress(`Rendering page ${m.pageFrom}/${totalPages}…`);
        const doc = await withTimeout(loadPdfForRenderPreferWorker(miniByPage.current[m.pageFrom]), 60_000, `page ${m.pageFrom} open`);
        const canvas = await withTimeout(renderPageToCanvas(doc, 1, 1200), 60_000, `page ${m.pageFrom} render`);
        slice.push({ pageNumber: m.pageFrom, base64: canvasToJpegBase64(canvas, 0.68) });
        canvas.width = 0; canvas.height = 0;
        if (slice.length >= CUT_PAGES_PER_BATCH) {
          await submitCutFn({ data: { jobId: id, pages: slice } });
          addLog(`sent ${slice.length} page(s) to the 50%-off border batch`);
          slice = [];
        }
      }
      if (slice.length) {
        await submitCutFn({ data: { jobId: id, pages: slice } });
        addLog(`sent ${slice.length} page(s) to the 50%-off border batch`);
      }
      await loadJob(id);

      // wait for the cut batches
      setProgress("Phase 1: waiting for Gemini to return the question borders (batch, 50% off)…");
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        try {
          const r: any = await pollCutFn({ data: { jobId: id } });
          done = Boolean(r?.done);
          setProgress(`Phase 1: batch state ${(r?.states ?? []).join(", ") || "pending"}…`);
        } catch (e: any) { setPollError(e?.message || "Could not check Gemini"); }
      }
      if (!done) throw new Error("Gemini is still working on the borders. Press “Resume phase 1” later.");

      await cropAndUpload(id);
    } catch (e: any) {
      toast.error(e?.message || "Phase 1 failed");
      addLog(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false);
      if (jobId) await loadJob(jobId).catch(() => {});
      await refreshJobs();
    }
  }

  async function cropAndUpload(id: string) {
    const r = await loadJob(id);
    const rows = (r.pages as PageRow[]).filter((p) => p.status === "cut_ready");
    let uploaded = 0;
    for (const p of rows) {
      const mini = miniByPage.current[p.page_number];
      if (!mini) { addLog(`⚠ page ${p.page_number}: re-select the PDF to cut it`); continue; }
      setProgress(`Phase 1: cutting question pictures out of page ${p.page_number}…`);
      const doc = await loadPdfForRenderPreferWorker(mini);
      const canvas = await renderPageToCanvas(doc, 1, 1200);
      const regions = expandRegions((p.regions ?? []) as CutRegion[]);
      const crops: { path: string; label: string }[] = [];
      for (let i = 0; i < regions.length; i++) {
        let b64: string;
        try { b64 = cropRegionToJpegBase64(canvas, regions[i], { padding: 14, quality: 0.8 }); } catch { continue; }
        const path = `${id}/p${p.page_number}-q${i + 1}-${Date.now()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET)
          .upload(path, base64ToBlob(b64), { contentType: "image/jpeg", upsert: true });
        if (error) { addLog(`⚠ page ${p.page_number} picture ${i + 1}: ${error.message}`); continue; }
        crops.push({ path, label: String(regions[i].label || `Q${i + 1}`).slice(0, 120) });
        uploaded++;
      }
      canvas.width = 0; canvas.height = 0;
      await saveCropsFn({ data: { jobId: id, pageNumber: p.page_number, crops } });
      addLog(`page ${p.page_number}: ${crops.length} question picture(s) ready`);
    }
    await loadJob(id);
    setProgress(`Phase 1 finished · ${uploaded} question picture(s) ready. You can start phase 2.`);
    toast.success("Phase 1 done");
  }

  // ---------- PHASE 2 ----------
  async function runPhase2() {
    if (!jobId) return;
    setBusy(true);
    try {
      const pending = items.filter((i) => i.status === "pending" || i.status === "failed");
      setProgress(`Phase 2: sending ${pending.length} question picture(s) to the 50%-off solve batch…`);
      let slice: { pageNumber: number; itemIndex: number; base64: string }[] = [];
      for (const it of pending) {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(it.image_path);
        if (error || !blob) { addLog(`⚠ could not read ${it.image_path}`); continue; }
        const base64 = await blobToBase64(blob);
        slice.push({ pageNumber: it.page_number, itemIndex: it.item_index, base64 });
        if (slice.length >= SOLVE_ITEMS_PER_BATCH) {
          await submitSolveFn({ data: { jobId, items: slice } });
          addLog(`sent ${slice.length} question(s) to the 50%-off solve batch`);
          slice = [];
        }
      }
      if (slice.length) {
        await submitSolveFn({ data: { jobId, items: slice } });
        addLog(`sent ${slice.length} question(s) to the 50%-off solve batch`);
      }
      await loadJob(jobId);

      setProgress("Phase 2: waiting for Gemini answers (batch, 50% off)…");
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        try {
          const r: any = await pollSolveFn({ data: { jobId } });
          done = Boolean(r?.done);
          setProgress(`Phase 2: batch state ${(r?.states ?? []).join(", ") || "pending"}…`);
        } catch (e: any) { setPollError(e?.message || "Could not check Gemini"); }
        await loadJob(jobId).catch(() => {});
      }
      setProgress(done ? "Phase 2 finished. You can import now." : "Gemini is still answering — press “Check phase 2” later.");
      if (done) toast.success("Phase 2 done");
    } catch (e: any) {
      toast.error(e?.message || "Phase 2 failed");
      addLog(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false);
      if (jobId) await loadJob(jobId).catch(() => {});
    }
  }

  const primaryControl = (() => {
    if (!jobId) return {
      label: "Choose PDF and start",
      disabled: !canStartPhase1,
      action: runPhase1,
      icon: <PlayCircle size={16} />,
    };
    if (waitingForCut) return {
      label: "Waiting for Gemini — checking automatically",
      disabled: true,
      action: () => {},
      icon: <Loader2 className="animate-spin" size={16} />,
    };
    if (cutReadyPages.length > 0) return {
      label: file ? `Finish cutting ${cutReadyPages.length} page(s)` : "Select the same PDF to finish cutting",
      disabled: !file || busy,
      action: prepareExistingPdfAndCrop,
      icon: file ? <PlayCircle size={16} /> : <Upload size={16} />,
    };
    if (failedPages.length > 0 || job?.phase === "cut_failed") return {
      label: "Phase 1 failed — start a new run with the PDF",
      disabled: !canStartPhase1,
      action: runPhase1,
      icon: <AlertTriangle size={16} />,
    };
    if (waitingForSolve) return {
      label: "Waiting for Gemini answers — checking automatically",
      disabled: true,
      action: () => {},
      icon: <Loader2 className="animate-spin" size={16} />,
    };
    if (job?.phase === "imported") return {
      label: `${job.imported_count || stats.solved} questions imported`,
      disabled: true,
      action: () => {},
      icon: <CheckCircle2 size={16} />,
    };
    if (canImport) return {
      label: `Import ${stats.solved} questions`,
      disabled: false,
      action: runImport,
      icon: <Download size={16} />,
    };
    if (job?.phase === "solve_failed" || stats.failedItems > 0) return {
      label: `${stats.failedItems} answer(s) failed — retry failed questions`,
      disabled: busy,
      action: runPhase2,
      icon: <AlertTriangle size={16} />,
    };
    return {
      label: `Start solving ${items.length} questions`,
      disabled: !canStartPhase2,
      action: runPhase2,
      icon: <PlayCircle size={16} />,
    };
  })();

  async function runImport() {
    if (!jobId) return;
    setBusy(true);
    try {
      const r: any = await importFn({ data: { jobId } });
      await loadJob(jobId);
      await refreshJobs();
      setProgress(`Imported ${r.inserted} question(s) · ${r.skipped} duplicate(s) · ${r.failed} failed.`);
      toast.success(`Imported ${r.inserted} question(s)`);
      if (r.errors?.length) addLog(r.errors.join(" · "));
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally { setBusy(false); }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft size={14} /> Admin
        </Link>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <ScanEye className="text-primary" size={22} /> Patch iPad ProX
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Both steps run through the Gemini batch API at half price: phase 1 finds the question borders, phase 2 solves every question picture. Import unlocks only when both are finished.
        </p>

        {/* setup */}
        <section className="rounded-2xl border border-border bg-card p-5 mb-5">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">1. Where to save</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">— course —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!courseId} className="px-3 py-2 rounded-xl border border-border bg-background text-sm disabled:opacity-50">
              <option value="">— group —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!groupId} className="px-3 py-2 rounded-xl border border-border bg-background text-sm disabled:opacity-50">
              <option value="__auto__">Let Gemini pick the subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <label className="mt-4 block cursor-pointer rounded-2xl border-2 border-dashed border-border p-6 text-center hover:border-primary">
            <Upload className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-bold">{file ? file.name : "Click to choose the exam PDF"}</p>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </section>

        <section className={`border p-5 mb-5 ${pollError || job?.error ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Current status</p>
              <p className="mt-1 text-base font-bold">
                {pollError || job?.error || progress || (jobId ? "Run selected" : "Choose where to save and select a PDF")}
              </p>
              {lastChecked && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 size={12} /> Last checked {lastChecked}
                </p>
              )}
            </div>
            <button
              onClick={primaryControl.action}
              disabled={primaryControl.disabled || busy}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin" size={16} /> : primaryControl.icon}
              {primaryControl.label}
            </button>
          </div>
        </section>

        {/* phases */}
        <section className="grid md:grid-cols-3 gap-4 mb-5">
          <PhaseCard
            step="Phase 1"
            title="Read the pages"
            detail={stats.pages ? `${stats.cutDone}/${stats.pages} pages cut · ${stats.crops} question pictures` : "not started"}
            done={stats.phase1Done}
            action={<span className="text-xs font-bold text-muted-foreground">{waitingForCut ? "Gemini is processing" : cutReadyPages.length ? "Borders received; PDF needed" : stats.phase1Done ? "Complete" : "Not started"}</span>}
          />
          <PhaseCard
            step="Phase 2"
            title="Solve the questions"
            detail={stats.crops ? `${stats.solved}/${stats.crops} solved${stats.failedItems ? ` · ${stats.failedItems} failed` : ""}` : "waiting for phase 1"}
            done={stats.phase2Done}
            action={<span className="text-xs font-bold text-muted-foreground">{waitingForSolve ? "Gemini is processing" : stats.phase2Done ? "Complete" : stats.phase1Done ? "Ready when you are" : "Locked"}</span>}
          />
          <PhaseCard
            step="Import"
            title="Save into the subject"
            detail={job?.imported_count ? `${job.imported_count} imported` : stats.phase2Done ? "ready to import" : "locked until phase 2 is done"}
            done={Boolean(job?.imported_count)}
            action={<span className="text-xs font-bold text-muted-foreground">{canImport ? "Ready" : "Locked"}</span>}
          />
        </section>

        {log.length > 0 && (
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 mb-5 text-xs font-mono max-h-56 overflow-y-auto">
            {log.map((l, i) => <div key={i} className="py-0.5">{l}</div>)}
          </div>
        )}

        {/* pages / items */}
        {jobId && (
          <section className="rounded-2xl border border-border bg-card p-5 mb-5">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Pages</p>
            <div className="flex flex-wrap gap-2">
              {pages.map((p) => (
                <span key={p.id} title={p.error || p.status}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                    p.status === "cropped" ? "bg-emerald-500/15 text-emerald-600"
                      : p.status === "empty" ? "bg-muted text-muted-foreground"
                      : p.status.includes("failed") ? "bg-rose-500/15 text-rose-600"
                      : "bg-amber-500/15 text-amber-600"}`}>
                  Page {p.page_number} · {p.status === "cut_ready"
                    ? `${Array.isArray(p.regions) ? p.regions.length : 0} borders found · needs cutting`
                    : p.status === "cropped"
                      ? `${Array.isArray(p.crops) ? p.crops.length : 0} pictures ready`
                      : p.status === "cut_submitted"
                        ? "waiting for Gemini"
                        : p.status === "empty"
                          ? "no questions found"
                          : "failed"}
                </span>
              ))}
            </div>
            {items.length > 0 && (
              <>
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mt-4 mb-2">Questions</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((it) => (
                    <span key={it.id} title={it.error || it.status}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                        it.status === "imported" ? "bg-emerald-500/15 text-emerald-600"
                          : it.status === "solved" ? "bg-sky-500/15 text-sky-600"
                          : it.status === "failed" ? "bg-rose-500/15 text-rose-600"
                          : "bg-amber-500/15 text-amber-600"}`}>
                      p{it.page_number}q{it.item_index + 1}{it.correct_letter ? ` · ${it.correct_letter}` : ""}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* jobs */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Recent runs</p>
          {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <button onClick={() => { setJobId(j.id); loadJob(j.id); }} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold truncate">{j.pdf_name}</div>
                    <div className="text-[11px] text-muted-foreground">{j.phase} · {j.total_pages} pages · {j.imported_count} imported</div>
                  </button>
                  <button onClick={async () => { await delFn({ data: { jobId: j.id } }); if (jobId === j.id) { setJobId(null); setPages([]); setItems([]); } refreshJobs(); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PhaseCard({ step, title, detail, done, action }: { step: string; title: string; detail: string; done: boolean; action: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {step} {done && <CheckCircle2 size={14} className="text-emerald-600" />}
      </div>
      <div className="text-sm font-bold mt-1">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5 mb-3">{detail}</div>
      {action}
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(binary);
}
