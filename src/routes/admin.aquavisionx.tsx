import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "sonner";
import { ArrowLeft, Upload, PlayCircle, Loader2, Check, AlertTriangle, ScanEye, Brain, Download, X } from "lucide-react";
import { splitPdfInto2PageBlobs } from "@/lib/pdf-split";
import {
  createAqvJob,
  uploadAqvPage,
  submitAqvReadBatch,
  pollAqvRead,
  submitAqvAnswerBatch,
  pollAqvAnswers,
  importAqvJob,
  listAqvJobs,
  getAqvJob,
  deleteAqvJob,
  setAqvReferenceBook,
  setAqvComboSets,
  setAqvResource,
} from "@/lib/aquavisionx.functions";
import { ReferenceBookCard } from "@/components/admin/ReferenceBookCard";

export const Route = createFileRoute("/admin/aquavisionx")({
  head: () => ({
    meta: [
      { title: "AquaVisionX — Past-paper to solved questions" },
      { name: "description", content: "Turn a past-paper PDF into fully solved, explained questions using two 50% Gemini batch stages." },
      { property: "og:title", content: "AquaVisionX — Past-paper to solved questions" },
      { property: "og:description", content: "Two-stage 50% batch machine: read every page, then solve and explain every question." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Course = { id: string; title: string };
type Group = { id: string; name: string };
type Subject = { id: string; name: string };
type JobRow = {
  id: string; pdf_name: string; total_pages: number; stage: string;
  status: string; imported_count: number; error: string | null; created_at: string;
};

async function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function Page() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) guardRedirect(navigate);
  }, [user, isAdmin, loading, navigate]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [job, setJob] = useState<any | null>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const pollRef = useRef<number | null>(null);

  const listFn = useServerFn(listAqvJobs);
  const createFn = useServerFn(createAqvJob);
  const uploadFn = useServerFn(uploadAqvPage);
  const submitReadFn = useServerFn(submitAqvReadBatch);
  const pollReadFn = useServerFn(pollAqvRead);
  const submitAnswersFn = useServerFn(submitAqvAnswerBatch);
  const pollAnswersFn = useServerFn(pollAqvAnswers);
  const importFn = useServerFn(importAqvJob);
  const getFn = useServerFn(getAqvJob);
  const delFn = useServerFn(deleteAqvJob);
  const setBook = useServerFn(setAqvReferenceBook);
  const setCombos = useServerFn(setAqvComboSets);
  const setResource = useServerFn(setAqvResource);

  const say = (m: string) => setLog((p) => [`${new Date().toLocaleTimeString()} · ${m}`, ...p].slice(0, 120));

  async function refreshJobs() {
    try {
      const r: any = await listFn();
      setJobs(r.rows as JobRow[]);
    } catch { /* silent */ }
  }

  async function openJob(jobId: string) {
    try {
      const r: any = await getFn({ data: { jobId } });
      setJob(r.job);
      setPages(r.pages ?? []);
      setItems(r.items ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Could not load job");
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("id,title").order("created_at", { ascending: false });
      setCourses(((data ?? []) as any[]).map((r) => ({ id: r.id, title: r.title })));
    })();
    refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!courseId) { setGroups([]); setGroupId(""); return; }
    (async () => {
      const { data } = await supabase.from("subject_groups").select("id,name").eq("course_id", courseId).order("sort_order");
      setGroups((data ?? []) as Group[]);
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) { setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data } = await supabase.from("subjects").select("id,name").eq("group_id", groupId).order("sort_order");
      setSubjects((data ?? []) as Subject[]);
    })();
  }, [groupId]);

  // Resume polling whenever the open job is mid-batch.
  useEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (!job?.id) return;
    const stage = job.stage as string;
    if (stage !== "reading" && stage !== "solving") return;
    const tick = async () => {
      try {
        const r: any = stage === "reading"
          ? await pollReadFn({ data: { jobId: job.id } })
          : await pollAnswersFn({ data: { jobId: job.id } });
        if (r.stage !== stage) {
          say(`stage → ${r.stage}`);
          await openJob(job.id);
          refreshJobs();
        }
      } catch (e: any) {
        say(`poll error: ${e?.message || e}`);
      }
    };
    pollRef.current = window.setInterval(tick, 20_000);
    void tick();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.stage]);

  const canStart = !!(courseId && groupId && subjectId && file && !busy);

  async function handleStart() {
    if (!canStart || !file) return;
    setBusy(true);
    setLog([]);
    try {
      say(`splitting ${file.name} into single pages…`);
      const minis = await splitPdfInto2PageBlobs(file, (d, t) => { if (d === t || d % 5 === 0) say(`   • split ${d}/${t}`); }, 1);
      if (!minis.length) throw new Error("This PDF has no pages.");
      const { jobId }: any = await createFn({
        data: { courseId, groupId, subjectId, pdfName: file.name, totalPages: minis.length },
      });
      say(`job created · ${minis.length} page(s)`);
      for (const m of minis) {
        const b64 = await blobToBase64(m.blob);
        await uploadFn({ data: { jobId, pageNumber: m.pageFrom, pdfBase64: b64 } });
        say(`   • uploaded page ${m.pageFrom}/${minis.length}`);
      }
      const r: any = await submitReadFn({ data: { jobId } });
      say(`✓ stage 1 queued in Gemini batch (50% off) · ${r.pages} page request(s)`);
      setFile(null);
      await refreshJobs();
      await openJob(jobId);
    } catch (e: any) {
      toast.error(e?.message || "Failed to start");
      say(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSolve() {
    if (!job?.id) return;
    setBusy(true);
    try {
      const r: any = await submitAnswersFn({ data: { jobId: job.id } });
      say(`✓ stage 2 queued · ${r.questions} question(s) sent one by one`);
      await openJob(job.id);
      refreshJobs();
    } catch (e: any) {
      toast.error(e?.message || "Could not send for answers");
    } finally { setBusy(false); }
  }

  async function handleImport(allowPartial = false) {
    if (!job?.id) return;
    setBusy(true);
    try {
      const r: any = await importFn({ data: { jobId: job.id, allowPartial } });
      say(
        `🎉 imported ${r.inserted} question(s) · ${r.skipped} duplicate(s) · ${r.failed} failed` +
          (r.leftOut ? ` · ${r.leftOut} unsolved left out` : ""),
      );
      toast.success(`Imported ${r.inserted} question(s)`);
      await openJob(job.id);
      refreshJobs();
    } catch (e: any) {
      toast.error(e?.message || "Import blocked");
    } finally { setBusy(false); }
  }

  if (loading || !user || !isAdmin) return null;

  const stage = (job?.stage as string) || "";
  const pagesReady = pages.length > 0 && pages.every((p) => p.status === "ready" || p.status === "empty");
  const solvedCount = items.filter((i) => i.solved).length;
  const allSolved = items.length > 0 && solvedCount === items.length;
  const missingComboCount = items.filter((i) => i.status === "needs_combinations").length;
  const canSolve = !!job && pagesReady && items.length > 0 && !allSolved && !missingComboCount && stage !== "solving" && !busy;
  const canImport = !!job && allSolved && stage !== "imported" && !busy;
  const pendingSolved = items.filter((i) => i.solved && !i.imported).length;
  const canPartialImport = !!job && !allSolved && pendingSolved > 0 && !busy;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft size={14} /> Admin
        </Link>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <ScanEye className="text-primary" size={22} /> AquaVisionX
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Stage 1 reads every page of the past paper (one cheap batch request per page). Stage 2 solves and explains every
          question as pure text. Both stages run in Gemini batch mode — 50% price — and each button unlocks only when the
          stage before it is 100% complete.
        </p>

        {/* Setup */}
        <div className="rounded-2xl bg-card border border-border p-5 mb-5">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">1. Where to save</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">— course —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!courseId}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm disabled:opacity-50">
              <option value="">— group —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!groupId}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm disabled:opacity-50">
              <option value="">— subject —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mt-5 mb-3">2. Past-paper PDF</p>
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-border bg-muted/40 p-6 text-center hover:border-primary">
            <Upload className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-bold">{file ? file.name : "Click to choose a PDF"}</p>
            <p className="text-xs text-muted-foreground">Sent page by page — never the whole PDF in one request.</p>
            <input type="file" accept="application/pdf" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <button onClick={handleStart} disabled={!canStart}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
            Start stage 1 — read the paper
          </button>
        </div>

        {/* Active job */}
        {job && (
          <div className="rounded-2xl bg-card border border-border p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-black truncate">{job.pdf_name}</h2>
              <StagePill stage={stage} />
              <button onClick={() => setJob(null)} className="ml-auto p-1.5 rounded hover:bg-muted"><X size={14} /></button>
            </div>
            {job.error && (
              <div className="rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs mb-3">{job.error}</div>
            )}

            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <Stat label="Pages read" value={`${pages.filter((p) => p.status === "ready" || p.status === "empty").length}/${pages.length}`} />
              <Stat label="Questions read" value={String(items.length)} />
              <Stat label="Solved + explained" value={`${solvedCount}/${items.length}`} />
            </div>

            {pages.some((p) => p.status === "empty") && (
              <div className="mt-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs">
                {pages.filter((p) => p.status === "empty").length} page(s) returned no questions — check them before importing.
              </div>
            )}

            <div className="mt-4">
              <ReferenceBookCard
                saved={(job as any).reference_book ?? null}
                resource={{
                  kind: job.resource_kind, text: job.resource_text, url: job.resource_url, name: job.resource_name,
                }}
                onSave={async (book) => {
                  try {
                    const res = await setBook({ data: { jobId: job.id, book } });
                    setJob((j: any) => (j ? { ...j, reference_book: res.book } : j));
                    toast.success(res.book ? `Answers will follow ${res.book}` : "Reference book removed");
                  } catch (e: any) {
                    toast.error(e?.message || "Could not save the book");
                  }
                }}
                onSaveResource={async (value) => {
                  try {
                    let pdfBase64: string | undefined;
                    if (value?.kind === "pdf") {
                      if (!value.file) throw new Error("Choose a PDF first.");
                      if (value.file.size > 20_000_000) throw new Error("Resource PDFs must be 20 MB or smaller.");
                      pdfBase64 = await blobToBase64(value.file);
                    }
                    await setResource({ data: {
                      jobId: job.id, kind: value?.kind ?? null, text: value?.text, url: value?.url,
                      fileName: value?.file?.name, pdfBase64,
                    } });
                    await openJob(job.id);
                    toast.success(value ? "Answer resource saved" : "Answer resource removed");
                  } catch (e: any) { toast.error(e?.message || "Could not save the resource"); }
                }}
              />
            </div>

            {missingComboCount > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-black">{missingComboCount} combination question(s) need the printed A–D sets.</p>
                <p className="mt-1 text-xs">Enter each printed choice separated by a slash, for example: 1,2,3,4 / 1,4 / 2,3 / 1,2. Stage 2 stays blocked until this is repaired.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={handleSolve} disabled={!canSolve}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40">
                <Brain size={16} /> Send for answers (stage 2)
              </button>
              <button onClick={() => handleImport(false)} disabled={!canImport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">
                <Download size={16} /> Import
              </button>
              {canPartialImport && (
                <button onClick={() => handleImport(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-600 text-emerald-600 font-bold text-sm">
                  <Download size={16} /> Import solved only ({pendingSolved})
                </button>
              )}
              {stage === "reading" && <span className="text-xs text-muted-foreground">waiting for Gemini to read the pages…</span>}
              {stage === "solving" && <span className="text-xs text-muted-foreground">waiting for Gemini to solve every question…</span>}
            </div>

            {items.length > 0 && (
              <ul className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {items.map((it) => (
                  <li key={it.id} className="rounded-xl border border-border px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold">{it.number ? `Q${it.number}` : `#${it.item_index + 1}`}</span>
                      <StagePill stage={it.status} />
                      {it.answer_mode === "multiple" && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-black text-amber-700">MULTIPLE</span>
                      )}
                      {it.answer_letter && <span className="ml-auto font-black text-emerald-600">{it.answer_letter}</span>}
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{it.stem}</p>
                    {it.concept && <p className="text-[11px] text-muted-foreground mt-0.5">{it.concept}</p>}
                    {it.error && <p className="text-[11px] text-destructive mt-0.5">{it.error}</p>}
                    {it.status === "needs_combinations" && (
                      <CombinationRepair onSave={async (sets) => {
                        try {
                          await setCombos({ data: { itemId: it.id, combinations: sets } });
                          await openJob(job.id);
                          toast.success("Printed combinations saved");
                        } catch (e: any) { toast.error(e?.message || "Could not save combinations"); }
                      }} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {log.length > 0 && (
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 mb-5 text-xs font-mono max-h-64 overflow-y-auto">
            {log.map((l, i) => <div key={i} className="py-0.5">{l}</div>)}
          </div>
        )}

        {/* Jobs */}
        <div className="rounded-2xl bg-card border border-border p-5">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Recent jobs</p>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <button onClick={() => openJob(j.id)} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold truncate">{j.pdf_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {j.total_pages} page(s) · {j.imported_count} imported
                    </div>
                  </button>
                  <StagePill stage={j.stage} />
                  <button onClick={async () => { await delFn({ data: { jobId: j.id } }); if (job?.id === j.id) setJob(null); refreshJobs(); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CombinationRepair({ onSave }: { onSave: (sets: string[][]) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const parse = () => value.split(/[\/\n]/).map((part) => [...new Set(part.match(/\d+/g) ?? [])]).filter((set) => set.length >= 2);
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="1,2,3,4 / 1,4 / 2,3 / 1,2"
        className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-background px-3 py-2 text-xs" />
      <button type="button" disabled={saving || parse().length < 2} onClick={async () => { setSaving(true); try { await onSave(parse()); } finally { setSaving(false); } }}
        className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
        {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} Save printed sets
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}

function StagePill({ stage }: { stage: string }) {
  const map: Record<string, { cls: string; label: string; spin?: boolean }> = {
    uploading: { cls: "bg-muted text-muted-foreground", label: "uploading", spin: true },
    reading: { cls: "bg-blue-500/15 text-blue-600", label: "reading pages", spin: true },
    read_ready: { cls: "bg-indigo-500/15 text-indigo-600", label: "pages read" },
    read_failed: { cls: "bg-destructive/15 text-destructive", label: "read failed" },
    solving: { cls: "bg-amber-500/15 text-amber-600", label: "solving", spin: true },
    solve_partial: { cls: "bg-amber-500/15 text-amber-600", label: "some failed" },
    solve_failed: { cls: "bg-destructive/15 text-destructive", label: "solve failed" },
    solved: { cls: "bg-emerald-500/15 text-emerald-600", label: "ready to import" },
    imported: { cls: "bg-emerald-500/15 text-emerald-600", label: "imported" },
    read: { cls: "bg-muted text-muted-foreground", label: "read" },
    in_batch: { cls: "bg-amber-500/15 text-amber-600", label: "in batch", spin: true },
    failed: { cls: "bg-destructive/15 text-destructive", label: "failed" },
    duplicate: { cls: "bg-muted text-muted-foreground", label: "duplicate" },
  };
  const m = map[stage] || { cls: "bg-muted text-muted-foreground", label: stage || "—" };
  const Ico = m.spin ? Loader2 : stage === "failed" || stage.endsWith("_failed") ? AlertTriangle : Check;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${m.cls}`}>
      <Ico size={10} className={m.spin ? "animate-spin" : ""} />
      {m.label}
    </span>
  );
}