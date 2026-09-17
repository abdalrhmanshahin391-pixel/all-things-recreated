import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ListPlus, Plus, Save, X, FolderPlus, Sparkles, Upload, Loader2, ImageIcon, KeyRound, Film, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateQuestionFromImage, generateQuestionsFromVideo, extractQuestionFromImage, insertExtractedQuestion } from "@/lib/jarvis.functions";
import { extractFrames } from "@/lib/jarvis-video-frames";
import { PdfImportButton } from "@/components/admin/PdfImporter";
import { BatchPdfImportButton } from "@/components/admin/BatchPdfImporter";
import { GermanImportButton } from "@/components/admin/GermanImportButton";
import { QuestionListEditor } from "@/components/admin/QuestionListEditor";
import { QuestionImagePicker } from "@/components/admin/QuestionImagePicker";
import { useCourseOptions, yearLabel, getYearSortPriority } from "@/lib/course-options";

export const Route = createFileRoute("/admin/questions")({
  head: () => ({ meta: [{ title: "Q add choice — AquaQBank" }] }),
  component: AdminQuestionsPage,
});

type Course = { id: string; title: string; year: number; kind: string; university_id: string | null };
type SubjectGroup = { id: string; course_id: string; name: string; sort_order: number };
type Subject = { id: string; group_id: string; name: string; sort_order: number };
type University = { id: string; name: string; short_name: string | null };

const LETTERS = "ABCDEFGHIJ".split("");
type NewChoice = { text: string; is_correct: boolean };
const emptyChoices = (): NewChoice[] => [
  { text: "", is_correct: true },
  { text: "", is_correct: false },
  { text: "", is_correct: false },
  { text: "", is_correct: false },
];

function AdminQuestionsPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const options = useCourseOptions();
  const [courses, setCourses] = useState<Course[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState<string>("");
  const [groups, setGroups] = useState<SubjectGroup[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [stem, setStem] = useState("");
  const [explanation, setExplanation] = useState("");
  const [choices, setChoices] = useState<NewChoice[]>(emptyChoices);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [coursesRes, uniRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,year,kind,university_id")
          .eq("kind", "questions")
          .order("year", { ascending: true })
          .order("title", { ascending: true }),
        supabase
          .from("universities")
          .select("id,name,short_name")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (coursesRes.error) { setError(coursesRes.error.message); return; }
      const list = (coursesRes.data as Course[]) ?? [];
      setCourses(list);
      const uniList = (uniRes.data as University[]) ?? [];
      setUniversities(uniList);
      const firstUni = uniList[0]?.id ?? "";
      setUniversityId(firstUni);
      const firstCourse = list.find((c) => c.university_id === firstUni) ?? list[0];
      if (firstCourse) setCourseId(firstCourse.id);
    })();
  }, [isAdmin]);

  // When university changes, narrow course selection.
  useEffect(() => {
    if (!universityId) return;
    const inUni = courses.filter((c) => c.university_id === universityId);
    if (inUni.length && !inUni.some((c) => c.id === courseId)) {
      setCourseId(inUni[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId, courses]);

  const filteredCourses = useMemo(() => {
    const list = universityId ? courses.filter((c) => c.university_id === universityId) : courses;
    return [...list].sort(
      (a, b) =>
        getYearSortPriority(a.year, options) - getYearSortPriority(b.year, options) ||
        a.title.localeCompare(b.title),
    );
  }, [courses, universityId, options]);


  async function loadGroups(nextCourseId: string) {
    setGroupId(""); setSubjectId(""); setSubjects([]);
    const { data, error: err } = await (supabase.from as any)("subject_groups")
      .select("id,course_id,name,sort_order")
      .eq("course_id", nextCourseId)
      .order("sort_order");
    if (err) { setError(err.message); return; }
    const loaded = (data ?? []) as SubjectGroup[];
    setGroups(loaded);
    if (loaded[0]) setGroupId(loaded[0].id);
  }

  async function loadSubjects(nextGroupId: string) {
    setSubjectId("");
    if (!nextGroupId) { setSubjects([]); return; }
    const { data, error: err } = await (supabase.from as any)("subjects")
      .select("id,group_id,name,sort_order")
      .eq("group_id", nextGroupId)
      .order("sort_order");
    if (err) { setError(err.message); return; }
    const loaded = (data ?? []) as Subject[];
    setSubjects(loaded);
    if (loaded[0]) setSubjectId(loaded[0].id);
  }

  useEffect(() => { if (courseId) loadGroups(courseId); }, [courseId]);
  useEffect(() => { loadSubjects(groupId); }, [groupId]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId),
    [courses, courseId],
  );

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !newGroup.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const { data, error: err } = await (supabase.from as any)("subject_groups")
        .insert({ course_id: courseId, name: newGroup.trim().toUpperCase(), sort_order: groups.length + 1 })
        .select("id")
        .single();
      if (err) throw err;
      setNewGroup("");
      await loadGroups(courseId);
      setGroupId(data.id as string);
      setMessage("Section created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create section.");
    } finally { setSaving(false); }
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !newSubject.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const { data, error: err } = await (supabase.from as any)("subjects")
        .insert({ group_id: groupId, name: newSubject.trim(), sort_order: subjects.length + 1 })
        .select("id")
        .single();
      if (err) throw err;
      setNewSubject("");
      await loadSubjects(groupId);
      setSubjectId(data.id as string);
      setMessage("Subject created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create subject.");
    } finally { setSaving(false); }
  }

  async function renameGroup() {
    if (!groupId) return;
    const current = groups.find((g) => g.id === groupId)?.name ?? "";
    const next = window.prompt("Rename section", current);
    if (!next || next.trim() === current) return;
    setError(null); setMessage(null);
    const { error: err } = await (supabase.from as any)("subject_groups")
      .update({ name: next.trim().toUpperCase() }).eq("id", groupId);
    if (err) { setError(err.message); return; }
    await loadGroups(courseId);
    setGroupId(groupId);
    setMessage("Section renamed.");
  }

  async function deleteGroup() {
    if (!groupId) return;
    const current = groups.find((g) => g.id === groupId)?.name ?? "";
    if (!window.confirm(`Delete section "${current}" and ALL its subjects + questions?`)) return;
    setError(null); setMessage(null);
    // best-effort cascade: remove subjects first in case FK isn't cascading
    const { data: subs } = await (supabase.from as any)("subjects").select("id").eq("group_id", groupId);
    const subIds = (subs ?? []).map((s: any) => s.id);
    if (subIds.length) {
      await (supabase.from as any)("questions").delete().in("subject_id", subIds);
      await (supabase.from as any)("subjects").delete().eq("group_id", groupId);
    }
    const { error: err } = await (supabase.from as any)("subject_groups").delete().eq("id", groupId);
    if (err) { setError(err.message); return; }
    setGroupId(""); setSubjectId(""); setSubjects([]);
    await loadGroups(courseId);
    setMessage("Section deleted.");
  }

  async function renameSubject() {
    if (!subjectId) return;
    const current = subjects.find((s) => s.id === subjectId)?.name ?? "";
    const next = window.prompt("Rename subject", current);
    if (!next || next.trim() === current) return;
    setError(null); setMessage(null);
    const { error: err } = await (supabase.from as any)("subjects")
      .update({ name: next.trim() }).eq("id", subjectId);
    if (err) { setError(err.message); return; }
    await loadSubjects(groupId);
    setSubjectId(subjectId);
    setMessage("Subject renamed.");
  }

  async function moveSubject() {
    if (!subjectId) return;
    const current = subjects.find((s) => s.id === subjectId)?.name ?? "";
    const others = groups.filter((g) => g.id !== groupId);
    if (others.length === 0) {
      setError("Create another section in this course first.");
      return;
    }
    const lines = others.map((g, i) => `${i + 1}. ${g.name}`).join("\n");
    const pick = window.prompt(
      `Move "${current}" to which section?\n\n${lines}\n\nType the number (1-${others.length}):`,
      "1",
    );
    if (!pick) return;
    const idx = parseInt(pick.trim(), 10) - 1;
    const target = others[idx];
    if (!target) { setError("Invalid section number."); return; }
    if (!window.confirm(`Move "${current}" → "${target.name}"?\nAll its questions will move with it.`)) return;
    setError(null); setMessage(null);
    const { error: err } = await (supabase.from as any)("subjects")
      .update({ group_id: target.id }).eq("id", subjectId);
    if (err) { setError(err.message); return; }
    // Refresh source list & jump to target section so the user sees the move.
    setSubjectId("");
    setGroupId(target.id);
    await loadSubjects(target.id);
    setMessage(`Subject moved to "${target.name}".`);
  }

  async function deleteSubject() {
    if (!subjectId) return;
    const current = subjects.find((s) => s.id === subjectId)?.name ?? "";
    if (!window.confirm(`Delete subject "${current}" and ALL its questions?`)) return;
    setError(null); setMessage(null);
    await (supabase.from as any)("questions").delete().eq("subject_id", subjectId);
    const { error: err } = await (supabase.from as any)("subjects").delete().eq("id", subjectId);
    if (err) { setError(err.message); return; }
    setSubjectId("");
    await loadSubjects(groupId);
    setMessage("Subject deleted.");
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);
    const clean = choices.filter((c) => c.text.trim());
    if (!subjectId || (!stem.trim() && !imagePath) || clean.length < 2) {
      setError("Choose a subject, write the question (or add a picture), and fill at least two answers.");
      return;
    }
    const uniq = new Set(clean.map((c) => c.text.trim().toLowerCase()));
    if (uniq.size !== clean.length) { setError("The answers must be different."); return; }
    const correctCount = clean.filter((c) => c.is_correct).length;
    if (correctCount < 1) { setError("Mark at least one answer as right."); return; }
    if (multi && correctCount < 2) { setError("Mark at least two right answers, or turn off “More than one answer”."); return; }
    setSaving(true);
    try {
      const { count } = await (supabase.from as any)("questions")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", subjectId);
      const { data: question, error: qErr } = await (supabase.from as any)("questions")
        .insert({
          subject_id: subjectId,
          stem: stem.trim(),
          explanation: explanation.trim() || null,
          sort_order: (count ?? 0) + 1,
          answer_mode: multi ? "multiple" : "single",
          image_url: imagePath,
        })
        .select("id").single();
      if (qErr) throw qErr;
      const optionRows = clean.map((c, i) => ({
        question_id: question.id,
        label: LETTERS[i] ?? String(i + 1),
        text: c.text.trim(),
        is_correct: !!c.is_correct,
        sort_order: i + 1,
      }));
      const { error: oErr } = await (supabase.from as any)("question_options").insert(optionRows);
      if (oErr) throw oErr;
      setStem(""); setExplanation("");
      setChoices(emptyChoices());
      setMulti(false);
      setImagePath(null);
      setMessage("Question and choices saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save question.");
    } finally { setSaving(false); }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-bold tracking-[0.28em] text-amber-400 uppercase">Q add choice</p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold">Add quizzes</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/mcq-generator-pro"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> MCQ Generator Pro
            </Link>
            <Link
              to="/admin/ai-keys"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-xs font-bold text-white/70 hover:bg-white/5"
            >
              <KeyRound className="w-3.5 h-3.5" /> AI keys
            </Link>
            <PdfImportButton subjectId={subjectId} onCreated={() => setMessage("Questions imported from PDF.")} />
            <BatchPdfImportButton onCreated={() => setMessage("Batch import finished.")} />
            <GermanImportButton subjectId={subjectId} onCreated={() => setMessage("German pairs imported.")} />
            <JarvisButton subjectId={subjectId} onCreated={() => setMessage("Question added by Jarvis.")} />
          </div>
        </div>

        {error && <Notice tone="error" text={error} onClose={() => setError(null)} />}
        {message && <Notice tone="success" text={message} onClose={() => setMessage(null)} />}

        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ListPlus className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-lg">Choose course, section & subject</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">University</span>
              <select
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                className="w-full rounded-lg border border-amber-400/40 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
              >
                {universities.length === 0 && <option value="">No universities</option>}
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">Course</span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
              >
                {filteredCourses.length === 0 && <option value="">No courses in this university</option>}
                {filteredCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {yearLabel(c.year, options)} · {c.title} (Q-bank)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/50">
                <span>Section (group)</span>
                {groupId && (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={renameGroup} title="Rename section" className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-amber-300">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={deleteGroup} title="Delete section" className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
              >
                {groups.length === 0 && <option value="">Create a section first</option>}
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/50">
                <span>Subject</span>
                {subjectId && (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={renameSubject} title="Rename subject" className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-amber-300">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={moveSubject} title="Move to another section" className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-sky-300">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={deleteSubject} title="Delete subject" className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
              >
                {subjects.length === 0 && <option value="">Create a subject first</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>

          <form onSubmit={addGroup} className="mt-5 flex flex-col sm:flex-row gap-3">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder={`New section${selectedCourse ? ` for ${selectedCourse.title}` : ""} (e.g. CARDIOPULMONARY)`}
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={saving || !courseId || !newGroup.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400 text-amber-300 px-5 py-3 text-sm font-bold hover:bg-amber-400/10 disabled:opacity-40"
            >
              <FolderPlus className="w-4 h-4" /> Create section
            </button>
          </form>

          <form onSubmit={addSubject} className="mt-3 flex flex-col sm:flex-row gap-3">
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="New subject (e.g. Myocardial Infarction)"
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={saving || !groupId || !newSubject.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-black hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-white/40"
            >
              <Plus className="w-4 h-4" /> Create subject
            </button>
          </form>
        </section>

        <form onSubmit={addQuestion} className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Save className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-lg">Question and choices</h2>
          </div>
          <label className="block space-y-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Question</span>
            <textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              placeholder="Write the quiz question here"
              className="min-h-32 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-amber-400"
            />
          </label>

          <div className="mb-4">
            <QuestionImagePicker path={imagePath} onChange={setImagePath} />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">
              {multi ? "Answers · tick every right one" : "Answers · pick the right one"}
            </span>
            <label className="inline-flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => {
                  const on = e.target.checked;
                  setMulti(on);
                  if (!on) {
                    setChoices((curr) => {
                      const first = curr.findIndex((c) => c.is_correct);
                      return curr.map((c, j) => ({ ...c, is_correct: j === (first === -1 ? 0 : first) }));
                    });
                  }
                }}
                className="accent-emerald-400"
              />
              More than one answer
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {choices.map((c, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/50">
                    Answer {LETTERS[i] ?? i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-white/60">
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={multi ? undefined : "correct-answer"}
                        checked={c.is_correct}
                        onChange={() =>
                          setChoices((curr) =>
                            multi
                              ? curr.map((x, j) => (j === i ? { ...x, is_correct: !x.is_correct } : x))
                              : curr.map((x, j) => ({ ...x, is_correct: j === i })),
                          )
                        }
                        className="accent-emerald-400"
                      />
                      Right
                    </label>
                    <button
                      type="button"
                      onClick={() => setChoices((curr) => curr.filter((_, j) => j !== i))}
                      disabled={choices.length <= 2}
                      title="Remove this answer"
                      className="p-1 rounded-md text-white/40 hover:text-rose-400 hover:bg-white/10 disabled:opacity-25"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  value={c.text}
                  onChange={(e) =>
                    setChoices((curr) => curr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  placeholder={`Choice ${LETTERS[i] ?? i + 1}`}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-amber-400"
                />
              </div>
            ))}
          </div>

          {choices.length < LETTERS.length && (
            <button
              type="button"
              onClick={() => setChoices((curr) => [...curr, { text: "", is_correct: false }])}
              className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/5"
            >
              <Plus className="w-3.5 h-3.5" /> Add choice
            </button>
          )}


          <label className="block space-y-2 mb-5">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Explanation</span>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Optional explanation shown after answering"
              className="min-h-24 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-amber-400"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !subjectId}
            className="w-full rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-black hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-white/40"
          >
            Save question
          </button>
        </form>
        {subjectId && <QuestionListEditor subjectId={subjectId} />}
      </main>
    </div>
  );

}

function Notice({ tone, text, onClose }: { tone: "success" | "error"; text: string; onClose: () => void }) {
  const isSuccess = tone === "success";
  return (
    <div
      className={`mb-6 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
        isSuccess
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {isSuccess && <CheckCircle2 className="w-4 h-4" />}
        {text}
      </span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100" type="button">
        <X size={16} />
      </button>
    </div>
  );
}

type Provider = "lovable" | "gemini" | "openai" | "anthropic";

function JarvisButton({ subjectId, onCreated }: { subjectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const disabled = !subjectId;
  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabled ? "Pick course, section & subject first" : "Generate question from image"}
        className="relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.02] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        <Sparkles className="w-4 h-4" /> Jarvis
      </button>
      {open && <JarvisModal subjectId={subjectId} onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

type FrameRecord = {
  dataUrl: string;
  timeSec: number;
  status: "added" | "failed" | "duplicate";
  stemPreview?: string;
  error?: string;
};

type QueueItem = {
  id: string;
  file: File;
  preview: string;
  kind: "image" | "video";
  videoMode?: "whole" | "frames"; // only for videos
  status: "pending" | "processing" | "added" | "failed";
  error?: string;
  durationMs?: number;
  addedCount?: number; // number of questions inserted (videos can add many)
  progressText?: string; // live status (e.g. "Frames 12/47")
  frames?: FrameRecord[]; // captured per-frame results (frame-by-frame video mode)
  showFrames?: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function fmtEta(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function JarvisModal({
  subjectId,
  onClose,
  onCreated,
}: {
  subjectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const gen = useServerFn(generateQuestionFromImage);
  const [provider, setProvider] = useState<Provider>("lovable");
  const [hint, setHint] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<number | null>(null);
  const createdRef = useRef(false);

  const genVideo = useServerFn(generateQuestionsFromVideo);
  const extractQ = useServerFn(extractQuestionFromImage);
  const insertQ = useServerFn(insertExtractedQuestion);
  const abortRef = useRef<AbortController | null>(null);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!arr.length) return;
    setQueue((q) => [
      ...q,
      ...arr.map((f): QueueItem => {
        const isVideo = f.type.startsWith("video/");
        return {
          id: crypto.randomUUID(),
          file: f,
          preview: URL.createObjectURL(f),
          kind: isVideo ? "video" : "image",
          videoMode: isVideo ? "whole" : undefined,
          status: "pending" as const,
        };
      }),
    ]);
    setDone(false);
  }

  function removeItem(id: string) {
    setQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return q.filter((i) => i.id !== id);
    });
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (items.length) addFiles(items);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    return () => {
      queue.forEach((i) => URL.revokeObjectURL(i.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setItem(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function processImage(item: QueueItem) {
    const b64 = await fileToBase64(item.file);
    await gen({
      data: {
        subjectId,
        provider,
        imageBase64: b64,
        mimeType: item.file.type || "image/jpeg",
        hint: hint.trim() || undefined,
      },
    });
    return 1;
  }

  async function processVideoWhole(item: QueueItem) {
    if (item.file.size > 20 * 1024 * 1024) {
      throw new Error("Video > 20 MB. Trim it or switch this card to Frame-by-frame.");
    }
    setItem(item.id, { progressText: "Uploading to Gemini…" });
    const b64 = await fileToBase64(item.file);
    const res = await genVideo({
      data: {
        subjectId,
        videoBase64: b64,
        mimeType: item.file.type || "video/mp4",
        hint: hint.trim() || undefined,
      },
    });
    return res.added;
  }

  async function processVideoFrames(item: QueueItem) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setItem(item.id, { progressText: "Extracting frames…", frames: [], showFrames: true });
    const frames = await extractFrames(item.file, {
      fps: 1,
      signal: ctrl.signal,
      onProgress: (d, t) => setItem(item.id, { progressText: `Frames ${d}/${t}` }),
    });
    if (!frames.length) throw new Error("No usable frames found in this video.");

    const records: FrameRecord[] = [];
    const acceptedStems: string[] = [];
    let ok = 0;
    let dup = 0;
    let fail = 0;

    for (let i = 0; i < frames.length; i++) {
      if (ctrl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      setItem(item.id, {
        progressText: `Frame ${i + 1}/${frames.length} · ${ok} added · ${dup} duplicates · ${fail} failed`,
      });
      const dataUrl = `data:${frames[i].mimeType};base64,${frames[i].base64}`;
      try {
        const parsed = await extractQ({
          data: {
            subjectId,
            provider,
            imageBase64: frames[i].base64,
            mimeType: frames[i].mimeType,
            hint: hint.trim() || undefined,
          },
        });
        const stem = parsed.prompt;
        if (isDuplicateStem(stem, acceptedStems)) {
          dup++;
          records.push({
            dataUrl,
            timeSec: frames[i].timeSec,
            status: "duplicate",
            stemPreview: stem.slice(0, 60),
          });
        } else {
          await insertQ({
            data: {
              subjectId,
              prompt: parsed.prompt,
              options: parsed.options,
              explanation: parsed.explanation,
            },
          });
          acceptedStems.push(stem);
          ok++;
          records.push({
            dataUrl,
            timeSec: frames[i].timeSec,
            status: "added",
            stemPreview: stem.slice(0, 60),
          });
        }
      } catch (e: any) {
        fail++;
        records.push({
          dataUrl,
          timeSec: frames[i].timeSec,
          status: "failed",
          error: e?.message || "Failed",
        });
      }
      setItem(item.id, { frames: [...records] });
    }
    if (ok === 0 && dup === 0) throw new Error(`All ${frames.length} frames failed.`);
    return ok;
  }

  async function processOne(item: QueueItem) {
    setItem(item.id, { status: "processing", error: undefined, progressText: undefined });
    const t0 = performance.now();
    try {
      let added = 1;
      if (item.kind === "image") {
        added = await processImage(item);
      } else if (item.videoMode === "frames") {
        added = await processVideoFrames(item);
      } else {
        added = await processVideoWhole(item);
      }
      const dur = performance.now() - t0;
      setItem(item.id, { status: "added", durationMs: dur, addedCount: added, progressText: undefined });
    } catch (e: any) {
      const dur = performance.now() - t0;
      setItem(item.id, {
        status: "failed",
        error: e?.message || "Failed",
        durationMs: dur,
        progressText: undefined,
      });
    }
  }

  async function runAll() {
    const pending = queue.filter((i) => i.status === "pending" || i.status === "failed");
    if (!pending.length) return;
    // Reset failed back to pending so they retry
    setQueue((q) =>
      q.map((i) => (i.status === "failed" ? { ...i, status: "pending", error: undefined } : i)),
    );
    setRunning(true);
    setDone(false);
    startRef.current = performance.now();
    // Sequentially process
    for (const item of pending) {
      // Re-fetch latest object to allow user-removed items to skip
      // but we already captured the queue snapshot at start of run.
      await processOne(item);
    }
    setRunning(false);
    setDone(true);
    if (!createdRef.current) {
      onCreated();
      createdRef.current = true;
    } else {
      onCreated();
    }
  }

  const counts = useMemo(() => {
    const c = { total: queue.length, pending: 0, processing: 0, added: 0, failed: 0 };
    for (const i of queue) c[i.status]++;
    return c;
  }, [queue]);

  const completed = queue.filter((i) => i.durationMs != null && i.status !== "pending");
  const avgMs =
    completed.length > 0
      ? completed.reduce((s, i) => s + (i.durationMs || 0), 0) / completed.length
      : 12000;
  const remaining = counts.pending + counts.processing;
  const etaSec = running ? (remaining * avgMs) / 1000 : 0;
  // touch tick so eta refreshes
  void tick;

  const providers: { id: Provider; label: string; sub: string }[] = [
    { id: "lovable", label: "Lovable AI", sub: "Test mode" },
    { id: "gemini", label: "Gemini", sub: "Free" },
    { id: "openai", label: "GPT-4o mini", sub: "Cheap" },
    { id: "anthropic", label: "Claude 4.5", sub: "Premium" },
  ];

  const canClose = !running;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => canClose && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6 md:p-8 shadow-2xl shadow-violet-500/10"
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.32em] text-violet-300 uppercase">Jarvis</p>
              <h2 className="font-bold text-xl text-white">Batch generate questions</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white disabled:opacity-30"
            disabled={!canClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <Stat label="Total" value={counts.total} tone="neutral" />
          <Stat label="Pending" value={counts.pending + counts.processing} tone="info" />
          <Stat label="Added" value={counts.added} tone="success" />
          <Stat label="Failed" value={counts.failed} tone="danger" />
        </div>

        {/* Provider */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Provider</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                disabled={running}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  provider === p.id
                    ? "border-violet-400/60 bg-violet-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                } disabled:opacity-50`}
              >
                <div className="text-sm font-bold text-white">{p.label}</div>
                <div className="text-[10px] text-white/50 uppercase tracking-wider mt-0.5">{p.sub}</div>
              </button>
            ))}
          </div>
          {provider !== "lovable" && (
            <Link to="/admin/ai-keys" className="mt-2 inline-block text-[11px] font-bold text-violet-300 hover:underline">
              Need a key? Add it in AI keys →
            </Link>
          )}
        </div>

        {/* Dropzone */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
            Question screenshots or videos — add as many as you want
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <div
            onClick={() => !running && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!running) addFiles(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed border-white/15 bg-black/30 p-5 text-center transition ${
              running ? "opacity-60" : "cursor-pointer hover:border-violet-400/60"
            }`}
          >
            {queue.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-white/50 py-4">
                <div className="flex gap-2">
                  <ImageIcon className="w-8 h-8" />
                  <Film className="w-8 h-8" />
                </div>
                <div className="text-sm">
                  <span className="font-bold text-white">Click to upload</span>, drag & drop, or paste — images or videos
                </div>
                <div className="text-[11px] text-white/40">Videos: pick "Whole" (Gemini, ≤20 MB) or "Frames" (any provider)</div>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {queue.map((it, idx) => (
                  <div key={it.id} className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/40">
                    {it.kind === "video" ? (
                      <div className="relative w-full h-24 bg-black grid place-items-center">
                        <video
                          src={it.preview}
                          className="absolute inset-0 w-full h-full object-cover opacity-70"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <Film className="relative w-7 h-7 text-white drop-shadow-lg" />
                      </div>
                    ) : (
                      <img src={it.preview} alt="" className="w-full h-24 object-cover" />
                    )}
                    <div className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                      #{idx + 1}
                    </div>
                    <div className="absolute bottom-1 right-1">
                      <StatusBadge status={it.status} count={it.addedCount} />
                    </div>
                    {!running && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(it.id);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-red-500"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {it.kind === "video" && it.status === "pending" && !running && (
                      <div
                        className="absolute inset-x-0 bottom-0 flex text-[9px] font-bold"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setItem(it.id, { videoMode: "whole" })}
                          className={`flex-1 py-1 ${it.videoMode === "whole" ? "bg-violet-500 text-white" : "bg-black/70 text-white/60 hover:text-white"}`}
                          title="Send the whole video to Gemini in one call"
                        >
                          Whole
                        </button>
                        <button
                          onClick={() => setItem(it.id, { videoMode: "frames" })}
                          className={`flex-1 py-1 ${it.videoMode === "frames" ? "bg-violet-500 text-white" : "bg-black/70 text-white/60 hover:text-white"}`}
                          title="Sample frames and process each with the selected provider"
                        >
                          Frames
                        </button>
                      </div>
                    )}
                    {it.progressText && (
                      <div className="absolute inset-x-0 bottom-0 bg-violet-700/90 text-white text-[9px] px-1 py-0.5 truncate">
                        {it.progressText}
                      </div>
                    )}
                    {it.status === "failed" && it.error && (
                      <div className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[9px] px-1 py-0.5 truncate" title={it.error}>
                        {it.error}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  disabled={running}
                  className="h-24 rounded-lg border border-dashed border-white/15 text-white/50 hover:text-white hover:border-violet-400/60 grid place-items-center disabled:opacity-40"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Frames galleries (per video with frames extracted) */}
        {queue
          .filter((it) => it.kind === "video" && it.videoMode === "frames" && it.frames && it.frames.length > 0)
          .map((it) => (
            <FramesGallery
              key={`fg-${it.id}`}
              fileName={it.file.name}
              frames={it.frames!}
              open={!!it.showFrames}
              onToggle={() => setItem(it.id, { showFrames: !it.showFrames })}
            />
          ))}




        {/* Hint */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Hint (optional)</p>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            disabled={running}
            placeholder="e.g. Translate explanation to English"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-violet-400 disabled:opacity-50"
          />
        </div>

        {/* Progress / ETA */}
        {(running || done) && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-white/70 mb-2">
              <span className="font-bold">
                {running
                  ? `Processing ${counts.added + counts.failed + 1} of ${counts.total}`
                  : `Done — ${counts.added}/${counts.total} added`}
              </span>
              {running && (
                <span className="font-mono text-violet-300">~ {fmtEta(etaSec)} left</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all"
                style={{
                  width: `${counts.total === 0 ? 0 : ((counts.added + counts.failed) / counts.total) * 100}%`,
                }}
              />
            </div>
            {done && (
              <div className="mt-3 text-xs text-white/60">
                {counts.added} added · {counts.failed} failed · avg {(avgMs / 1000).toFixed(1)}s per shot
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={runAll}
            disabled={running || queue.length === 0 || counts.pending + counts.failed === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 disabled:opacity-40"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {running
              ? "Processing…"
              : counts.failed > 0 && counts.pending === 0
                ? `Retry ${counts.failed} failed`
                : `Generate & save ${counts.pending} ${counts.pending === 1 ? "question" : "questions"}`}
          </button>
          {running && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
            >
              Cancel
            </button>
          )}
          {done && !running && (
            <button
              onClick={onClose}
              className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
            >
              Close
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "success" | "danger";
}) {
  const tones = {
    neutral: "bg-white/5 text-white border-white/10",
    info: "bg-indigo-500/15 text-indigo-200 border-indigo-400/30",
    success: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
    danger: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status, count }: { status: QueueItem["status"]; count?: number }) {
  if (status === "added")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white">
        <CheckCircle2 className="w-3 h-3" /> {count && count > 1 ? `+${count}` : "Added"}
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">
        <X className="w-3 h-3" /> Failed
      </span>
    );
  if (status === "processing")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500 text-white">
        <Loader2 className="w-3 h-3 animate-spin" /> …
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/20 text-white">
      Pending
    </span>
  );
}


// ─── Frame dedupe helpers ─────────────────────────────────────
function normalizeStem(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((w) => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

function isDuplicateStem(stem: string, accepted: string[]): boolean {
  const n = normalizeStem(stem);
  if (!n) return false;
  for (const prev of accepted) {
    const p = normalizeStem(prev);
    if (n === p) return true;
    const lenDiff = Math.abs(n.length - p.length) / Math.max(n.length, p.length);
    if (lenDiff < 0.15 && jaccard(n, p) >= 0.9) return true;
  }
  return false;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Frames Gallery ───────────────────────────────────────────
function FramesGallery({
  fileName,
  frames,
  open,
  onToggle,
}: {
  fileName: string;
  frames: FrameRecord[];
  open: boolean;
  onToggle: () => void;
}) {
  const [lightbox, setLightbox] = useState<FrameRecord | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const added = frames.filter((f) => f.status === "added").length;
  const dup = frames.filter((f) => f.status === "duplicate").length;
  const fail = frames.filter((f) => f.status === "failed").length;

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Frames extracted from
          </div>
          <div className="text-sm font-bold text-white truncate">{fileName}</div>
          <div className="mt-1 flex gap-3 text-[11px] text-white/60">
            <span className="text-emerald-300">{added} added</span>
            <span className="text-amber-300">{dup} duplicates</span>
            <span className="text-rose-300">{fail} failed</span>
            <span>· {frames.length} total</span>
          </div>
        </div>
        <span className="text-[11px] font-bold text-violet-300">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
          {frames.map((f, idx) => {
            const ring =
              f.status === "added"
                ? "ring-emerald-400/60"
                : f.status === "duplicate"
                  ? "ring-amber-400/60"
                  : "ring-rose-500/60";
            return (
              <button
                key={idx}
                onClick={() => setLightbox(f)}
                className={`relative group rounded-lg overflow-hidden ring-2 ${ring} bg-black/40`}
                title={f.stemPreview || f.error || ""}
              >
                <img src={f.dataUrl} alt="" className="w-full aspect-square object-cover" />
                <div className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                  {fmtTime(f.timeSec)}
                </div>
                <div className="absolute bottom-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                  style={{
                    background:
                      f.status === "added"
                        ? "rgb(16 185 129)"
                        : f.status === "duplicate"
                          ? "rgb(245 158 11)"
                          : "rgb(225 29 72)",
                  }}
                >
                  {f.status === "added" ? "✓" : f.status === "duplicate" ? "⊘" : "✗"}
                </div>
                {f.stemPreview && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">
                    {f.stemPreview}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 grid place-items-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt="" className="w-full max-h-[80vh] object-contain rounded-xl" />
            <div className="mt-3 text-center text-white/80 text-sm">
              <span className="font-mono">{fmtTime(lightbox.timeSec)}</span>
              {lightbox.stemPreview && <span className="ml-3">{lightbox.stemPreview}</span>}
              {lightbox.error && <span className="ml-3 text-rose-300">{lightbox.error}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
