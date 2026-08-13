import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, ArrowUp, ArrowDown, PlayCircle, Loader2, Check, AlertTriangle, Sparkles } from "lucide-react";
import {
  createGermanJobIpad,
  extractAndSubmitGermanIpad,
  pollGermanJobIpad,
  importGermanJobIpad,
  listGermanJobsIpad,
  getGermanJobIpad,
  deleteGermanJobIpad,
} from "@/lib/german-batch-ipad.functions";

export const Route = createFileRoute("/admin/jarvis-batch-german-ipad")({
  head: () => ({ meta: [{ title: "50% iPad Germany — Jarvis Batch" }] }),
  component: Page,
});

type Course = { id: string; title: string };
type Group = { id: string; name: string };
type Subject = { id: string; name: string; group_id: string };
type QueueItem = { id: string; file: File; name: string };
type JobRow = {
  id: string;
  pdf_name: string;
  kind: "words" | "sentences";
  status: string;
  batch_status: string | null;
  total_images: number;
  imported_pairs: number;
  error: string | null;
  created_at: string;
};

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function Page() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [kind, setKind] = useState<"words" | "sentences">("sentences");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [activeChunks, setActiveChunks] = useState<any[]>([]);
  const cancelRef = useRef(false);

  const listFn = useServerFn(listGermanJobsIpad);
  const createFn = useServerFn(createGermanJobIpad);
  const extractFn = useServerFn(extractAndSubmitGermanIpad);
  const pollFn = useServerFn(pollGermanJobIpad);
  const importFn = useServerFn(importGermanJobIpad);
  const getFn = useServerFn(getGermanJobIpad);
  const delFn = useServerFn(deleteGermanJobIpad);

  const log = (m: string) => setRunLog((p) => [`${new Date().toLocaleTimeString()} · ${m}`, ...p].slice(0, 100));

  async function refreshJobs() {
    try {
      const r: any = await listFn();
      setJobs(r.rows as JobRow[]);
    } catch (e: any) {
      // silent
      void e;
    }
  }

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase
        .from("courses").select("id,title,published")
        .order("created_at", { ascending: false });
      setCourses(((c ?? []) as any[]).map((r) => ({ id: r.id, title: r.title })));
    })();
    refreshJobs();
    const t = setInterval(refreshJobs, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!courseId) { setGroups([]); setGroupId(""); setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data: g } = await supabase
        .from("subject_groups").select("id,name").eq("course_id", courseId).order("sort_order");
      setGroups((g ?? []) as Group[]);
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) { setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data: s } = await supabase
        .from("subjects").select("id,name,group_id").eq("group_id", groupId).order("sort_order");
      setSubjects((s ?? []) as Subject[]);
    })();
  }, [groupId]);

  const canStart = courseId && groupId && subjectId && queue.length > 0 && !busy;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!arr.length) { toast.error("Only PDF files are supported."); return; }
    const items: QueueItem[] = arr.map((f) => ({ id: crypto.randomUUID(), file: f, name: f.name }));
    setQueue((p) => [...p, ...items]);
  }

  function moveQueue(idx: number, dir: -1 | 1) {
    setQueue((p) => {
      const next = p.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function openJob(jobId: string) {
    try {
      const r: any = await getFn({ data: { jobId } });
      setActiveJob(r.job);
      setActiveChunks(r.chunks ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Could not load job");
    }
  }

  async function handleStartQueue() {
    if (!canStart) return;
    setBusy(true);
    setRunLog([]);
    cancelRef.current = false;
    const batchJobIds: string[] = [];

    // Phase 1 — for each PDF in order: create job → extract images server-side → submit batch
    for (let i = 0; i < queue.length; i++) {
      if (cancelRef.current) break;
      const item = queue[i];
      log(`▶ (${i + 1}/${queue.length}) ${item.name}: preparing…`);
      try {
        const { jobId }: any = await createFn({
          data: { courseId, subjectId, pdfName: item.name, kind, queueOrder: i },
        });
        log(`   • job created ${jobId.slice(0, 8)}`);
        const base64 = await fileToBase64(item.file);
        log(`   • uploading & extracting images on server…`);
        const r: any = await extractFn({ data: { jobId, pdfBase64: base64 } });
        if (!r.batchName) {
          log(`   ⚠ no images found in ${item.name}`);
        } else {
          log(`   ✓ ${r.totalImages} image(s) sent to Gemini batch`);
          batchJobIds.push(jobId);
        }
      } catch (e: any) {
        log(`   ✗ ${item.name}: ${e?.message || e}`);
      }
      await refreshJobs();
    }

    // Clear the queue: everything has been submitted.
    setQueue([]);

    // Phase 2 — poll every batch until ready, then import.
    log(`⏳ waiting for Gemini batches to finish (this is where the 50% discount pays off)…`);
    const pending = new Set(batchJobIds);
    while (pending.size > 0 && !cancelRef.current) {
      await new Promise((r) => setTimeout(r, 20_000));
      await refreshJobs();
      for (const jobId of Array.from(pending)) {
        try {
          const p: any = await pollFn({ data: { jobId } });
          if (p.status === "batch_ready") {
            log(`   ✓ batch ready for job ${jobId.slice(0, 8)} → importing`);
            try {
              const imp: any = await importFn({ data: { jobId } });
              log(`   ✓ imported ${imp.imported} MCQ(s) from ${imp.images} image(s)`);
            } catch (e: any) {
              log(`   ✗ import failed for ${jobId.slice(0, 8)}: ${e?.message || e}`);
            }
            pending.delete(jobId);
          } else if (p.status === "failed") {
            log(`   ✗ batch failed for ${jobId.slice(0, 8)}`);
            pending.delete(jobId);
          }
        } catch (e: any) {
          log(`   ⚠ poll error ${jobId.slice(0, 8)}: ${e?.message || e}`);
        }
      }
    }

    log(`🎉 all done`);
    setBusy(false);
    refreshJobs();
  }

  const subjectOptions = useMemo(() => {
    return subjects.map((s) => ({ id: s.id, label: s.name }));
  }, [subjects]);

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
              <ArrowLeft size={14} /> Home
            </Link>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Sparkles className="text-emerald-600" size={22} />
              50% iPad Germany
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Extracts every picture in a German PDF, translates it with Gemini (50% batch price), and imports MCQs into a German course.
            </p>
            <Link to="/admin/gemini-keys" className="mt-2 inline-block text-xs font-bold text-emerald-700 hover:underline">
              Manage Gemini keys →
            </Link>
          </div>
        </div>

        {/* Step 1: choose destination */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">1. Where to save</p>
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600">Course</label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">— pick a course —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Group</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={!courseId}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm disabled:opacity-50"
              >
                <option value="">— pick a group —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!groupId}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm disabled:opacity-50"
              >
                <option value="">— pick a subject —</option>
                {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Save as</label>
              <div className="mt-1 flex gap-2">
                {(["sentences", "words"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex-1 ${kind === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
                  >
                    {k === "sentences" ? "Sentences" : "Words"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: PDF queue */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">2. PDF queue</p>
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center hover:border-emerald-400">
            <Upload className="mx-auto text-slate-400" />
            <p className="mt-2 text-sm font-bold text-slate-700">Click or drop PDFs</p>
            <p className="text-xs text-slate-500">PDFs run in order — first PDF gets extracted &amp; sent to Gemini, then the next.</p>
            <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>

          {queue.length > 0 && (
            <ul className="mt-4 space-y-2">
              {queue.map((q, i) => (
                <li key={q.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-black text-slate-500 w-6">{i + 1}.</span>
                  <span className="text-sm flex-1 truncate">{q.name}</span>
                  <button onClick={() => moveQueue(i, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-white disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button onClick={() => moveQueue(i, 1)} disabled={i === queue.length - 1} className="p-1.5 rounded hover:bg-white disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button onClick={() => setQueue((p) => p.filter((x) => x.id !== q.id))} className="p-1.5 rounded hover:bg-white text-rose-600"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleStartQueue}
              disabled={!canStart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
              {busy ? "Running…" : "Start queue"}
            </button>
            {busy && (
              <button onClick={() => { cancelRef.current = true; }} className="text-xs font-bold text-slate-500 hover:text-rose-600">
                Cancel queue
              </button>
            )}
            <span className="text-xs text-slate-500 ml-auto">gemini batch · 50% off</span>
          </div>
        </div>

        {runLog.length > 0 && (
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 mb-5 text-xs font-mono max-h-64 overflow-y-auto">
            {runLog.map((l, i) => <div key={i} className="py-0.5">{l}</div>)}
          </div>
        )}

        {/* Recent jobs */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Recent jobs</p>
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-400">No jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <button onClick={() => openJob(j.id)} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold truncate">{j.pdf_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {j.kind} · {j.status} {j.batch_status ? `(${j.batch_status})` : ""} · {j.total_images || 0} images · {j.imported_pairs || 0} MCQs imported
                    </div>
                  </button>
                  <StatusPill status={j.status} />
                  <button onClick={async () => { await delFn({ data: { jobId: j.id } }); refreshJobs(); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Job detail */}
        {activeJob && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setActiveJob(null)}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-black">{activeJob.pdf_name}</h2>
                <button onClick={() => setActiveJob(null)} className="p-1.5 rounded hover:bg-slate-100"><X size={16} /></button>
              </div>
              <div className="text-xs text-slate-500 mb-3">
                {activeJob.status} · {activeJob.total_images || 0} images · {activeJob.imported_pairs || 0} MCQs imported
              </div>
              {activeJob.error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-xs mb-3">{activeJob.error}</div>
              )}
              <ul className="space-y-2">
                {activeChunks.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold">Image #{c.image_index + 1}</span>
                      <span className="text-slate-400">(page {c.page_number})</span>
                      <StatusPill status={c.status} />
                      <span className="ml-auto text-slate-500">{c.imported_count} MCQs</span>
                    </div>
                    {Array.isArray(c.pairs_json) && c.pairs_json.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {c.pairs_json.slice(0, 4).map((p: any, i: number) => (
                          <li key={i} className="text-[11px] text-slate-600 truncate">
                            <b>{p.german}</b> → {p.english}
                          </li>
                        ))}
                        {c.pairs_json.length > 4 && <li className="text-[11px] text-slate-400">+{c.pairs_json.length - 4} more…</li>}
                      </ul>
                    )}
                    {c.error && <div className="text-[11px] text-rose-600 mt-1">{c.error}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    pending: { cls: "bg-slate-100 text-slate-600", icon: Loader2, label: "pending" },
    extracting: { cls: "bg-blue-100 text-blue-700", icon: Loader2, label: "extracting" },
    awaiting_batch: { cls: "bg-amber-100 text-amber-700", icon: Loader2, label: "waiting for Gemini" },
    batch_ready: { cls: "bg-indigo-100 text-indigo-700", icon: Check, label: "batch ready" },
    imported: { cls: "bg-emerald-100 text-emerald-700", icon: Check, label: "done" },
    empty: { cls: "bg-slate-100 text-slate-500", icon: Check, label: "no german" },
    failed: { cls: "bg-rose-100 text-rose-700", icon: AlertTriangle, label: "failed" },
  };
  const m = map[status] || { cls: "bg-slate-100 text-slate-600", icon: Loader2, label: status };
  const Ico = m.icon;
  const spinning = status === "extracting" || status === "awaiting_batch" || status === "pending";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${m.cls}`}>
      <Ico size={10} className={spinning ? "animate-spin" : ""} />
      {m.label}
    </span>
  );
}
