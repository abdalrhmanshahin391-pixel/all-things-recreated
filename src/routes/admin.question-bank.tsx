import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Library, Save, Trash2, Pencil, Download, Upload, Loader2, ArrowUp, ArrowDown,
  FolderInput, Search, CheckSquare, Square, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QB_SEMESTERS, QB_YEARS, sortGroups, type QbMeta } from "@/lib/question-bank";
import { useCourseOptions, yearLabel } from "@/lib/course-options";
import {
  qbAddToCourse, qbDeleteGroup, qbExportAll, qbImportAll, qbListGroups,
  qbReorderGroups, qbSaveGroup, qbUpdateGroup,
} from "@/lib/question-bank.functions";

export const Route = createFileRoute("/admin/question-bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — AquaQBank" },
      { name: "description", content: "Save finished question sets to Google Drive and reuse them in any course." },
    ],
  }),
  component: QuestionBankPage,
});

type Course = { id: string; title: string; year: number };
type Section = { id: string; name: string };
type Subject = { id: string; name: string };
type PickerQuestion = { id: string; stem: string };

function QuestionBankPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const options = useCourseOptions();

  const listFn = useServerFn(qbListGroups);
  const saveFn = useServerFn(qbSaveGroup);
  const updateFn = useServerFn(qbUpdateGroup);
  const reorderFn = useServerFn(qbReorderGroups);
  const deleteFn = useServerFn(qbDeleteGroup);
  const addFn = useServerFn(qbAddToCourse);
  const exportFn = useServerFn(qbExportAll);
  const importFn = useServerFn(qbImportAll);

  const [groups, setGroups] = useState<QbMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Source pickers
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  // New group form
  const [name, setName] = useState("");
  const [year, setYear] = useState(QB_YEARS[1]);
  const [semester, setSemester] = useState(QB_SEMESTERS[0]);
  const [subjectLabel, setSubjectLabel] = useState("");

  // Question picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<PickerQuestion[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pickerSearch, setPickerSearch] = useState("");

  // Add-to-course dialog
  const [target, setTarget] = useState<QbMeta | null>(null);
  const [targetCourse, setTargetCourse] = useState("");
  const [targetSections, setTargetSections] = useState<Section[]>([]);
  const [targetSection, setTargetSection] = useState("");
  const [targetName, setTargetName] = useState("");

  // Edit dialog
  const [editing, setEditing] = useState<QbMeta | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  async function refresh() {
    try {
      const res: any = await listFn({});
      setGroups(sortGroups(res.groups ?? []));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not reach Google Drive.");
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    (async () => {
      const { data } = await (supabase.from as any)("courses")
        .select("id,title,year")
        .eq("kind", "questions")
        .order("year")
        .order("title");
      const list = (data ?? []) as Course[];
      setCourses(list);
      if (list[0]) setCourseId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadSections(cid: string, forTarget = false) {
    const { data } = await (supabase.from as any)("subject_groups")
      .select("id,name").eq("course_id", cid).order("sort_order");
    const list = (data ?? []) as Section[];
    if (forTarget) {
      setTargetSections(list);
      setTargetSection(list[0]?.id ?? "");
    } else {
      setSections(list);
      setSectionId(list[0]?.id ?? "");
      setSubjects([]);
      setSubjectId("");
    }
  }

  useEffect(() => { if (courseId) void loadSections(courseId); }, [courseId]);
  useEffect(() => { if (targetCourse) void loadSections(targetCourse, true); }, [targetCourse]);

  useEffect(() => {
    if (!sectionId) { setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,name").eq("group_id", sectionId).order("sort_order");
      const list = (data ?? []) as Subject[];
      setSubjects(list);
      setSubjectId(list[0]?.id ?? "");
    })();
  }, [sectionId]);

  // Pre-fill the group name and subject label from what's selected.
  useEffect(() => {
    const s = subjects.find((x) => x.id === subjectId);
    if (s) {
      if (!name.trim()) setName(s.name);
      if (!subjectLabel.trim()) setSubjectLabel(s.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, subjects]);

  async function openPicker() {
    if (!subjectId) { toast.error("Pick a subject first."); return; }
    const { data } = await (supabase.from as any)("questions")
      .select("id,stem").eq("subject_id", subjectId).order("sort_order");
    const rows = (data ?? []) as PickerQuestion[];
    setPickerRows(rows);
    setPicked(Object.fromEntries(rows.map((r) => [r.id, true])));
    setPickerSearch("");
    setPickerOpen(true);
  }

  async function save(questionIds?: string[]) {
    if (!subjectId) { toast.error("Pick a course, section and subject first."); return; }
    if (!name.trim()) { toast.error("Give the group a name."); return; }
    setBusy("save");
    try {
      const res: any = await saveFn({
        data: {
          name: name.trim(),
          year,
          semester,
          subject: subjectLabel.trim() || name.trim(),
          subjectId,
          questionIds,
          source: courses.find((c) => c.id === courseId)?.title ?? null,
        },
      });
      toast.success(`Saved "${res.meta.name}" — ${res.meta.count} question(s) on Drive.`);
      setPickerOpen(false);
      setName("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the group.");
    } finally { setBusy(null); }
  }

  async function move(g: QbMeta, dir: -1 | 1) {
    const ordered = sortGroups(groups);
    const i = ordered.findIndex((x) => x.id === g.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const peer = ordered[j];
    if (peer.year !== g.year || peer.semester !== g.semester || peer.subject !== g.subject) return;
    const swapped = [...ordered];
    swapped[i] = peer;
    swapped[j] = g;
    const withOrder = swapped.map((x, n) => ({ ...x, sort_order: n + 1 }));
    setGroups(withOrder);
    try {
      await reorderFn({ data: { ids: withOrder.map((x) => x.id) } });
    } catch {
      toast.error("Could not save the new order.");
      void refresh();
    }
  }

  async function removeGroup(g: QbMeta) {
    if (!confirm(`Delete "${g.name}" from the Question Bank? The Drive file is removed too.`)) return;
    setBusy(g.id);
    try {
      await deleteFn({ data: { id: g.id } });
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      toast.success("Group deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally { setBusy(null); }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy("edit");
    try {
      await updateFn({
        data: {
          id: editing.id,
          name: editing.name,
          year: editing.year,
          semester: editing.semester,
          subject: editing.subject,
        },
      });
      setEditing(null);
      toast.success("Group updated.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally { setBusy(null); }
  }

  async function addToCourse() {
    if (!target || !targetSection) { toast.error("Pick a course and section."); return; }
    setBusy("add");
    try {
      const res: any = await addFn({
        data: { id: target.id, sectionId: targetSection, subjectName: targetName.trim() || target.name },
      });
      const bits = [`${res.saved} added`];
      if (res.skipped) bits.push(`${res.skipped} already there`);
      if (res.failed) bits.push(`${res.failed} failed`);
      toast.success(bits.join(" · "));
      setTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the group.");
    } finally { setBusy(null); }
  }

  async function exportAll() {
    setBusy("export");
    try {
      const bundle: any = await exportFn({});
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `question-bank-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${bundle.groups?.length ?? 0} group(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally { setBusy(null); }
  }

  async function importFile(file: File) {
    setBusy("import");
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed?.groups) ? parsed.groups : [];
      if (!list.length) throw new Error("That file has no groups in it.");
      const res: any = await importFn({ data: { groups: list } });
      toast.success(`Imported ${res.imported} group(s)${res.skipped ? `, ${res.skipped} skipped` : ""}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally { setBusy(null); }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = sortGroups(groups);
    if (!q) return sorted;
    return sorted.filter((g) =>
      [g.name, g.year, g.semester, g.subject, g.source ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [groups, search]);

  const shelves = useMemo(() => {
    const map = new Map<string, QbMeta[]>();
    for (const g of visible) {
      const key = `${g.year} › ${g.semester} › ${g.subject}`;
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    return [...map.entries()];
  }, [visible]);

  const pickerVisible = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return q ? pickerRows.filter((r) => r.stem.toLowerCase().includes(q)) : pickerRows;
  }, [pickerRows, pickerSearch]);

  const pickedCount = Object.values(picked).filter(Boolean).length;

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Library className="h-6 w-6" /></div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-black text-foreground">Question Bank</h1>
            <p className="text-sm text-muted-foreground">
              Park finished question sets on Google Drive and drop them into any course later.
            </p>
          </div>
          <button
            onClick={exportAll}
            disabled={busy === "export"}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export backup
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-foreground hover:bg-muted">
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import backup
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }}
            />
          </label>
        </header>

        {loadError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Save a new group */}
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-lg font-black text-foreground">Save questions as a group</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Course">
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={selectCls}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label="Section">
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={selectCls}>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Subject">
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={selectCls}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Group name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chemistry — First control" className={inputCls} />
            </Field>
            <Field label="Year">
              <input list="qb-years" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
              <datalist id="qb-years">{QB_YEARS.map((y) => <option key={y} value={y} />)}</datalist>
            </Field>
            <Field label="Semester">
              <input list="qb-semesters" value={semester} onChange={(e) => setSemester(e.target.value)} className={inputCls} />
              <datalist id="qb-semesters">{QB_SEMESTERS.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Subject label">
              <input value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)} placeholder="Chemistry" className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => save()}
              disabled={busy === "save"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save whole subject as a group
            </button>
            <button
              onClick={openPicker}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted"
            >
              <CheckSquare className="h-4 w-4" /> Pick individual questions
            </button>
          </div>
        </section>

        {/* Saved groups */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <span className="text-sm font-bold text-muted-foreground">{visible.length} group(s)</span>
          </div>

          {shelves.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing saved yet. Save your first group above.
            </p>
          )}

          {shelves.map(([shelf, list]) => (
            <div key={shelf} className="rounded-2xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
                {shelf}
              </h3>
              <ul className="divide-y divide-border">
                {list.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="min-w-[160px] flex-1">
                      <p className="font-bold text-foreground">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.count} question(s){g.source ? ` · from ${g.source}` : ""} · saved {new Date(g.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <IconBtn title="Move up" onClick={() => move(g, -1)}><ArrowUp className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Move down" onClick={() => move(g, 1)}><ArrowDown className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Edit" onClick={() => setEditing({ ...g })}><Pencil className="h-4 w-4" /></IconBtn>
                    <button
                      onClick={() => {
                        setTarget(g);
                        setTargetName(g.name);
                        setTargetCourse(courses[0]?.id ?? "");
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                    >
                      <FolderInput className="h-4 w-4" /> Add to course
                    </button>
                    <IconBtn title="Delete" onClick={() => removeGroup(g)} danger>
                      {busy === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </IconBtn>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>

      {/* Question picker */}
      {pickerOpen && (
        <Modal title={`Pick questions (${pickedCount}/${pickerRows.length})`} onClose={() => setPickerOpen(false)}>
          <input
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            placeholder="Search questions…"
            className={`${inputCls} mb-3`}
          />
          <div className="max-h-[45vh] space-y-1 overflow-auto rounded-lg border border-border p-2">
            {pickerVisible.map((r) => (
              <button
                key={r.id}
                onClick={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))}
                className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
              >
                {picked[r.id] ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-foreground">{r.stem}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setPicked(Object.fromEntries(pickerRows.map((r) => [r.id, true])))} className={ghostBtn}>Select all</button>
            <button onClick={() => setPicked({})} className={ghostBtn}>Clear</button>
            <button
              onClick={() => save(Object.keys(picked).filter((k) => picked[k]))}
              disabled={!pickedCount || busy === "save"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save {pickedCount} as group
            </button>
          </div>
        </Modal>
      )}

      {/* Add to course */}
      {target && (
        <Modal title={`Add "${target.name}" to a course`} onClose={() => setTarget(null)}>
          <div className="space-y-3">
            <Field label="Course">
              <select value={targetCourse} onChange={(e) => setTargetCourse(e.target.value)} className={selectCls}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {yearLabel(c.year, options)} · {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Section">
              <select value={targetSection} onChange={(e) => setTargetSection(e.target.value)} className={selectCls}>
                {targetSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="New subject name">
              <input value={targetName} onChange={(e) => setTargetName(e.target.value)} className={inputCls} />
            </Field>
            <p className="text-xs text-muted-foreground">
              A new subject is created with all {target.count} question(s) and their correct answers.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setTarget(null)} className={ghostBtn}>Cancel</button>
            <button
              onClick={addToCourse}
              disabled={busy === "add"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
              Add to course
            </button>
          </div>
        </Modal>
      )}

      {/* Edit group */}
      {editing && (
        <Modal title="Edit group" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Name">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Year">
              <input list="qb-years" value={editing.year} onChange={(e) => setEditing({ ...editing, year: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Semester">
              <input list="qb-semesters" value={editing.semester} onChange={(e) => setEditing({ ...editing, semester: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Subject">
              <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className={ghostBtn}>Cancel</button>
            <button
              onClick={saveEdit}
              disabled={busy === "edit"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const selectCls = inputCls;
const ghostBtn =
  "rounded-lg border border-border px-3 py-2 text-sm font-bold text-foreground hover:bg-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  children, onClick, title, danger,
}: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg border border-border p-2 hover:bg-muted ${danger ? "text-destructive" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
