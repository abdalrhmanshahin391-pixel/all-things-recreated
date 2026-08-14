import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Upload, Loader2, ScanEye, Trash2, CheckCircle2, PlayCircle, Download, Clock3, AlertTriangle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceBookCard } from "@/components/admin/ReferenceBookCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadPdfForRenderPreferWorker, clearPdfRenderCache } from "@/lib/pdf-page-render";
import {
  renderPageToCanvas, canvasToJpegBase64, cropRegionToJpegBase64,
  base64ToBlob, imageBlobToCanvas, type CutRegion,
} from "@/lib/pdf-page-image";
import { splitPdfInto2PageBlobs, miniPdfAsFile, type MiniPdf } from "@/lib/pdf-split";
import {
  createProxJob, submitCutBatchProX, pollCutBatchProX, saveCropsProX,
  submitSolveBatchProX, pollSolveBatchProX, importProxJob,
  listProxJobs, getProxJob, deleteProxJob, setProxReferenceBook,
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
type PageRow = { id: string; page_number: number; status: string; regions: any[]; crops: any[]; error: string | null; page_image_path: string | null };
type ItemRow = { id: string; page_number: number; item_index: number; image_path: string; status: string; correct_letter: string | null; error: string | null };
type JobRow = { id: string; pdf_name: string; total_pages: number; phase: string; imported_count: number; error: string | null; created_at: string };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(binary);
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

  const [files, setFiles] = useState<File[]>([]);
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

  const busyRef = useRef(false);
  const tickRef = useRef(false);
  const croppingRef = useRef<Set<string>>(new Set());

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
  const setBook = useServerFn(setProxReferenceBook);

  function addLog(m: string) { setLog((p) => [`${new Date().toLocaleTimeString()} · ${m}`, ...p].slice(0, 60)); }

  const refreshJobs = useCallback(async () => {
    try {
      const r: any = await listFn();
      const rows = (r?.rows ?? []) as JobRow[];
      setJobs(rows);
      return rows;
    } catch { return [] as JobRow[]; }
  }, [listFn]);

  const loadJob = useCallback(async (id: string) => {
    const r: any = await getFn({ data: { jobId: id } });
    setJob(r.job); setPages(r.pages as PageRow[]); setItems(r.items as ItemRow[]);
    return r;
  }, [getFn]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year,kind").eq("kind", "questions").order("year");
      setCourses((data ?? []) as Course[]);
    })();
    void (async () => {
      const rows = await refreshJobs();
      const active = rows.find((row) => row.phase !== "imported") ?? rows[0];
      if (active) { setJobId(active.id); await loadJob(active.id).catch(() => {}); }
    })();
  }, [refreshJobs, loadJob]);

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

  // ---------- cutting straight from the stored page pictures ----------
  const cropStoredPages = useCallback(async (id: string) => {
    if (croppingRef.current.has(id)) return;
    croppingRef.current.add(id);
    try {
      const r: any = await getFn({ data: { jobId: id } });
      const rows = (r.pages as PageRow[]).filter((p) => p.status === "cut_ready");
      let uploaded = 0;
      for (const p of rows) {
        if (!p.page_image_path) {
          await saveCropsFn({ data: { jobId: id, pageNumber: p.page_number, crops: [] } });
          addLog(`⚠ page ${p.page_number}: no stored picture — skipped`);
          continue;
        }
        setProgress(`Cutting question pictures out of page ${p.page_number}…`);
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(p.page_image_path);
        if (error || !blob) { addLog(`⚠ page ${p.page_number}: ${error?.message || "picture missing"}`); continue; }
        const canvas = await imageBlobToCanvas(blob);
        const regions = expandRegions((p.regions ?? []) as CutRegion[]);
        const crops: { path: string; label: string }[] = [];
        for (let i = 0; i < regions.length; i++) {
          let b64: string;
          try { b64 = cropRegionToJpegBase64(canvas, regions[i], { padding: 22, quality: 0.82 }); } catch { continue; }
          const path = `${id}/p${p.page_number}-q${i + 1}-${Date.now()}.jpg`;
          const up = await supabase.storage.from(BUCKET)
            .upload(path, base64ToBlob(b64), { contentType: "image/jpeg", upsert: true });
          if (up.error) { addLog(`⚠ page ${p.page_number} picture ${i + 1}: ${up.error.message}`); continue; }
          crops.push({ path, label: String(regions[i].label || `Q${i + 1}`).slice(0, 120) });
          uploaded++;
        }
        canvas.width = 0; canvas.height = 0;
        await saveCropsFn({ data: { jobId: id, pageNumber: p.page_number, crops } });
        addLog(`page ${p.page_number}: ${crops.length} question picture(s) ready`);
      }
      if (uploaded) setProgress(`${uploaded} question picture(s) ready. You can solve them now.`);
      await loadJob(id).catch(() => {});
      await refreshJobs();
    } finally {
      croppingRef.current.delete(id);
    }
  }, [getFn, saveCropsFn, loadJob, refreshJobs]);

  // ---------- background checking for every unfinished run ----------
  useEffect(() => {
    const tick = async () => {
      if (tickRef.current || busyRef.current) return;
      tickRef.current = true;
      try {
        const rows = await refreshJobs();
        const active = rows.filter((j) => j.phase === "cut_submitted" || j.phase === "solve_submitted");
        for (const j of active) {
          try {
            const r: any = j.phase === "cut_submitted"
              ? await pollCutFn({ data: { jobId: j.id } })
              : await pollSolveFn({ data: { jobId: j.id } });
            setLastChecked(new Date().toLocaleTimeString());
            if (j.id === jobId) setPollError(r?.error ?? null);
            if (r?.done && j.phase === "cut_submitted") await cropStoredPages(j.id);
          } catch (e: any) {
            if (j.id === jobId) setPollError(e?.message || "Could not check Gemini");
          }
        }
        // pages whose borders are saved but never cut (older runs / interrupted tab)
        if (jobId && !active.some((j) => j.id === jobId)) {
          const cur = rows.find((j) => j.id === jobId);
          if (cur && cur.phase === "cut_ready") await cropStoredPages(jobId);
        }
        if (jobId) await loadJob(jobId).catch(() => {});
      } finally {
        tickRef.current = false;
      }
    };
    void tick();
    const t = setInterval(() => { void tick(); }, 12_000);
    return () => clearInterval(t);
  }, [jobId, refreshJobs, pollCutFn, pollSolveFn, cropStoredPages, loadJob]);

  const stats = useMemo(() => {
    const cutDone = pages.filter((p) => p.status === "cropped" || p.status === "empty").length;
    const solved = items.filter((i) => i.status === "solved" || i.status === "imported" || i.status === "duplicate").length;
    const failedItems = items.filter((i) => i.status === "failed").length;
    const duplicates = items.filter((i) => i.status === "duplicate").length;
    const readyToImport = items.filter((i) => i.status === "solved").length;
    return {
      pages: pages.length,
      cutDone,
      crops: items.length,
      solved,
      failedItems,
      duplicates,
      readyToImport,
      phase1Done: pages.length > 0 && cutDone === pages.length,
      phase2Done: items.length > 0 && solved === items.length,
    };
  }, [pages, items]);

  const waitingForCut = job?.phase === "cut_submitted";
  const waitingForSolve = job?.phase === "solve_submitted";
  const pendingItems = items.filter((i) => i.status === "pending" || i.status === "failed");
  const canImport = Boolean(jobId && stats.readyToImport > 0 && stats.crops > 0 && stats.solved === stats.crops);

  // ---------- start: one job per PDF, queued ----------
  async function startAll() {
    if (!files.length || !courseId || !groupId) return;
    setBusy(true); busyRef.current = true; setLog([]); setPollError(null);
    try {
      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const tag = files.length > 1 ? `(${f + 1}/${files.length}) ` : "";
        clearPdfRenderCache();
        setProgress(`${tag}Splitting ${file.name}…`);
        const mini: MiniPdf[] = await withTimeout(
          splitPdfInto2PageBlobs(file, (done, total) => setProgress(`${tag}Splitting ${file.name}: ${done}/${total} pages`), 1),
          180_000, "PDF split",
        );
        if (!mini.length) { addLog(`✗ ${file.name}: PDF appears empty`); continue; }

        const subjectCandidates = subjectId === "__auto__" ? subjects.map((s) => s.name) : [];
        const created: any = await createJobFn({
          data: {
            courseId, groupId,
            subjectId: subjectId === "__auto__" ? null : subjectId,
            pdfName: file.name, totalPages: mini.length, subjectCandidates,
          },
        });
        const id = created.jobId as string;
        setJobId(id);
        await refreshJobs();
        await loadJob(id).catch(() => {});
        addLog(`${file.name}: run created · ${mini.length} page(s)`);

        let slice: { pageNumber: number; base64: string; imagePath?: string }[] = [];
        const flush = async () => {
          if (!slice.length) return;
          await submitCutFn({ data: { jobId: id, pages: slice } });
          addLog(`${file.name}: sent ${slice.length} page(s) to the 50%-off border batch`);
          slice = [];
        };
        for (const m of mini) {
          setProgress(`${tag}Reading page ${m.pageFrom}/${mini.length} of ${file.name}…`);
          const pdfFile = miniPdfAsFile(m, file.name);
          const doc = await withTimeout(loadPdfForRenderPreferWorker(pdfFile), 60_000, `page ${m.pageFrom} open`);
          const canvas = await withTimeout(renderPageToCanvas(doc, 1, 1200), 60_000, `page ${m.pageFrom} render`);
          const base64 = canvasToJpegBase64(canvas, 0.68);
          canvas.width = 0; canvas.height = 0;

          // store the page picture so cutting never needs the PDF again
          let imagePath: string | undefined = `${id}/page-${m.pageFrom}.jpg`;
          const up = await supabase.storage.from(BUCKET)
            .upload(imagePath, base64ToBlob(base64), { contentType: "image/jpeg", upsert: true });
          if (up.error) { imagePath = undefined; addLog(`⚠ page ${m.pageFrom}: could not save the page picture (${up.error.message})`); }

          slice.push({ pageNumber: m.pageFrom, base64, imagePath });
          if (slice.length >= CUT_PAGES_PER_BATCH) await flush();
        }
        await flush();
        await loadJob(id).catch(() => {});
        addLog(`${file.name}: phase 1 submitted — you can leave this page, it keeps working`);
      }
      setFiles([]);
      setProgress("Gemini is reading the pages. This page checks automatically — nothing else to do.");
      toast.success("Started");
    } catch (e: any) {
      toast.error(e?.message || "Could not start");
      addLog(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false); busyRef.current = false;
      await refreshJobs();
      if (jobId) await loadJob(jobId).catch(() => {});
    }
  }

  // ---------- PHASE 2 ----------
  async function runPhase2() {
    if (!jobId) return;
    setBusy(true); busyRef.current = true;
    try {
      const pending = items.filter((i) => i.status === "pending" || i.status === "failed");
      setProgress(`Sending ${pending.length} question picture(s) to the 50%-off answer batch…`);
      let slice: { pageNumber: number; itemIndex: number; base64: string }[] = [];
      const flush = async () => {
        if (!slice.length) return;
        await submitSolveFn({ data: { jobId, items: slice } });
        addLog(`sent ${slice.length} question(s) to the answer batch`);
        slice = [];
      };
      for (const it of pending) {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(it.image_path);
        if (error || !blob) { addLog(`⚠ could not read ${it.image_path}`); continue; }
        slice.push({ pageNumber: it.page_number, itemIndex: it.item_index, base64: await blobToBase64(blob) });
        if (slice.length >= SOLVE_ITEMS_PER_BATCH) await flush();
      }
      await flush();
      await loadJob(jobId);
      setProgress("Gemini is answering the questions. This page checks automatically.");
    } catch (e: any) {
      toast.error(e?.message || "Could not start the answers");
      addLog(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false); busyRef.current = false;
      if (jobId) await loadJob(jobId).catch(() => {});
    }
  }

  async function runImport(allowDuplicates = false) {
    if (!jobId) return;
    setBusy(true); busyRef.current = true;
    try {
      const r: any = await importFn({ data: { jobId, allowDuplicates } });
      await loadJob(jobId);
      await refreshJobs();
      setProgress(`${r.inserted} imported · ${r.duplicates ?? r.skipped ?? 0} already existed · ${r.failed} failed.`);
      toast.success(`Imported ${r.inserted} question(s)`);
      if (r.errors?.length) addLog(r.errors.join(" · "));
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally { setBusy(false); busyRef.current = false; }
  }

  const primaryControl = (() => {
    if (busy) return { label: "Working…", disabled: true, action: () => {}, icon: <Loader2 className="animate-spin" size={16} /> };
    if (!jobId || job?.phase === "imported") return {
      label: files.length > 1 ? `Start ${files.length} PDFs` : "Start",
      disabled: !(files.length && courseId && groupId),
      action: startAll, icon: <PlayCircle size={16} />,
    };
    if (waitingForCut) return { label: "Gemini is reading the pages — checking automatically", disabled: true, action: () => {}, icon: <Loader2 className="animate-spin" size={16} /> };
    if (waitingForSolve) return { label: "Gemini is answering — checking automatically", disabled: true, action: () => {}, icon: <Loader2 className="animate-spin" size={16} /> };
    if (pages.some((p) => p.status === "cut_ready")) return {
      label: "Cutting the question pictures…", disabled: true, action: () => {}, icon: <Loader2 className="animate-spin" size={16} />,
    };
    if (canImport) return { label: `Import ${stats.readyToImport} questions`, disabled: false, action: () => runImport(false), icon: <Download size={16} /> };
    if (stats.duplicates && job?.phase === "imported") return {
      label: `Import ${stats.duplicates} duplicate(s) anyway`,
      disabled: false, action: () => runImport(true), icon: <Download size={16} />,
    };
    if (pendingItems.length) return {
      label: stats.failedItems ? `Retry ${pendingItems.length} question(s)` : `Solve ${pendingItems.length} questions`,
      disabled: false, action: runPhase2, icon: <PlayCircle size={16} />,
    };
    if (job?.phase === "cut_failed" || pages.some((p) => p.status === "cut_failed")) return {
      label: files.length ? "Start again with the selected PDF" : "This run failed — choose the PDF again above",
      disabled: !(files.length && courseId && groupId), action: startAll, icon: <AlertTriangle size={16} />,
    };
    return {
      label: files.length ? `Start ${files.length} PDF(s)` : "Nothing to do for this run",
      disabled: !(files.length && courseId && groupId), action: startAll, icon: <PlayCircle size={16} />,
    };
  })();

  const statusLine = (() => {
    if (progress) return progress;
    if (pollError || job?.error) return pollError || job?.error;
    if (!jobId) return "Choose where to save, then pick one or more exam PDFs.";
    if (waitingForCut) return "Gemini is reading the pages. You can close this page and come back.";
    if (waitingForSolve) return "Gemini is answering the questions. You can close this page and come back.";
    if (canImport) return "All answers are ready. You can import now.";
    if (pendingItems.length) return `${pendingItems.length} question picture(s) are waiting to be solved.`;
    if (job?.phase === "imported") return `${job.imported_count || stats.solved} question(s) imported.`;
    return "Run selected.";
  })();

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
          Pick one or more exam PDFs. Every page picture is saved first, so the run keeps working even if you refresh or close the page.
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
            <p className="mt-2 text-sm font-bold">
              {files.length === 0 ? "Click to choose one or more exam PDFs"
                : files.length === 1 ? files[0].name
                : `${files.length} PDFs selected`}
            </p>
            {files.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">{files.map((f) => f.name).join(" · ")}</p>
            )}
            <input type="file" accept="application/pdf" multiple className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
        </section>

        <section className={`rounded-2xl border p-5 mb-5 ${pollError || job?.error ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Current status</p>
              <p className="mt-1 text-base font-bold">{statusLine}</p>
              {lastChecked && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 size={12} /> Last checked {lastChecked}
                </p>
              )}
            </div>
            <button
              onClick={primaryControl.action}
              disabled={primaryControl.disabled}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {primaryControl.icon}
              {primaryControl.label}
            </button>
          </div>
        </section>

        {/* phases */}
        {job && (
          <section className="mb-5">
            <ReferenceBookCard
              saved={(job as any).reference_book ?? null}
              onSave={async (book) => {
                try {
                  const res = await setBook({ data: { jobId: job.id, book } });
                  setJob((j: any) => (j ? { ...j, reference_book: res.book } : j));
                  toast.success(res.book ? `Answers will follow ${res.book}` : "Reference book removed");
                } catch (e: any) {
                  toast.error(e?.message || "Could not save the book");
                }
              }}
            />
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-4 mb-5">
          <PhaseCard
            step="Phase 1" title="Read the pages"
            detail={stats.pages ? `${stats.cutDone}/${stats.pages} pages cut · ${stats.crops} question pictures` : "not started"}
            done={stats.phase1Done}
            action={<span className="text-xs font-bold text-muted-foreground">{waitingForCut ? "Gemini is processing" : stats.phase1Done ? "Complete" : stats.pages ? "Cutting" : "Not started"}</span>}
          />
          <PhaseCard
            step="Phase 2" title="Solve the questions"
            detail={stats.crops ? `${stats.solved}/${stats.crops} solved${stats.failedItems ? ` · ${stats.failedItems} failed` : ""}` : "waiting for phase 1"}
            done={stats.phase2Done}
            action={<span className="text-xs font-bold text-muted-foreground">{waitingForSolve ? "Gemini is processing" : stats.phase2Done ? "Complete" : stats.phase1Done ? "Ready when you are" : "Locked"}</span>}
          />
          <PhaseCard
            step="Import" title="Save into the subject"
            detail={job?.imported_count ? `${job.imported_count} imported` : canImport ? "ready to import" : "locked until phase 2 is done"}
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
                    ? `${Array.isArray(p.regions) ? p.regions.length : 0} borders · cutting`
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
                {stats.duplicates > 0 && (
                  <p className="mb-2 text-xs font-bold text-violet-600 dark:text-violet-400">
                    {stats.duplicates} question(s) are already in this subject. Use “Import duplicate(s) anyway” to add them again.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {items.map((it) => (
                    <span key={it.id} title={it.status === "duplicate" ? "already in this subject" : (it.error || it.status)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                        it.status === "imported" ? "bg-emerald-500/15 text-emerald-600"
                          : it.status === "solved" ? "bg-sky-500/15 text-sky-600"
                          : it.status === "failed" ? "bg-rose-500/15 text-rose-600"
                          : it.status === "duplicate" ? "bg-violet-500/15 text-violet-600"
                          : "bg-amber-500/15 text-amber-600"}`}>
                      p{it.page_number}q{it.item_index + 1}{it.correct_letter ? ` · ${it.correct_letter}` : ""}{it.status === "duplicate" ? " · already there" : ""}
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
                <li key={j.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${j.id === jobId ? "border-primary" : "border-border"}`}>
                  <button onClick={() => { setJobId(j.id); setProgress(""); setPollError(null); loadJob(j.id).catch(() => {}); }} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold truncate">{j.pdf_name}</div>
                    <div className="text-[11px] text-muted-foreground">{humanPhase(j.phase)} · {j.total_pages} pages · {j.imported_count} imported</div>
                  </button>
                  {j.imported_count > 0 && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
                  <button
                    onClick={async () => {
                      await delFn({ data: { jobId: j.id } });
                      if (jobId === j.id) { setJobId(null); setJob(null); setPages([]); setItems([]); }
                      refreshJobs();
                    }}
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

function humanPhase(phase: string) {
  switch (phase) {
    case "created": return "just created";
    case "cut_submitted": return "reading the pages";
    case "cut_ready": return "cutting pictures";
    case "cut_complete": return "ready to solve";
    case "cut_failed": return "page reading failed";
    case "solve_submitted": return "solving";
    case "solve_ready": return "ready to import";
    case "solve_failed": return "some answers failed";
    case "imported": return "imported";
    default: return phase;
  }
}

function PhaseCard({ step, title, detail, done, action }: { step: string; title: string; detail: string; done: boolean; action: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{step}</p>
      <p className="mt-1 text-sm font-black flex items-center gap-1.5">
        {done && <CheckCircle2 size={14} className="text-emerald-600" />} {title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}
