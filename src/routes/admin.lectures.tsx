import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  PlayCircle,
  ListChecks,
  Upload,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  X,
  Video,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { QuizQuestionModal, type EditingQuestion } from "@/components/lectures/QuizQuestionModal";
import { GrantAccessCard } from "@/components/lectures/GrantAccessCard";

export const Route = createFileRoute("/admin/lectures")({
  validateSearch: (s: Record<string, unknown>) => ({
    courseId: typeof s.courseId === "string" ? s.courseId : "",
  }),
  head: () => ({ meta: [{ title: "Lectures admin — AquaQBank" }] }),
  component: AdminLecturesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  published: boolean;
  intro_video_url: string | null;
  intro_video_storage_path: string | null;
  intro_free: boolean;
};
type Subject = { id: string; course_id: string; title: string; position: number };
type Item = {
  id: string;
  subject_id: string;
  kind: "lecture" | "quiz";
  title: string;
  position: number;
  video_url: string | null;
  video_storage_path: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  is_free: boolean;
};
type Quiz = { id: string; item_id: string };
type Question = {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  explanation: string | null;
  published: boolean;
};
type QOption = { id: string; question_id: string; position: number; body: string; is_correct: boolean };

function AdminLecturesPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { courseId: initialCourseId } = Route.useSearch();

  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string>(initialCourseId);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<QOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ quizId: string; initial: EditingQuestion | null; position: number } | null>(
    null,
  );

  const activeCourse = courses.find((c) => c.id === activeCourseId) ?? null;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  async function loadCourses() {
    const { data } = await supabase
      .from("courses")
      .select("id,title,year,published,intro_video_url,intro_video_storage_path,intro_free")
      .eq("kind", "lectures")
      .order("year")
      .order("title");
    const list = (data as Course[]) ?? [];
    setCourses(list);
    if (!activeCourseId && list.length) setActiveCourseId(list[0].id);
  }

  useEffect(() => {
    if (isAdmin) loadCourses();
  }, [isAdmin]);

  async function refreshSyllabus(cid: string) {
    const { data: subs } = await (supabase.from as any)("lecture_subjects")
      .select("id,course_id,title,position")
      .eq("course_id", cid)
      .order("position");
    const subjList = (subs ?? []) as Subject[];
    setSubjects(subjList);

    if (!subjList.length) {
      setItems([]);
      setQuizzes([]);
      setQuestions([]);
      setOptions([]);
      return;
    }
    const { data: its } = await (supabase.from as any)("lecture_items")
      .select("id,subject_id,kind,title,position,video_url,video_storage_path,pdf_url,pdf_storage_path,is_free")
      .in("subject_id", subjList.map((s) => s.id))
      .order("position");
    const itList = (its ?? []) as Item[];
    setItems(itList);

    const quizItemIds = itList.filter((i) => i.kind === "quiz").map((i) => i.id);
    if (!quizItemIds.length) {
      setQuizzes([]);
      setQuestions([]);
      setOptions([]);
      return;
    }
    const { data: qz } = await (supabase.from as any)("lecture_quizzes")
      .select("id,item_id")
      .in("item_id", quizItemIds);
    let qzList = (qz ?? []) as Quiz[];

    // Self-heal: any quiz item missing its lecture_quizzes row gets one inserted
    const missing = quizItemIds.filter((id) => !qzList.some((q) => q.item_id === id));
    if (missing.length) {
      await (supabase.from as any)("lecture_quizzes").insert(missing.map((id) => ({ item_id: id })));
      const { data: qz2 } = await (supabase.from as any)("lecture_quizzes")
        .select("id,item_id")
        .in("item_id", quizItemIds);
      qzList = (qz2 ?? []) as Quiz[];
    }
    setQuizzes(qzList);

    if (!qzList.length) {
      setQuestions([]);
      setOptions([]);
      return;
    }
    const { data: qs } = await (supabase.from as any)("lecture_quiz_questions")
      .select("id,quiz_id,position,prompt,explanation,published")
      .in("quiz_id", qzList.map((q) => q.id))
      .order("position");
    const qsList = (qs ?? []) as Question[];
    setQuestions(qsList);

    if (!qsList.length) {
      setOptions([]);
      return;
    }
    const { data: ops } = await (supabase.from as any)("lecture_quiz_options")
      .select("id,question_id,position,body,is_correct")
      .in("question_id", qsList.map((q) => q.id))
      .order("position");
    setOptions((ops ?? []) as QOption[]);
  }

  useEffect(() => {
    if (activeCourseId) refreshSyllabus(activeCourseId);
  }, [activeCourseId]);

  const itemsBySubject = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((i) => {
      if (!m.has(i.subject_id)) m.set(i.subject_id, []);
      m.get(i.subject_id)!.push(i);
    });
    return m;
  }, [items]);

  const questionsByQuiz = useMemo(() => {
    const m = new Map<string, Question[]>();
    questions.forEach((q) => {
      if (!m.has(q.quiz_id)) m.set(q.quiz_id, []);
      m.get(q.quiz_id)!.push(q);
    });
    return m;
  }, [questions]);

  const optionsByQuestion = useMemo(() => {
    const m = new Map<string, QOption[]>();
    options.forEach((o) => {
      if (!m.has(o.question_id)) m.set(o.question_id, []);
      m.get(o.question_id)!.push(o);
    });
    return m;
  }, [options]);

  // --- Subject ops ---
  async function addSubject(title: string) {
    if (!title.trim() || !activeCourseId) return;
    setBusy(true);
    const position = subjects.length;
    const { error } = await (supabase.from as any)("lecture_subjects")
      .insert({ course_id: activeCourseId, title: title.trim(), position });
    setBusy(false);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }
  async function renameSubject(id: string, title: string) {
    const { error } = await (supabase.from as any)("lecture_subjects").update({ title }).eq("id", id);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }
  async function deleteSubject(id: string) {
    if (!confirm("Delete this subject and all its lectures and quizzes?")) return;
    const { error } = await (supabase.from as any)("lecture_subjects").delete().eq("id", id);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }
  async function reorderSubject(id: string, dir: -1 | 1) {
    const idx = subjects.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (target < 0 || target >= subjects.length) return;
    const a = subjects[idx];
    const b = subjects[target];
    await (supabase.from as any)("lecture_subjects").update({ position: b.position }).eq("id", a.id);
    await (supabase.from as any)("lecture_subjects").update({ position: a.position }).eq("id", b.id);
    refreshSyllabus(activeCourseId);
  }

  // --- Item ops ---
  async function uploadTo(bucket: string, subjectId: string, file: File): Promise<string | null> {
    const key = `${subjectId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(key, file, { upsert: false, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      return null;
    }
    return key;
  }

  async function addLecture(
    subjectId: string,
    title: string,
    videoUrl: string,
    file: File | null,
    pdfUrl: string,
    pdfFile: File | null,
  ) {
    if (!title.trim()) return;
    setBusy(true);
    const sublist = itemsBySubject.get(subjectId) ?? [];
    const position = sublist.length;
    let storagePath: string | null = null;
    if (file) {
      storagePath = await uploadTo("lecture-videos", subjectId, file);
      if (!storagePath) {
        setBusy(false);
        return;
      }
    }
    let pdfPath: string | null = null;
    if (pdfFile) {
      pdfPath = await uploadTo("lecture-pdfs", subjectId, pdfFile);
      if (!pdfPath) {
        setBusy(false);
        return;
      }
    }
    const { error } = await (supabase.from as any)("lecture_items").insert({
      subject_id: subjectId,
      kind: "lecture",
      title: title.trim(),
      position,
      video_url: videoUrl.trim() || null,
      video_storage_path: storagePath,
      pdf_url: pdfUrl.trim() || null,
      pdf_storage_path: pdfPath,
    });
    setBusy(false);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }

  async function setItemPdf(item: Item, pdfUrl: string, pdfFile: File | null) {
    setBusy(true);
    let pdfPath: string | null = item.pdf_storage_path;
    if (pdfFile) {
      const key = await uploadTo("lecture-pdfs", item.subject_id, pdfFile);
      if (!key) {
        setBusy(false);
        return;
      }
      pdfPath = key;
    }
    const { error } = await (supabase.from as any)("lecture_items")
      .update({ pdf_url: pdfUrl.trim() || null, pdf_storage_path: pdfPath })
      .eq("id", item.id);
    setBusy(false);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }

  async function removeItemPdf(item: Item) {
    if (!confirm("Remove the PDF from this lecture?")) return;
    setBusy(true);
    if (item.pdf_storage_path) {
      await supabase.storage.from("lecture-pdfs").remove([item.pdf_storage_path]);
    }
    const { error } = await (supabase.from as any)("lecture_items")
      .update({ pdf_url: null, pdf_storage_path: null })
      .eq("id", item.id);
    setBusy(false);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }

  async function addQuiz(subjectId: string, title: string) {
    if (!title.trim()) return;
    setBusy(true);
    const sublist = itemsBySubject.get(subjectId) ?? [];
    const position = sublist.length;
    const { data, error } = await (supabase.from as any)("lecture_items")
      .insert({ subject_id: subjectId, kind: "quiz", title: title.trim(), position })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      setBusy(false);
      setError(error?.message ?? "Failed to create quiz");
      return;
    }
    const { error: qErr } = await (supabase.from as any)("lecture_quizzes").insert({ item_id: data.id });
    setBusy(false);
    if (qErr) setError(qErr.message);
    refreshSyllabus(activeCourseId);
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    const { error } = await (supabase.from as any)("lecture_items").delete().eq("id", id);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }
  async function reorderItem(subjectId: string, id: string, dir: -1 | 1) {
    const list = (itemsBySubject.get(subjectId) ?? []).slice().sort((a, b) => a.position - b.position);
    const idx = list.findIndex((i) => i.id === id);
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const a = list[idx];
    const b = list[target];
    await (supabase.from as any)("lecture_items").update({ position: b.position }).eq("id", a.id);
    await (supabase.from as any)("lecture_items").update({ position: a.position }).eq("id", b.id);
    refreshSyllabus(activeCourseId);
  }
  async function renameItem(id: string, title: string) {
    const { error } = await (supabase.from as any)("lecture_items").update({ title }).eq("id", id);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }
  async function toggleItemFree(id: string, next: boolean) {
    const { error } = await (supabase.from as any)("lecture_items").update({ is_free: next }).eq("id", id);
    if (error) setError(error.message);
    else refreshSyllabus(activeCourseId);
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    await (supabase.from as any)("lecture_quiz_questions").delete().eq("id", id);
    refreshSyllabus(activeCourseId);
  }

  // --- Course intro video ---
  async function setIntro(url: string, file: File | null, intro_free: boolean) {
    if (!activeCourse) return;
    setBusy(true);
    let storagePath: string | null = activeCourse.intro_video_storage_path;
    if (file) {
      const key = `intro/${activeCourse.id}-${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("lecture-videos")
        .upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setBusy(false);
        setError(upErr.message);
        return;
      }
      storagePath = key;
    }
    const { error } = await (supabase.from("courses") as any)
      .update({
        intro_video_url: url.trim() || null,
        intro_video_storage_path: storagePath,
        intro_free,
      })
      .eq("id", activeCourse.id);
    setBusy(false);
    if (error) setError(error.message);
    else loadCourses();
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold mb-2">Lectures admin</h1>
            <p className="text-white/60 text-sm">
              Build the syllabus for each lecture course: subjects, lecture videos, and quizzes.
            </p>
          </div>
          <Link to="/admin/courses" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to courses
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-start justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300/70 hover:text-red-200">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Course picker */}
        <div className="mb-8">
          <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2 block">
            Lecture course
          </label>
          <select
            value={activeCourseId}
            onChange={(e) => setActiveCourseId(e.target.value)}
            className="w-full md:w-96 rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/50"
          >
            {courses.length === 0 && <option value="">No lecture courses yet</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                Y{c.year} · {c.title}
              </option>
            ))}
          </select>
        </div>

        {activeCourse && (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-8 min-w-0">
              <IntroEditor course={activeCourse} onSave={setIntro} busy={busy} />

              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-lg">Subjects ({subjects.length})</h2>
                  <SubjectAdder onAdd={addSubject} busy={busy} />
                </div>

                {subjects.length === 0 ? (
                  <div className="text-center py-10 text-white/40 text-sm">
                    No subjects yet. Create one like "Myocardial Infarction".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subjects.map((s, i) => (
                      <SubjectBlock
                        key={s.id}
                        subject={s}
                        index={i}
                        total={subjects.length}
                        items={itemsBySubject.get(s.id) ?? []}
                        quizzes={quizzes}
                        questionsByQuiz={questionsByQuiz}
                        optionsByQuestion={optionsByQuestion}
                        onRename={(t) => renameSubject(s.id, t)}
                        onDelete={() => deleteSubject(s.id)}
                        onReorder={(d) => reorderSubject(s.id, d)}
                        onAddLecture={(t, u, f, pu, pf) => addLecture(s.id, t, u, f, pu, pf)}
                        onAddQuiz={(t) => addQuiz(s.id, t)}
                        onDeleteItem={deleteItem}
                        onReorderItem={(id, d) => reorderItem(s.id, id, d)}
                        onRenameItem={renameItem}
                        onToggleFree={toggleItemFree}
                        onSetItemPdf={setItemPdf}
                        onRemoveItemPdf={removeItemPdf}
                        onEditQuestion={(quizId, q, position) => setModal({ quizId, initial: q, position })}
                        onDeleteQuestion={deleteQuestion}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <GrantAccessCard courseId={activeCourse.id} />
            </div>
          </div>
        )}
      </main>

      {modal && (
        <QuizQuestionModal
          quizId={modal.quizId}
          initial={modal.initial}
          position={modal.position}
          onClose={() => setModal(null)}
          onSaved={() => refreshSyllabus(activeCourseId)}
        />
      )}
    </div>
  );
}

function IntroEditor({
  course,
  onSave,
  busy,
}: {
  course: Course;
  onSave: (url: string, file: File | null, intro_free: boolean) => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState(course.intro_video_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [free, setFree] = useState(course.intro_free);

  useEffect(() => {
    setUrl(course.intro_video_url ?? "");
    setFree(course.intro_free);
    setFile(null);
  }, [course.id, course.intro_free, course.intro_video_url]);

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Video className="text-emerald-400" size={18} />
        <h2 className="font-semibold text-lg">Intro / preview video</h2>
        {(course.intro_video_url || course.intro_video_storage_path) && (
          <CheckCircle2 className="text-emerald-400" size={16} />
        )}
      </div>
      <p className="text-xs text-white/50 mb-4">
        Shown on the course hero. Click the hero plays this video in a modal.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a URL (YouTube, Vimeo, or .mp4)"
          className="rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
        />
        <label className="rounded-lg border border-dashed border-white/20 bg-black/30 px-4 py-3 text-sm cursor-pointer hover:border-white/40 flex items-center gap-2">
          <Upload size={14} />
          <span className="truncate">{file ? file.name : "Or upload an MP4 file…"}</span>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-xs text-white/70 cursor-pointer select-none">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="accent-emerald-500" />
        Free intro — allow anyone (including signed-out users) to play this video
      </label>
      <button
        onClick={() => onSave(url, file, free)}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-5 py-2.5"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={14} />} Save intro video
      </button>
    </section>
  );
}

function SubjectAdder({ onAdd, busy }: { onAdd: (title: string) => void; busy: boolean }) {
  const [title, setTitle] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New subject (e.g. Myocardial Infarction)"
        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm placeholder:text-white/30 outline-none focus:border-white/50 w-72"
      />
      <button
        onClick={() => {
          if (title.trim()) {
            onAdd(title);
            setTitle("");
          }
        }}
        disabled={busy || !title.trim()}
        className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-4 inline-flex items-center gap-1"
      >
        <Plus size={14} /> Add
      </button>
    </div>
  );
}

function SubjectBlock(props: {
  subject: Subject;
  index: number;
  total: number;
  items: Item[];
  quizzes: Quiz[];
  questionsByQuiz: Map<string, Question[]>;
  optionsByQuestion: Map<string, QOption[]>;
  onRename: (t: string) => void;
  onDelete: () => void;
  onReorder: (d: -1 | 1) => void;
  onAddLecture: (t: string, url: string, file: File | null, pdfUrl: string, pdfFile: File | null) => void;
  onAddQuiz: (t: string) => void;
  onDeleteItem: (id: string) => void;
  onReorderItem: (id: string, d: -1 | 1) => void;
  onRenameItem: (id: string, title: string) => void;
  onToggleFree: (id: string, next: boolean) => void;
  onSetItemPdf: (item: Item, pdfUrl: string, pdfFile: File | null) => void;
  onRemoveItemPdf: (item: Item) => void;
  onEditQuestion: (quizId: string, q: EditingQuestion | null, position: number) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const { subject, index, total, items, quizzes, questionsByQuiz, optionsByQuestion } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subject.title);
  const [open, setOpen] = useState(true);
  const [showLectureForm, setShowLectureForm] = useState(false);
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [newLecTitle, setNewLecTitle] = useState("");
  const [newLecUrl, setNewLecUrl] = useState("");
  const [newLecFile, setNewLecFile] = useState<File | null>(null);
  const [newLecPdfUrl, setNewLecPdfUrl] = useState("");
  const [newLecPdfFile, setNewLecPdfFile] = useState<File | null>(null);
  const [newQuizTitle, setNewQuizTitle] = useState("");

  const sortedItems = items.slice().sort((a, b) => a.position - b.position);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className="flex flex-col">
          <button onClick={() => props.onReorder(-1)} disabled={index === 0} className="text-white/40 hover:text-white disabled:opacity-20">
            <ChevronUp size={12} />
          </button>
          <button onClick={() => props.onReorder(1)} disabled={index === total - 1} className="text-white/40 hover:text-white disabled:opacity-20">
            <ChevronDown size={12} />
          </button>
        </div>
        <span className="grid place-items-center h-7 w-7 rounded-md bg-emerald-500/15 text-emerald-300 font-bold text-xs">
          {index + 1}
        </span>
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== subject.title) props.onRename(title.trim());
              setEditing(false);
            }}
            autoFocus
            className="flex-1 rounded border border-white/20 bg-black/50 px-2 py-1 text-sm"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="flex-1 text-left font-semibold text-white">
            {subject.title}
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-white/50 hover:text-white px-2">
          {open ? "Collapse" : "Expand"}
        </button>
        <button onClick={props.onDelete} className="text-red-400 hover:text-red-300 p-1">
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-3">
          {sortedItems.length === 0 ? (
            <div className="text-xs text-white/40 text-center py-3">No lectures or quizzes yet.</div>
          ) : (
            sortedItems.map((it, i) => (
              <ItemBlock
                key={it.id}
                item={it}
                index={i}
                total={sortedItems.length}
                quiz={quizzes.find((q) => q.item_id === it.id) ?? null}
                questions={questionsByQuiz}
                options={optionsByQuestion}
                onDelete={() => props.onDeleteItem(it.id)}
                onReorder={(d) => props.onReorderItem(it.id, d)}
                onRename={(t) => props.onRenameItem(it.id, t)}
                onToggleFree={(next) => props.onToggleFree(it.id, next)}
                onSetPdf={(url, file) => props.onSetItemPdf(it, url, file)}
                onRemovePdf={() => props.onRemoveItemPdf(it)}
                onEditQuestion={props.onEditQuestion}
                onDeleteQuestion={props.onDeleteQuestion}
              />
            ))
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => {
                setShowLectureForm((v) => !v);
                setShowQuizForm(false);
              }}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 inline-flex items-center gap-1"
            >
              <Plus size={12} /> Add lecture
            </button>
            <button
              onClick={() => {
                setShowQuizForm((v) => !v);
                setShowLectureForm(false);
              }}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 inline-flex items-center gap-1"
            >
              <Plus size={12} /> Add quiz
            </button>
          </div>

          {showLectureForm && (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-3 space-y-2">
              <input
                value={newLecTitle}
                onChange={(e) => setNewLecTitle(e.target.value)}
                placeholder="Lecture title (e.g. Pathophysiology of MI)"
                className="w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
              <input
                value={newLecUrl}
                onChange={(e) => setNewLecUrl(e.target.value)}
                placeholder="Video URL (YouTube / Vimeo / .mp4) — optional if uploading"
                className="w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
              <label className="block rounded border border-dashed border-white/20 px-3 py-2 text-xs text-white/60 cursor-pointer hover:border-white/40">
                <Upload size={12} className="inline mr-1" />
                {newLecFile ? newLecFile.name : "Or upload an MP4…"}
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setNewLecFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <div className="pt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                PDF (notes / slides) — optional
              </div>
              <input
                value={newLecPdfUrl}
                onChange={(e) => setNewLecPdfUrl(e.target.value)}
                placeholder="PDF link — optional if uploading"
                className="w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
              <label className="block rounded border border-dashed border-white/20 px-3 py-2 text-xs text-white/60 cursor-pointer hover:border-white/40">
                <Upload size={12} className="inline mr-1" />
                {newLecPdfFile ? newLecPdfFile.name : "Or upload a PDF…"}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setNewLecPdfFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => {
                  props.onAddLecture(newLecTitle, newLecUrl, newLecFile, newLecPdfUrl, newLecPdfFile);
                  setNewLecTitle("");
                  setNewLecUrl("");
                  setNewLecFile(null);
                  setNewLecPdfUrl("");
                  setNewLecPdfFile(null);
                  setShowLectureForm(false);
                }}
                disabled={
                  !newLecTitle.trim() ||
                  (!newLecUrl.trim() && !newLecFile && !newLecPdfUrl.trim() && !newLecPdfFile)
                }
                className="rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold px-3 py-2"
              >
                Save lecture
              </button>
            </div>
          )}

          {showQuizForm && (
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/5 p-3 space-y-2">
              <input
                value={newQuizTitle}
                onChange={(e) => setNewQuizTitle(e.target.value)}
                placeholder="Quiz title (e.g. MI quick check)"
                className="w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
              <button
                onClick={() => {
                  props.onAddQuiz(newQuizTitle);
                  setNewQuizTitle("");
                  setShowQuizForm(false);
                }}
                disabled={!newQuizTitle.trim()}
                className="rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-xs font-bold px-3 py-2"
              >
                Create quiz
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemBlock({
  item,
  index,
  total,
  quiz,
  questions,
  options,
  onDelete,
  onReorder,
  onRename,
  onToggleFree,
  onSetPdf,
  onRemovePdf,
  onEditQuestion,
  onDeleteQuestion,
}: {
  item: Item;
  index: number;
  total: number;
  quiz: Quiz | null;
  questions: Map<string, Question[]>;
  options: Map<string, QOption[]>;
  onDelete: () => void;
  onReorder: (d: -1 | 1) => void;
  onRename: (t: string) => void;
  onToggleFree: (next: boolean) => void;
  onSetPdf: (url: string, file: File | null) => void;
  onRemovePdf: () => void;
  onEditQuestion: (quizId: string, q: EditingQuestion | null, position: number) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [expandQuiz, setExpandQuiz] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(item.pdf_url ?? "");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const isLec = item.kind === "lecture";
  const hasPdf = !!(item.pdf_url || item.pdf_storage_path);
  const Icon = isLec ? PlayCircle : ListChecks;
  const tint = isLec ? "text-emerald-300 bg-emerald-500/10" : "text-cyan-300 bg-cyan-500/10";

  const quizQuestions = quiz ? (questions.get(quiz.id) ?? []).slice().sort((a, b) => a.position - b.position) : [];

  return (
    <div className="rounded-lg border border-white/10 bg-black/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex flex-col">
          <button onClick={() => onReorder(-1)} disabled={index === 0} className="text-white/40 hover:text-white disabled:opacity-20">
            <ChevronUp size={11} />
          </button>
          <button onClick={() => onReorder(1)} disabled={index === total - 1} className="text-white/40 hover:text-white disabled:opacity-20">
            <ChevronDown size={11} />
          </button>
        </div>
        <span className={`grid place-items-center h-7 w-7 rounded-md ${tint}`}>
          <Icon size={14} />
        </span>
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== item.title) onRename(title.trim());
              setEditing(false);
            }}
            autoFocus
            className="flex-1 rounded border border-white/20 bg-black/50 px-2 py-1 text-sm"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="flex-1 text-left text-sm text-white truncate">
            {item.title}
            <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40">{item.kind}</span>
          </button>
        )}

        <label
          title="Free for everyone"
          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full cursor-pointer select-none border ${
            item.is_free
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
              : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
          }`}
        >
          <input
            type="checkbox"
            checked={item.is_free}
            onChange={(e) => onToggleFree(e.target.checked)}
            className="sr-only"
          />
          {item.is_free ? "Free" : "Paid"}
        </label>

        {isLec && (
          <button
            onClick={() => setPdfOpen((v) => !v)}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${
              hasPdf
                ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
                : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
            }`}
          >
            {hasPdf ? "PDF" : "Add PDF"}
          </button>
        )}

        {!isLec && quiz && (
          <button onClick={() => setExpandQuiz((v) => !v)} className="text-xs text-cyan-300 hover:text-cyan-200 px-2">
            {expandQuiz ? "Hide questions" : `Questions (${quizQuestions.length})`}
          </button>
        )}
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 p-1">
          <Trash2 size={12} />
        </button>
      </div>

      {isLec && pdfOpen && (
        <div className="border-t border-white/5 p-3 space-y-2">
          <input
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="PDF link"
            className="w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/50"
          />
          <label className="block rounded border border-dashed border-white/20 px-3 py-2 text-xs text-white/60 cursor-pointer hover:border-white/40">
            <Upload size={12} className="inline mr-1" />
            {pdfFile
              ? pdfFile.name
              : item.pdf_storage_path
                ? "Replace uploaded PDF…"
                : "Or upload a PDF…"}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSetPdf(pdfUrl, pdfFile);
                setPdfFile(null);
                setPdfOpen(false);
              }}
              disabled={!pdfUrl.trim() && !pdfFile && !item.pdf_storage_path}
              className="rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold px-3 py-2"
            >
              Save PDF
            </button>
            {hasPdf && (
              <button
                onClick={() => {
                  onRemovePdf();
                  setPdfOpen(false);
                }}
                className="rounded-md border border-red-400/40 text-red-300 hover:bg-red-500/10 text-xs font-bold px-3 py-2"
              >
                Remove PDF
              </button>
            )}
          </div>
        </div>
      )}

      {!isLec && quiz && expandQuiz && (
        <div className="border-t border-white/5 p-3 space-y-2">
          {quizQuestions.length === 0 ? (
            <div className="text-xs text-white/40 text-center py-2">No questions yet.</div>
          ) : (
            quizQuestions.map((q, i) => {
              const opts = (options.get(q.id) ?? []).slice().sort((a, b) => a.position - b.position);
              return (
                <div
                  key={q.id}
                  className="rounded-md border border-white/10 bg-black/30 p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-1">
                      <span className="text-white/40">Q{i + 1}</span>
                      {q.published ? (
                        <span className="text-emerald-300 inline-flex items-center gap-0.5">
                          <Eye size={10} /> Published
                        </span>
                      ) : (
                        <span className="text-amber-300 inline-flex items-center gap-0.5">
                          <EyeOff size={10} /> Draft
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white whitespace-pre-wrap">{q.prompt}</div>
                    <div className="mt-1 text-[11px] text-white/50">
                      {opts.length} choice{opts.length === 1 ? "" : "s"} ·{" "}
                      {opts.find((o) => o.is_correct)
                        ? `Correct: ${String.fromCharCode(65 + (opts.find((o) => o.is_correct)?.position ?? 0))}`
                        : "No correct answer set"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        onEditQuestion(
                          quiz.id,
                          {
                            id: q.id,
                            prompt: q.prompt,
                            explanation: q.explanation,
                            published: q.published,
                            options: opts.map((o) => ({ id: o.id, body: o.body, is_correct: o.is_correct })),
                          },
                          q.position,
                        )
                      }
                      className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white inline-flex items-center gap-1"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => onDeleteQuestion(q.id)} className="text-red-400 p-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <button
            onClick={() => onEditQuestion(quiz.id, null, quizQuestions.length)}
            className="w-full rounded-md border border-dashed border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10 text-xs font-bold py-2 inline-flex items-center justify-center gap-1"
          >
            <Plus size={12} /> Add question
          </button>
        </div>
      )}
    </div>
  );
}
