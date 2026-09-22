// Aqua MCQ Gen Pro — Station 3 & 4: Solve & Explain, then Import.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  amgGetGroup, amgUpdateGroup, amgSolveBatch, amgProgress, amgImportGroup,
  amgAddPdfSource, amgListPdfSources, amgDeletePdfSource, amgImportCourseSubject,
} from "@/lib/aqua-mcq-gen.functions";

const SOURCE_BUCKET = "amg-sources";

export const Route = createFileRoute("/admin/aqua-mcq-gen/$groupId/solve")({
  head: () => ({
    meta: [
      { title: "Solve & import — Aqua MCQ Gen Pro" },
      { name: "description", content: "Answer, explain and import approved past-paper questions." },
      { property: "og:title", content: "Solve & import — Aqua MCQ Gen Pro" },
      { property: "og:description", content: "Answer, explain and import approved past-paper questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SolveScreen,
});

type Progress = { total: number; pending: number; approved: number; imported: number; solved: number; failed: number };
type SavedSolveRun = { state: "active" | "paused" | "failed" | "completed"; log: string[]; updatedAt: string };

function SolveScreen() {
  const { groupId } = Route.useParams();
  const getGroup = useServerFn(amgGetGroup);
  const updateGroup = useServerFn(amgUpdateGroup);
  const solveBatch = useServerFn(amgSolveBatch);
  const progressFn = useServerFn(amgProgress);
  const importFn = useServerFn(amgImportGroup);
  const addPdfSource = useServerFn(amgAddPdfSource);
  const listPdfSources = useServerFn(amgListPdfSources);
  const deletePdfSource = useServerFn(amgDeletePdfSource);
  const importCourseSubject = useServerFn(amgImportCourseSubject);

  const [group, setGroup] = useState<any>(null);
  const [stats, setStats] = useState<Progress | null>(null);
  const [answerSource, setAnswerSource] = useState("ai");
  const [answerKey, setAnswerKey] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [preferSource, setPreferSource] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [pdfSources, setPdfSources] = useState<{ id: string; file_name: string }[]>([]);
  const stopRef = useRef(false);
  const runStorageKey = `amg-solve-run:${groupId}`;
  const [savedRun, setSavedRun] = useState<SavedSolveRun | null>(null);

  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [courseId, setCourseId] = useState("");
  const [sgId, setSgId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const say = (m: string) => setLog((p) => [`${new Date().toLocaleTimeString()} · ${m}`, ...p].slice(0, 80));

  async function refresh() {
    try {
      const r: any = await getGroup({ data: { groupId } });
      setGroup(r.group);
      setAnswerSource(String(r.group?.answer_source ?? "ai"));
      setAnswerKey(String(r.group?.answer_key ?? ""));
      setSourceText(String(r.group?.source_text ?? ""));
      setPreferSource(Boolean(r.group?.prefer_source));
      setStats(await progressFn({ data: { groupId } }) as any);
      setPdfSources(await listPdfSources({ data: { groupId } }) as any);
    } catch (e: any) {
      toast.error(e?.message || "Could not load this group");
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(runStorageKey);
      if (raw) {
        const saved = JSON.parse(raw) as SavedSolveRun;
        setSavedRun(saved);
        setLog(Array.isArray(saved.log) ? saved.log.slice(0, 80) : []);
      }
    } catch {
      window.localStorage.removeItem(runStorageKey);
    }
    void refresh();
    (async () => {
      const { data } = await supabase.from("courses").select("id,title").order("created_at", { ascending: false });
      setCourses(((data ?? []) as any[]).map((r) => ({ id: r.id, title: r.title })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, runStorageKey]);

  function saveRun(state: SavedSolveRun["state"], nextLog = log) {
    const value: SavedSolveRun = { state, log: nextLog.slice(0, 80), updatedAt: new Date().toISOString() };
    setSavedRun(value);
    window.localStorage.setItem(runStorageKey, JSON.stringify(value));
  }

  useEffect(() => {
    if (!courseId) { setGroups([]); setSgId(""); return; }
    (async () => {
      const { data } = await supabase.from("subject_groups").select("id,name").eq("course_id", courseId).order("sort_order");
      setGroups((data ?? []) as any);
    })();
  }, [courseId]);

  useEffect(() => {
    if (!sgId) { setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data } = await supabase.from("subjects").select("id,name").eq("group_id", sgId).order("sort_order");
      setSubjects((data ?? []) as any);
    })();
  }, [sgId]);

  async function saveSettings() {
    setBusy(true);
    try {
      await updateGroup({ data: { groupId, patch: { answer_source: answerSource as "ai" | "source" | "key", answer_key: answerKey, source_text: sourceText, prefer_source: preferSource } } });
      toast.success("Saved");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function runSolve() {
    stopRef.current = false;
    setRunning(true);
    saveRun("active");
    try {
      await updateGroup({ data: { groupId, patch: { answer_source: answerSource as "ai" | "source" | "key", answer_key: answerKey, source_text: sourceText, prefer_source: preferSource } } });
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stopRef.current) { say("Paused. You can continue later."); saveRun("paused"); break; }
        const r: any = await solveBatch({ data: { groupId, limit: 4 } });
        if (r.solved) say(`Solved ${r.solved} — ${r.remaining} left`);
        for (const f of r.failures ?? []) say(f);
        setStats(await progressFn({ data: { groupId } }) as any);
        if (!r.solved && !(r.failures ?? []).length) { say("Nothing left to solve."); saveRun("completed"); break; }
        if (r.remaining === 0) { say("All approved questions are solved."); saveRun("completed"); break; }
        if (!r.solved) { say("Paused — the remaining questions keep failing."); saveRun("failed"); break; }
      }
    } catch (e: any) {
      toast.error(e?.message || "Solving failed");
      say(String(e?.message ?? e));
      saveRun("failed");
    } finally {
      setRunning(false);
    }
  }

  async function runImport() {
    if (!subjectId) { toast.error("Pick the course section first"); return; }
    setBusy(true);
    try {
      const r: any = await importFn({ data: { groupId, subjectId } });
      toast.success(`Imported ${r.inserted} question(s)`);
      say(`Imported ${r.inserted}, skipped ${r.skipped}, failed ${r.failed}`);
      for (const e of r.errors ?? []) say(e);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSourcePdf(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("The PDF must be 20 MB or smaller."); return; }
    setBusy(true);
    const storagePath = `${groupId}/${crypto.randomUUID()}.pdf`;
    try {
      const { loadPdfForText, getPageText, clearPdfRenderCache } = await import("@/lib/pdf-page-render");
      const doc = await loadPdfForText(file);
      const pages: string[] = [];
      for (let page = 1; page <= Number(doc.numPages || 0); page++) pages.push(await getPageText(doc, page));
      clearPdfRenderCache();
      if (!pages.some((page) => page.trim())) throw new Error("No selectable text was found in this PDF.");
      const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      await addPdfSource({ data: { groupId, fileName: file.name, storagePath, pages } });
      setPdfSources(await listPdfSources({ data: { groupId } }) as any);
      toast.success("Source PDF added. The AI will find the relevant sections for each question.");
    } catch (e: any) {
      await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
      toast.error(e?.message || "Could not read this PDF");
    } finally { setBusy(false); }
  }

  async function removeSource(id: string) {
    setBusy(true);
    try {
      await deletePdfSource({ data: { sourceId: id } });
      setPdfSources(await listPdfSources({ data: { groupId } }) as any);
    } catch (e: any) { toast.error(e?.message || "Could not remove the source"); }
    finally { setBusy(false); }
  }

  async function bringCourseQuestions() {
    if (!subjectId) { toast.error("Pick a course section first"); return; }
    setBusy(true);
    try {
      const result: any = await importCourseSubject({ data: { groupId, subjectId } });
      toast.success(`Added ${result.imported} existing question(s) for re-solving.`);
      await refresh();
    } catch (e: any) { toast.error(e?.message || "Could not add the questions"); }
    finally { setBusy(false); }
  }

  const pct = useMemo(() => {
    if (!stats?.approved) return 0;
    return Math.round((stats.solved / stats.approved) * 100);
  }, [stats]);
  const unfinished = Math.max(0, (stats?.approved ?? 0) - (stats?.solved ?? 0));
  const canContinue = unfinished > 0 && savedRun && savedRun.state !== "completed";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link to="/admin/aqua-mcq-gen">Back to groups</Link></Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/aqua-mcq-gen/$groupId/approval" params={{ groupId }}>Final approval</Link>
        </Button>
        <h1 className="text-lg font-semibold">{group?.name ?? "Solve & import"}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Progress value={pct} />
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            <span>Total: {stats?.total ?? 0}</span>
            <span>Waiting for approval: {stats?.pending ?? 0}</span>
            <span>Approved: {stats?.approved ?? 0}</span>
            <span>Solved: {stats?.solved ?? 0}</span>
            <span>Failed: {stats?.failed ?? 0}</span>
            <span>Imported: {stats?.imported ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">How should the answers be decided?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "ai", label: "Let the AI answer" },
              { id: "source", label: "Answer from my source" },
              { id: "key", label: "Use my answer key" },
            ].map((o) => (
              <Button key={o.id} size="sm" variant={answerSource === o.id ? "default" : "outline"}
                onClick={() => setAnswerSource(o.id)}>{o.label}</Button>
            ))}
          </div>

          {answerSource !== "key" && (
            <div className="flex items-center gap-2">
              <Switch checked={preferSource} onCheckedChange={setPreferSource} id="prefer" />
              <Label htmlFor="prefer" className="text-sm">Always prefer my source text over the AI's own knowledge</Label>
            </div>
          )}

          {(answerSource === "source" || preferSource) && (
            <div className="space-y-3">
              <Label className="text-sm">Source PDF</Label>
              <Input type="file" accept="application/pdf" disabled={busy} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadSourcePdf(file);
                event.currentTarget.value = "";
              }} />
              {pdfSources.map((source) => (
                <div key={source.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{source.file_name}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeSource(source.id)} disabled={busy}>Remove</Button>
                </div>
              ))}
              <Label className="text-sm">Extra source / reference text</Label>
              <Textarea rows={6} value={sourceText} onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste the book chapter, lecture notes or any text the answers must come from." />
            </div>
          )}

          {answerSource === "key" && (
            <div className="space-y-1">
              <Label className="text-sm">Answer key</Label>
              <Textarea rows={6} value={answerKey} onChange={(e) => setAnswerKey(e.target.value)}
                placeholder={"One per line, e.g.\n1: C\n2: A\n3: 1,3"} />
              <p className="text-xs text-muted-foreground">
                Questions that are not in the key are answered by the AI.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={saveSettings} disabled={busy || running}>Save</Button>
            <Button size="sm" onClick={runSolve} disabled={running || !stats?.approved}>
              {running ? "Solving…" : canContinue ? `Continue solving (${unfinished} left)` : "Solve & explain approved questions"}
            </Button>
            {running && (
              <Button size="sm" variant="destructive" onClick={() => { stopRef.current = true; }}>Stop</Button>
            )}
          </div>
          {canContinue && !running && (
            <p className="text-xs text-muted-foreground">
              Your completed questions are saved. Continue from the next unsolved question whenever you are ready.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Import into a course</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={courseId}
              onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Choose a course…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={sgId}
              onChange={(e) => setSgId(e.target.value)} disabled={!groups.length}>
              <option value="">Choose a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)} disabled={!subjects.length}>
              <option value="">Choose a subject…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={runImport} disabled={busy || running || !subjectId}>
            Import {stats?.solved ?? 0} solved question(s)
          </Button>
          <Button size="sm" variant="outline" onClick={bringCourseQuestions} disabled={busy || running || !subjectId}>
            Bring this subject into MCQ Gen for re-solving
          </Button>
        </CardContent>
      </Card>

      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-56 space-y-1 overflow-auto text-xs text-muted-foreground">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
