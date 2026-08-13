import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  Languages,
  Type,
  MessageSquareText,
  Shuffle,
  ListChecks,
  BookOpen,
  Check,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/german/$courseId")({
  head: () => ({ meta: [{ title: "German course — Admin" }] }),
  component: AdminGermanCoursePage,
});

type ContentType = "words" | "sentences" | "mixed" | "shadowing";
type Course = { id: string; title: string; content_type: ContentType };
type Subject = { id: string; course_id: string; title: string; position: number; content_type: ContentType };
type Item = { id: string; subject_id: string; kind: "words" | "sentences" | "quiz" | "lecture"; title: string };
type Word = { id: string; item_id: string; position: number; german: string; english: string; example: string | null };
type Sentence = { id: string; item_id: string; position: number; german: string; english: string; notes: string | null };
type QuizQ = { id: string; quiz_id: string; prompt: string; position: number };
type QuizOpt = { id: string; question_id: string; position: number; body: string; is_correct: boolean };

const TYPE_META: Record<ContentType, { label: string; pill: string; Icon: any }> = {
  words: { label: "Words", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", Icon: Type },
  sentences: { label: "Sentences", pill: "bg-sky-100 text-sky-700 border-sky-200", Icon: MessageSquareText },
  mixed: { label: "Mixed", pill: "bg-amber-100 text-amber-700 border-amber-200", Icon: Shuffle },
  shadowing: { label: "Shadowing", pill: "bg-blue-100 text-blue-700 border-blue-200", Icon: Shuffle },
};

function AdminGermanCoursePage() {
  const { courseId } = Route.useParams();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newSubject, setNewSubject] = useState("");
  const [newSubjectType, setNewSubjectType] = useState<ContentType>("words");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) guardRedirect(navigate);
  }, [user, isAdmin, loading, navigate]);

  async function load() {
    const { data: c } = await (supabase.from as any)("german_courses")
      .select("id,title,content_type").eq("id", courseId).maybeSingle();
    const loaded = c ? ({ ...c, content_type: (c.content_type ?? "mixed") as ContentType } as Course) : null;
    setCourse(loaded);
    if (loaded?.content_type === "words" || loaded?.content_type === "sentences") setNewSubjectType(loaded.content_type);

    const { data: s } = await (supabase.from as any)("german_subjects")
      .select("id,course_id,title,position,content_type")
      .eq("course_id", courseId).order("position");
    setSubjects((s ?? []) as Subject[]);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, courseId]);

  async function addSubject() {
    if (!newSubject.trim()) return;
    const t = course?.content_type === "words" || course?.content_type === "sentences" ? course.content_type : newSubjectType;
    const { error } = await (supabase.from as any)("german_subjects").insert({
      course_id: courseId, title: newSubject.trim(), position: subjects.length, content_type: t,
    });
    if (error) { toast.error(error.message); return; }
    setNewSubject("");
    load();
  }

  async function deleteSubject(id: string) {
    if (!confirm("Delete this subject and everything inside?")) return;
    await (supabase.from as any)("german_subjects").delete().eq("id", id);
    load();
  }

  async function setCourseType(type: ContentType) {
    await (supabase.from as any)("german_courses").update({ content_type: type }).eq("id", courseId);
    setCourse((c) => (c ? { ...c, content_type: type } : c));
    if (type === "words" || type === "sentences") setNewSubjectType(type);
  }

  if (loading || !isAdmin) return null;

  const totalSubjects = subjects.length;
  const lockType = course?.content_type === "words" || course?.content_type === "sentences" ? course.content_type : null;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-6xl px-6 md:px-10 pt-24 pb-24">
        {/* Header */}
        <section className="relative overflow-hidden rounded-3xl aurora-bg-soft border border-slate-200 px-6 md:px-10 py-7 mb-6">
          <Link to="/admin/german" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700">
            <ArrowLeft className="w-3 h-3" /> All German courses
          </Link>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 bg-white border border-emerald-200 rounded-full px-3 py-1">
            <Languages className="w-3 h-3" /> Admin · Deutsch
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight capitalize text-slate-900">
            {course?.title ?? "Loading…"}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
              <BookOpen className="w-3.5 h-3.5" /> {totalSubjects} subjects
            </span>
            <Link
              to="/admin/german/$courseId/manage"
              params={{ courseId }}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5"
            >
              <ListChecks className="w-3.5 h-3.5" /> Open content manager
            </Link>
            <button
              onClick={() => navigate({ to: "/german/$courseId", params: { courseId } })}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Open as student
            </button>
          </div>
        </section>

        {/* Course type */}
        <div className="medical-card p-4 mb-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Course type</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {(["words", "sentences", "mixed", "shadowing"] as ContentType[]).map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.Icon;
              const active = (course?.content_type ?? "mixed") === t;
              return (
                <button
                  key={t}
                  onClick={() => setCourseType(t)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    active ? `${meta.pill} ring-2 ring-emerald-300` : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-bold">
                    {t === "mixed" ? "Mixed (words + sentences)" : t === "shadowing" ? "Smart Review (Shadowing)" : `${meta.label} only`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add subject */}
        <div className="medical-card p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubject()}
              placeholder="New subject title (e.g. Greetings & basics)"
              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            {!lockType && (
              <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {(["words", "sentences"] as ContentType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewSubjectType(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                      newSubjectType === t ? "bg-white shadow text-slate-900" : "text-slate-500"
                    }`}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={addSubject}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2"
            >
              <Plus className="w-3.5 h-3.5" /> Add subject
            </button>
          </div>
          {lockType && (
            <div className="mt-2 text-[11px] text-slate-500">
              New subjects in this course are <span className="font-bold">{TYPE_META[lockType].label}</span> only.
            </div>
          )}
        </div>

        {/* Subjects list */}
        <div className="space-y-3">
          {subjects.length === 0 && (
            <div className="medical-card p-10 text-center text-slate-500 text-sm">
              No subjects yet. Add one above to start adding words, sentences, or quizzes.
            </div>
          )}
          {subjects.map((s, idx) => {
            const isOpen = open[s.id] ?? idx === 0;
            const meta = TYPE_META[s.content_type ?? "mixed"];
            const Icon = meta.Icon;
            return (
              <div key={s.id} className="medical-card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
                  <button onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))} className="text-slate-400 hover:text-slate-700 shrink-0">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className={`w-7 h-7 rounded-lg grid place-items-center border ${meta.pill}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 truncate">{s.title}</div>
                    <div className="text-[11px] text-slate-500">
                      <span className={`inline-block rounded-full border px-1.5 py-0.5 font-bold uppercase tracking-wider mr-1 ${meta.pill}`}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      navigate({
                        to: "/german/$courseId/run",
                        params: { courseId },
                        search: { item: "", subject: s.id, mode: "study", range: "all", timed: 0, duration: 0, smart: 0 } as any,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5"
                  >
                    <PlayCircle className="w-3 h-3" /> Practice
                  </button>
                  <button onClick={() => deleteSubject(s.id)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {isOpen && <SubjectBody subject={s} courseType={course?.content_type ?? "mixed"} />}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

/* =================================================================
   SubjectBody — inline editors. Hides items: auto-creates one item
   per kind per subject (kind=words / sentences / quiz) on demand.
   ================================================================= */

function SubjectBody({ subject, courseType }: { subject: Subject; courseType: ContentType }) {
  const effectiveType: ContentType = subject.content_type ?? courseType ?? "mixed";
  const showWords = effectiveType !== "sentences";
  const showSentences = effectiveType !== "words";

  const [items, setItems] = useState<Item[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [quizQs, setQuizQs] = useState<QuizQ[]>([]);
  const [quizOpts, setQuizOpts] = useState<QuizOpt[]>([]);
  const [tab, setTab] = useState<"words" | "sentences" | "quiz">(showWords ? "words" : "sentences");

  async function load() {
    const { data: its } = await (supabase.from as any)("german_items")
      .select("id,subject_id,kind,title").eq("subject_id", subject.id);
    const it = (its ?? []) as Item[];
    setItems(it);

    const wordItemIds = it.filter((x) => x.kind === "words").map((x) => x.id);
    const sentItemIds = it.filter((x) => x.kind === "sentences").map((x) => x.id);
    const quizItemIds = it.filter((x) => x.kind === "quiz").map((x) => x.id);

    if (wordItemIds.length) {
      const { data } = await (supabase.from as any)("german_word_entries")
        .select("id,item_id,position,german,english,example").in("item_id", wordItemIds).order("position");
      setWords((data ?? []) as Word[]);
    } else setWords([]);

    if (sentItemIds.length) {
      const { data } = await (supabase.from as any)("german_sentence_entries")
        .select("id,item_id,position,german,english,notes").in("item_id", sentItemIds).order("position");
      setSentences((data ?? []) as Sentence[]);
    } else setSentences([]);

    if (quizItemIds.length) {
      const { data: qzs } = await (supabase.from as any)("german_quizzes").select("id,item_id").in("item_id", quizItemIds);
      const quizIds = (qzs ?? []).map((q: any) => q.id);
      if (quizIds.length) {
        const { data: qq } = await (supabase.from as any)("german_quiz_questions")
          .select("id,quiz_id,prompt,position").in("quiz_id", quizIds).order("position");
        const qList = (qq ?? []) as QuizQ[];
        setQuizQs(qList);
        if (qList.length) {
          const { data: oo } = await (supabase.from as any)("german_quiz_options")
            .select("id,question_id,position,body,is_correct").in("question_id", qList.map((q) => q.id)).order("position");
          setQuizOpts((oo ?? []) as QuizOpt[]);
        } else setQuizOpts([]);
      } else { setQuizQs([]); setQuizOpts([]); }
    } else { setQuizQs([]); setQuizOpts([]); }
  }

  useEffect(() => { load(); }, [subject.id]);

  async function ensureItem(kind: "words" | "sentences" | "quiz"): Promise<string> {
    const existing = items.find((i) => i.kind === kind);
    if (existing) return existing.id;
    const { data, error } = await (supabase.from as any)("german_items")
      .insert({ subject_id: subject.id, kind, title: "Default", position: 0 })
      .select("id").maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Could not create"); throw new Error("fail"); }
    if (kind === "quiz") {
      await (supabase.from as any)("german_quizzes").insert({ item_id: data.id });
    }
    await load();
    return data.id;
  }

  async function addWord() {
    const itemId = await ensureItem("words");
    await (supabase.from as any)("german_word_entries").insert({
      item_id: itemId, position: words.length, german: "", english: "",
    });
    load();
  }
  async function addSentence() {
    const itemId = await ensureItem("sentences");
    await (supabase.from as any)("german_sentence_entries").insert({
      item_id: itemId, position: sentences.length, german: "", english: "",
    });
    load();
  }
  async function addQuiz() {
    await ensureItem("quiz");
    // ensureItem refreshes, then find the quiz id
    const { data: its } = await (supabase.from as any)("german_items")
      .select("id,kind").eq("subject_id", subject.id);
    const quizItem = ((its ?? []) as any[]).find((i) => i.kind === "quiz");
    if (!quizItem) return;
    const { data: qz } = await (supabase.from as any)("german_quizzes")
      .select("id").eq("item_id", quizItem.id).maybeSingle();
    if (!qz) return;
    const { data: q } = await (supabase.from as any)("german_quiz_questions")
      .insert({ quiz_id: qz.id, prompt: "", position: quizQs.length, published: true })
      .select("id").maybeSingle();
    if (q) {
      const rows = [0, 1, 2, 3].map((i) => ({
        question_id: q.id, position: i, body: "", is_correct: i === 0,
      }));
      await (supabase.from as any)("german_quiz_options").insert(rows);
    }
    load();
  }

  async function saveWord(id: string, patch: Partial<Word>) {
    await (supabase.from as any)("german_word_entries").update(patch).eq("id", id);
  }
  async function delWord(id: string) {
    await (supabase.from as any)("german_word_entries").delete().eq("id", id); load();
  }
  async function saveSent(id: string, patch: Partial<Sentence>) {
    await (supabase.from as any)("german_sentence_entries").update(patch).eq("id", id);
  }
  async function delSent(id: string) {
    await (supabase.from as any)("german_sentence_entries").delete().eq("id", id); load();
  }
  async function saveQuestion(id: string, prompt: string) {
    await (supabase.from as any)("german_quiz_questions").update({ prompt }).eq("id", id);
  }
  async function saveOpt(id: string, body: string) {
    await (supabase.from as any)("german_quiz_options").update({ body }).eq("id", id);
  }
  async function setCorrect(qId: string, oId: string) {
    await (supabase.from as any)("german_quiz_options").update({ is_correct: false }).eq("question_id", qId);
    await (supabase.from as any)("german_quiz_options").update({ is_correct: true }).eq("id", oId);
    load();
  }
  async function delQuestion(id: string) {
    await (supabase.from as any)("german_quiz_questions").delete().eq("id", id); load();
  }

  async function bulkPasteWords(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const itemId = await ensureItem("words");
    const rows = lines.map((l, i) => {
      const [german, english, example] = l.split(/\s*[|\t]\s*/);
      return { item_id: itemId, position: words.length + i, german: german ?? "", english: english ?? "", example: example || null };
    });
    await (supabase.from as any)("german_word_entries").insert(rows);
    toast.success(`Added ${rows.length} words`);
    load();
  }
  async function bulkPasteSentences(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const itemId = await ensureItem("sentences");
    const rows = lines.map((l, i) => {
      const [german, english, notes] = l.split(/\s*[|\t]\s*/);
      return { item_id: itemId, position: sentences.length + i, german: german ?? "", english: english ?? "", notes: notes || null };
    });
    await (supabase.from as any)("german_sentence_entries").insert(rows);
    toast.success(`Added ${rows.length} sentences`);
    load();
  }

  const TABS: { id: "words" | "sentences" | "quiz"; label: string; Icon: any; visible: boolean; count: number }[] = [
    { id: "words", label: "Words", Icon: Type, visible: showWords, count: words.length },
    { id: "sentences", label: "Sentences", Icon: MessageSquareText, visible: showSentences, count: sentences.length },
    { id: "quiz", label: "Quiz", Icon: ListChecks, visible: true, count: quizQs.length },
  ];

  return (
    <div className="bg-slate-50/60 p-4">
      <div className="inline-flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200 mb-3">
        {TABS.filter((t) => t.visible).map((t) => {
          const Icon = t.Icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
                active ? "bg-emerald-600 text-white shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3 h-3" /> {t.label}
              <span className={`text-[10px] tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "words" && showWords && (
        <WordsPanel words={words} onAdd={addWord} onSave={saveWord} onDelete={delWord} onPaste={bulkPasteWords} />
      )}
      {tab === "sentences" && showSentences && (
        <SentencesPanel sentences={sentences} onAdd={addSentence} onSave={saveSent} onDelete={delSent} onPaste={bulkPasteSentences} />
      )}
      {tab === "quiz" && (
        <QuizPanel
          questions={quizQs}
          options={quizOpts}
          onAdd={addQuiz}
          onSavePrompt={saveQuestion}
          onSaveOption={saveOpt}
          onSetCorrect={setCorrect}
          onDelete={delQuestion}
        />
      )}
    </div>
  );
}

/* ============= Words ============= */

function WordsPanel({
  words, onAdd, onSave, onDelete, onPaste,
}: {
  words: Word[]; onAdd: () => void; onSave: (id: string, p: Partial<Word>) => void; onDelete: (id: string) => void; onPaste: (t: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  return (
    <div className="space-y-2">
      {words.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No words yet. Add one or paste a list.
        </div>
      )}
      {words.length > 0 && (
        <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
          <div>Deutsch</div><div>English</div><div>Example (optional)</div><div></div>
        </div>
      )}
      {words.map((r) => (
        <div key={r.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 bg-white border border-slate-200 rounded-lg p-2">
          <input defaultValue={r.german} onBlur={(e) => onSave(r.id, { german: e.target.value })}
            placeholder="Deutsch"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.english} onBlur={(e) => onSave(r.id, { english: e.target.value })}
            placeholder="English"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.example ?? ""} onBlur={(e) => onSave(r.id, { example: e.target.value || null })}
            placeholder="Example"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 justify-self-end md:justify-self-auto">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> Add word
        </button>
        <button onClick={() => setShowPaste((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:border-emerald-400 text-slate-700 text-xs font-bold px-3 py-2">
          <ClipboardList className="w-3.5 h-3.5" /> Paste list
        </button>
      </div>
      {showPaste && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mt-2 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            One per line: <code className="bg-white px-1.5 py-0.5 rounded">Deutsch | English | Example</code>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Hallo | Hello\nDanke | Thank you"}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
          />
          <div className="flex gap-2">
            <button onClick={() => { onPaste(pasteText); setPasteText(""); setShowPaste(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
              <Check className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }}
              className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============= Sentences ============= */

function SentencesPanel({
  sentences, onAdd, onSave, onDelete, onPaste,
}: {
  sentences: Sentence[]; onAdd: () => void; onSave: (id: string, p: Partial<Sentence>) => void; onDelete: (id: string) => void; onPaste: (t: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  return (
    <div className="space-y-2">
      {sentences.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No sentences yet.
        </div>
      )}
      {sentences.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5">
          <div className="flex gap-2">
            <input defaultValue={r.german} onBlur={(e) => onSave(r.id, { german: e.target.value })}
              placeholder="Deutscher Satz…"
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
            <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <input defaultValue={r.english} onBlur={(e) => onSave(r.id, { english: e.target.value })}
            placeholder="English translation…"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.notes ?? ""} onBlur={(e) => onSave(r.id, { notes: e.target.value || null })}
            placeholder="Notes (optional)"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-500 text-slate-600" />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> Add sentence
        </button>
        <button onClick={() => setShowPaste((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:border-emerald-400 text-slate-700 text-xs font-bold px-3 py-2">
          <ClipboardList className="w-3.5 h-3.5" /> Paste list
        </button>
      </div>
      {showPaste && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mt-2 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            One per line: <code className="bg-white px-1.5 py-0.5 rounded">Deutsch | English | Notes</code>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Wie geht es dir? | How are you?\nIch komme aus Syrien. | I'm from Syria."}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
          />
          <div className="flex gap-2">
            <button onClick={() => { onPaste(pasteText); setPasteText(""); setShowPaste(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
              <Check className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }}
              className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============= Quiz ============= */

function QuizPanel({
  questions, options, onAdd, onSavePrompt, onSaveOption, onSetCorrect, onDelete,
}: {
  questions: QuizQ[]; options: QuizOpt[];
  onAdd: () => void;
  onSavePrompt: (id: string, p: string) => void;
  onSaveOption: (id: string, b: string) => void;
  onSetCorrect: (qId: string, oId: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No quiz questions yet.
        </div>
      )}
      {questions.map((q, idx) => {
        const myOpts = options.filter((o) => o.question_id === q.id);
        return (
          <div key={q.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Q{idx + 1}</span>
              <button onClick={() => onDelete(q.id)} className="ml-auto p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <input
              defaultValue={q.prompt}
              onBlur={(e) => onSavePrompt(q.id, e.target.value)}
              placeholder="Question…"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
            />
            <div className="grid sm:grid-cols-2 gap-1.5">
              {myOpts.map((o, i) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSetCorrect(q.id, o.id)}
                    className={`h-7 w-7 rounded-md text-[11px] font-bold shrink-0 ${
                      o.is_correct ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                  <input
                    defaultValue={o.body}
                    onBlur={(e) => onSaveOption(o.id, e.target.value)}
                    placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
        <Plus className="w-3.5 h-3.5" /> Add question
      </button>
    </div>
  );
}
