import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  Mic,
  Gamepad2,
  Languages,
  Type,
  MessageSquareText,
  ListChecks,
  BookOpen,
  Check,
  ClipboardList,
  FolderPlus,
  Pencil,
  Layers,
  Sparkles,
} from "lucide-react";
import { GermanImageImporter } from "@/components/admin/GermanImageImporter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/german/$courseId/manage")({
  head: () => ({ meta: [{ title: "Content manager — German Admin" }] }),
  component: ManagePage,
});

type Course = { id: string; title: string; content_type: string };
type Subject = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  content_type: string;
  parent_id: string | null;
};
type Item = { id: string; subject_id: string; kind: "words" | "sentences" | "quiz" | "lecture"; title: string };
type Word = { id: string; item_id: string; position: number; german: string; english: string; example: string | null };
type Sentence = { id: string; item_id: string; position: number; german: string; english: string; notes: string | null };
type QuizQ = { id: string; quiz_id: string; prompt: string; position: number };
type QuizOpt = { id: string; question_id: string; position: number; body: string; is_correct: boolean };

type Counts = { words: number; sentences: number; quizzes: number };

function ManagePage() {
  const { courseId } = Route.useParams();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

  async function loadAll() {
    const { data: c } = await (supabase.from as any)("german_courses")
      .select("id,title,content_type").eq("id", courseId).maybeSingle();
    setCourse((c ?? null) as Course | null);

    const { data: s } = await (supabase.from as any)("german_subjects")
      .select("id,course_id,title,position,content_type,parent_id")
      .eq("course_id", courseId).order("position");
    const subs = (s ?? []) as Subject[];
    setSubjects(subs);

    // counts per subject
    if (subs.length) {
      const ids = subs.map((x) => x.id);
      const { data: its } = await (supabase.from as any)("german_items")
        .select("id,subject_id,kind").in("subject_id", ids);
      const items = (its ?? []) as { id: string; subject_id: string; kind: string }[];
      const wordItems = items.filter((i) => i.kind === "words");
      const sentItems = items.filter((i) => i.kind === "sentences");
      const quizItems = items.filter((i) => i.kind === "quiz");

      const [{ data: wEntries }, { data: sEntries }, { data: qzs }] = await Promise.all([
        wordItems.length
          ? (supabase.from as any)("german_word_entries").select("item_id").in("item_id", wordItems.map((x) => x.id))
          : Promise.resolve({ data: [] as any[] }),
        sentItems.length
          ? (supabase.from as any)("german_sentence_entries").select("item_id").in("item_id", sentItems.map((x) => x.id))
          : Promise.resolve({ data: [] as any[] }),
        quizItems.length
          ? (supabase.from as any)("german_quizzes").select("id,item_id").in("item_id", quizItems.map((x) => x.id))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // map item -> subject
      const itemToSubj = new Map(items.map((i) => [i.id, i.subject_id]));
      const next: Record<string, Counts> = {};
      subs.forEach((x) => (next[x.id] = { words: 0, sentences: 0, quizzes: 0 }));
      (wEntries ?? []).forEach((r: any) => {
        const sid = itemToSubj.get(r.item_id); if (sid) next[sid].words++;
      });
      (sEntries ?? []).forEach((r: any) => {
        const sid = itemToSubj.get(r.item_id); if (sid) next[sid].sentences++;
      });
      (qzs ?? []).forEach((q: any) => {
        const sid = itemToSubj.get(q.item_id); if (sid) next[sid].quizzes++;
      });
      setCounts(next);
    } else setCounts({});

    if (!selectedId && subs.length) setSelectedId(subs[0].id);
  }

  useEffect(() => { if (isAdmin) loadAll(); /* eslint-disable-next-line */ }, [isAdmin, courseId]);

  // tree helpers
  const roots = useMemo(() => subjects.filter((s) => !s.parent_id), [subjects]);
  const childrenOf = (id: string) => subjects.filter((s) => s.parent_id === id);
  const selected = subjects.find((s) => s.id === selectedId) ?? null;

  // aggregate counts (children rolled up)
  function rollup(id: string): Counts {
    const own = counts[id] ?? { words: 0, sentences: 0, quizzes: 0 };
    const kids = childrenOf(id).reduce(
      (acc, c) => {
        const r = rollup(c.id);
        acc.words += r.words; acc.sentences += r.sentences; acc.quizzes += r.quizzes;
        return acc;
      },
      { words: 0, sentences: 0, quizzes: 0 },
    );
    return { words: own.words + kids.words, sentences: own.sentences + kids.sentences, quizzes: own.quizzes + kids.quizzes };
  }

  async function addSubject(parent: string | null) {
    const title = window.prompt(parent ? "New level title" : "New subject title");
    if (!title?.trim()) return;
    const siblings = subjects.filter((x) => (x.parent_id ?? null) === parent);
    const ct = course?.content_type && course.content_type !== "mixed" ? course.content_type : "mixed";
    const { error } = await (supabase.from as any)("german_subjects").insert({
      course_id: courseId, title: title.trim(), position: siblings.length, content_type: ct, parent_id: parent,
    });
    if (error) { toast.error(error.message); return; }
    if (parent) setExpanded((e) => ({ ...e, [parent]: true }));
    loadAll();
  }
  async function renameSubject(id: string, title: string) {
    if (!title.trim()) return;
    await (supabase.from as any)("german_subjects").update({ title: title.trim() }).eq("id", id);
    setRenamingId(null);
    loadAll();
  }
  async function deleteSubject(id: string) {
    if (!confirm("Delete this subject and everything inside?")) return;
    await (supabase.from as any)("german_subjects").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    loadAll();
  }

  if (loading || !isAdmin) return null;

  const totals = roots.reduce(
    (acc, r) => {
      const x = rollup(r.id);
      acc.subjects += 1 + countDescendants(r.id);
      acc.words += x.words; acc.sentences += x.sentences; acc.quizzes += x.quizzes;
      return acc;
    },
    { subjects: 0, words: 0, sentences: 0, quizzes: 0 },
  );
  function countDescendants(id: string): number {
    return childrenOf(id).reduce((n, c) => n + 1 + countDescendants(c.id), 0);
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-7xl px-4 md:px-8 pt-24 pb-24">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl aurora-bg-soft border border-slate-200 px-6 md:px-10 py-7 mb-6">
          <Link to="/admin/german/$courseId" params={{ courseId }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700">
            <ArrowLeft className="w-3 h-3" /> Back to course
          </Link>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 bg-white border border-emerald-200 rounded-full px-3 py-1">
            <Languages className="w-3 h-3" /> Content manager
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight capitalize text-slate-900">
            {course?.title ?? "Loading…"}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip icon={<BookOpen className="w-3.5 h-3.5" />} label={`${totals.subjects} subjects`} tone="emerald" />
            <Chip icon={<Type className="w-3.5 h-3.5" />} label={`${totals.words} words`} tone="emerald" />
            <Chip icon={<MessageSquareText className="w-3.5 h-3.5" />} label={`${totals.sentences} sentences`} tone="sky" />
            <Chip icon={<ListChecks className="w-3.5 h-3.5" />} label={`${totals.quizzes} quizzes`} tone="amber" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Tree */}
          <aside className="lg:sticky lg:top-24 self-start">
            <div className="medical-card p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Subjects</div>
                <button
                  onClick={() => addSubject(null)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                {roots.length === 0 && (
                  <div className="text-center text-xs text-slate-500 py-6 px-2">
                    No subjects yet. Click <span className="font-bold">Add</span> to start.
                  </div>
                )}
                {roots.map((r) => (
                  <TreeNode
                    key={r.id}
                    node={r}
                    depth={0}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    childrenOf={childrenOf}
                    rollup={rollup}
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                    renameVal={renameVal}
                    setRenameVal={setRenameVal}
                    onRename={renameSubject}
                    onDelete={deleteSubject}
                    onAddChild={(pid) => addSubject(pid)}
                  />
                ))}
              </div>
            </div>
          </aside>

          {/* Right pane */}
          <section>
            {!selected ? (
              <div className="medical-card p-12 text-center text-slate-500">
                Select a subject on the left to manage its words, sentences, or quizzes.
              </div>
            ) : (
              <RightPane
                key={selected.id}
                courseId={courseId}
                subject={selected}
                onReloadCounts={loadAll}
                navigate={navigate}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* ───────────── Tree node ───────────── */

function TreeNode(props: {
  node: Subject; depth: number;
  expanded: Record<string, boolean>; setExpanded: (u: any) => void;
  selectedId: string | null; setSelectedId: (id: string) => void;
  childrenOf: (id: string) => Subject[];
  rollup: (id: string) => Counts;
  renamingId: string | null; setRenamingId: (id: string | null) => void;
  renameVal: string; setRenameVal: (v: string) => void;
  onRename: (id: string, t: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (pid: string) => void;
}) {
  const { node, depth, expanded, setExpanded, selectedId, setSelectedId, childrenOf, rollup,
    renamingId, setRenamingId, renameVal, setRenameVal, onRename, onDelete, onAddChild } = props;
  const kids = childrenOf(node.id);
  const open = expanded[node.id] ?? depth === 0;
  const r = rollup(node.id);
  const isSel = selectedId === node.id;
  const isRenaming = renamingId === node.id;
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg pl-1 pr-1 py-1.5 cursor-pointer transition ${
          isSel ? "bg-emerald-100/70 ring-1 ring-emerald-300" : "hover:bg-slate-100"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => setSelectedId(node.id)}
      >
        {kids.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((x: any) => ({ ...x, [node.id]: !open })); }}
            className="text-slate-400 hover:text-slate-700 shrink-0"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {isRenaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => onRename(node.id, renameVal)}
            onKeyDown={(e) => { if (e.key === "Enter") onRename(node.id, renameVal); if (e.key === "Escape") setRenamingId(null); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-sm outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800">{node.title}</span>
        )}
        <span className="text-[10px] tabular-nums text-slate-400 shrink-0">
          {r.words + r.sentences + r.quizzes}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
          <button
            title="Add child"
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
            className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-white"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            title="Rename"
            onClick={(e) => { e.stopPropagation(); setRenamingId(node.id); setRenameVal(node.title); }}
            className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-white"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-white"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {open && kids.length > 0 && (
        <div>
          {kids.map((k) => (
            <TreeNode key={k.id} {...props} node={k} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Right pane ───────────── */

function RightPane({
  courseId, subject, onReloadCounts, navigate,
}: {
  courseId: string; subject: Subject;
  onReloadCounts: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [quizQs, setQuizQs] = useState<QuizQ[]>([]);
  const [quizOpts, setQuizOpts] = useState<QuizOpt[]>([]);
  const [tab, setTab] = useState<"words" | "sentences" | "quiz">("words");
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    const { data: its } = await (supabase.from as any)("german_items")
      .select("id,subject_id,kind,title").eq("subject_id", subject.id);
    const it = (its ?? []) as Item[];
    setItems(it);

    const wIds = it.filter((x) => x.kind === "words").map((x) => x.id);
    const sIds = it.filter((x) => x.kind === "sentences").map((x) => x.id);
    const qIds = it.filter((x) => x.kind === "quiz").map((x) => x.id);

    if (wIds.length) {
      const { data } = await (supabase.from as any)("german_word_entries")
        .select("id,item_id,position,german,english,example").in("item_id", wIds).order("position");
      setWords((data ?? []) as Word[]);
    } else setWords([]);

    if (sIds.length) {
      const { data } = await (supabase.from as any)("german_sentence_entries")
        .select("id,item_id,position,german,english,notes").in("item_id", sIds).order("position");
      setSentences((data ?? []) as Sentence[]);
    } else setSentences([]);

    if (qIds.length) {
      const { data: qzs } = await (supabase.from as any)("german_quizzes").select("id,item_id").in("item_id", qIds);
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
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [subject.id]);

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

  /* CRUD - words */
  async function addWord() {
    const id = await ensureItem("words");
    await (supabase.from as any)("german_word_entries").insert({ item_id: id, position: words.length, german: "", english: "" });
    load(); onReloadCounts();
  }
  async function pasteWords(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const id = await ensureItem("words");
    const rows = lines.map((l, i) => {
      const [german, english, example] = l.split(/\s*[|\t]\s*/);
      return { item_id: id, position: words.length + i, german: german ?? "", english: english ?? "", example: example || null };
    });
    await (supabase.from as any)("german_word_entries").insert(rows);
    toast.success(`Added ${rows.length} words`); load(); onReloadCounts();
  }
  /* CRUD - sentences */
  async function addSent() {
    const id = await ensureItem("sentences");
    await (supabase.from as any)("german_sentence_entries").insert({ item_id: id, position: sentences.length, german: "", english: "" });
    load(); onReloadCounts();
  }
  async function pasteSents(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const id = await ensureItem("sentences");
    const rows = lines.map((l, i) => {
      const [german, english, notes] = l.split(/\s*[|\t]\s*/);
      return { item_id: id, position: sentences.length + i, german: german ?? "", english: english ?? "", notes: notes || null };
    });
    await (supabase.from as any)("german_sentence_entries").insert(rows);
    toast.success(`Added ${rows.length} sentences`); load(); onReloadCounts();
  }
  /* CRUD - quiz */
  async function addQuestion() {
    await ensureItem("quiz");
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
    load(); onReloadCounts();
  }
  async function pasteQuestions(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    await ensureItem("quiz");
    const { data: its } = await (supabase.from as any)("german_items").select("id,kind").eq("subject_id", subject.id);
    const quizItem = ((its ?? []) as any[]).find((i) => i.kind === "quiz");
    if (!quizItem) return;
    const { data: qz } = await (supabase.from as any)("german_quizzes")
      .select("id").eq("item_id", quizItem.id).maybeSingle();
    if (!qz) return;
    let added = 0;
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s*\|\s*/);
      const [prompt, ...rest] = parts;
      if (!prompt) continue;
      const correctLetter = (rest.pop() || "A").trim().toUpperCase();
      const opts = rest.slice(0, 6).filter((x) => x);
      if (opts.length < 2) continue;
      const { data: q } = await (supabase.from as any)("german_quiz_questions")
        .insert({ quiz_id: qz.id, prompt, position: quizQs.length + i, published: true })
        .select("id").maybeSingle();
      if (!q) continue;
      const rows = opts.map((body, idx) => ({
        question_id: q.id, position: idx, body, is_correct: String.fromCharCode(65 + idx) === correctLetter,
      }));
      await (supabase.from as any)("german_quiz_options").insert(rows);
      added++;
    }
    toast.success(`Added ${added} questions`); load(); onReloadCounts();
  }

  function launch(mode: "study" | "session" | "exam" | "voice" | "game") {
    navigate({
      to: "/german/$courseId/run",
      params: { courseId },
      search: { item: "", subject: subject.id, mode, range: "all", timed: 0, duration: 0, smart: 0 } as any,
    });
  }

  const TABS = [
    { id: "words" as const, label: "Words", Icon: Type, count: words.length },
    { id: "sentences" as const, label: "Sentences", Icon: MessageSquareText, count: sentences.length },
    { id: "quiz" as const, label: "Quizzes", Icon: ListChecks, count: quizQs.length },
  ];

  return (
    <div className="space-y-4">
      {/* Subject header */}
      <div className="medical-card p-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Subject</div>
          <div className="text-lg font-black text-slate-900 truncate">{subject.title}</div>
        </div>
        <button onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white text-xs font-bold px-3 py-2"
          title="Use Jarvis to OCR a textbook page into words/sentences">
          <Sparkles className="w-3.5 h-3.5" /> Jarvis import
        </button>
        <button onClick={() => launch("voice")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-300 hover:border-emerald-400 text-slate-800 text-xs font-bold px-3 py-2">
          <Mic className="w-3.5 h-3.5" /> Voice mode
        </button>
        <button onClick={() => launch("game")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-300 hover:border-emerald-400 text-slate-800 text-xs font-bold px-3 py-2">
          <Gamepad2 className="w-3.5 h-3.5" /> Game mode
        </button>
        <button onClick={() => launch("session")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
          <PlayCircle className="w-3.5 h-3.5" /> Practice
        </button>
      </div>

      <GermanImageImporter
        open={importOpen}
        onOpenChange={setImportOpen}
        subjectId={subject.id}
        defaultKind={tab === "sentences" ? "sentences" : "words"}
        onDone={() => { load(); onReloadCounts(); }}
      />

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
        {TABS.map((t) => {
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

      {tab === "words" && (
        <WordsPanel
          words={words}
          onAdd={addWord}
          onSave={async (id, p) => { await (supabase.from as any)("german_word_entries").update(p).eq("id", id); }}
          onDelete={async (id) => { await (supabase.from as any)("german_word_entries").delete().eq("id", id); load(); onReloadCounts(); }}
          onPaste={pasteWords}
        />
      )}
      {tab === "sentences" && (
        <SentencesPanel
          sentences={sentences}
          onAdd={addSent}
          onSave={async (id, p) => { await (supabase.from as any)("german_sentence_entries").update(p).eq("id", id); }}
          onDelete={async (id) => { await (supabase.from as any)("german_sentence_entries").delete().eq("id", id); load(); onReloadCounts(); }}
          onPaste={pasteSents}
        />
      )}
      {tab === "quiz" && (
        <QuizPanel
          questions={quizQs}
          options={quizOpts}
          onAdd={addQuestion}
          onSavePrompt={async (id, p) => { await (supabase.from as any)("german_quiz_questions").update({ prompt: p }).eq("id", id); }}
          onSaveOption={async (id, b) => { await (supabase.from as any)("german_quiz_options").update({ body: b }).eq("id", id); }}
          onSetCorrect={async (qId, oId) => {
            await (supabase.from as any)("german_quiz_options").update({ is_correct: false }).eq("question_id", qId);
            await (supabase.from as any)("german_quiz_options").update({ is_correct: true }).eq("id", oId);
            load();
          }}
          onDelete={async (id) => { await (supabase.from as any)("german_quiz_questions").delete().eq("id", id); load(); onReloadCounts(); }}
          onPaste={pasteQuestions}
        />
      )}
    </div>
  );
}

/* ───────────── shared bits ───────────── */

function Chip({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "emerald" | "sky" | "amber" }) {
  const map = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${map[tone]}`}>
      {icon} {label}
    </span>
  );
}

function WordsPanel({ words, onAdd, onSave, onDelete, onPaste }: {
  words: Word[]; onAdd: () => void; onSave: (id: string, p: Partial<Word>) => void; onDelete: (id: string) => void; onPaste: (t: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  return (
    <div className="space-y-2">
      {words.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
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
          <input defaultValue={r.german} onBlur={(e) => onSave(r.id, { german: e.target.value })} placeholder="Deutsch"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.english} onBlur={(e) => onSave(r.id, { english: e.target.value })} placeholder="English"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.example ?? ""} onBlur={(e) => onSave(r.id, { example: e.target.value || null })} placeholder="Example"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 justify-self-end md:justify-self-auto">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> Add word
        </button>
        <button onClick={() => setShowPaste((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:border-emerald-400 text-slate-700 text-xs font-bold px-3 py-2">
          <ClipboardList className="w-3.5 h-3.5" /> Paste list
        </button>
      </div>
      {showPaste && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mt-2 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            One per line: <code className="bg-white px-1.5 py-0.5 rounded">Deutsch | English | Example</code>
          </div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
            placeholder={"Hallo | Hello\nDanke | Thank you"}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-500 font-mono" />
          <div className="flex gap-2">
            <button onClick={() => { onPaste(pasteText); setPasteText(""); setShowPaste(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
              <Check className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }} className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SentencesPanel({ sentences, onAdd, onSave, onDelete, onPaste }: {
  sentences: Sentence[]; onAdd: () => void; onSave: (id: string, p: Partial<Sentence>) => void; onDelete: (id: string) => void; onPaste: (t: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  return (
    <div className="space-y-2">
      {sentences.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No sentences yet.
        </div>
      )}
      {sentences.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5">
          <div className="flex gap-2">
            <input defaultValue={r.german} onBlur={(e) => onSave(r.id, { german: e.target.value })} placeholder="Deutscher Satz…"
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
            <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <input defaultValue={r.english} onBlur={(e) => onSave(r.id, { english: e.target.value })} placeholder="English translation…"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
          <input defaultValue={r.notes ?? ""} onBlur={(e) => onSave(r.id, { notes: e.target.value || null })} placeholder="Notes (optional)"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-500 text-slate-600" />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> Add sentence
        </button>
        <button onClick={() => setShowPaste((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:border-emerald-400 text-slate-700 text-xs font-bold px-3 py-2">
          <ClipboardList className="w-3.5 h-3.5" /> Paste list
        </button>
      </div>
      {showPaste && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mt-2 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            One per line: <code className="bg-white px-1.5 py-0.5 rounded">Deutsch | English | Notes</code>
          </div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
            placeholder={"Wie geht es dir? | How are you?\nIch komme aus Syrien. | I'm from Syria."}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-500 font-mono" />
          <div className="flex gap-2">
            <button onClick={() => { onPaste(pasteText); setPasteText(""); setShowPaste(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2">
              <Check className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }} className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizPanel({ questions, options, onAdd, onSavePrompt, onSaveOption, onSetCorrect, onDelete, onPaste }: {
  questions: QuizQ[]; options: QuizOpt[];
  onAdd: () => void;
  onSavePrompt: (id: string, p: string) => void;
  onSaveOption: (id: string, b: string) => void;
  onSetCorrect: (qId: string, oId: string) => void;
  onDelete: (id: string) => void;
  onPaste: (t: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const NewBtn = (
    <button
      onClick={onAdd}
      className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/30 transition hover:shadow-emerald-500/50 hover:scale-[1.02]"
    >
      <span className="grid place-items-center w-6 h-6 rounded-full bg-white/20">
        <Plus className="w-4 h-4" />
      </span>
      New question
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Hero action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {NewBtn}
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white hover:border-emerald-400 text-slate-700 text-xs font-bold px-4 py-2.5"
        >
          <ClipboardList className="w-3.5 h-3.5" /> Paste list
        </button>
        <div className="ml-auto text-xs font-semibold text-slate-500 tabular-nums">
          {questions.length} {questions.length === 1 ? "question" : "questions"}
        </div>
      </div>

      {showPaste && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            One per line: <code className="bg-white px-1.5 py-0.5 rounded">Question | A | B | C | D | correct_letter</code>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Was bedeutet 'Ich bin'? | I am | You are | He is | We are | A"}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-500 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onPaste(pasteText); setPasteText(""); setShowPaste(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2"
            >
              <Check className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }} className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-12 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.15),transparent_60%)]" />
          <div className="relative">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/20 grid place-items-center mb-4 ring-1 ring-emerald-400/30">
              <ListChecks className="w-7 h-7 text-emerald-300" />
            </div>
            <div className="text-white text-xl font-black mb-1">Create your first question</div>
            <div className="text-slate-400 text-sm mb-6">Like the live quiz card — a prompt and four answers.</div>
            <div className="inline-flex">{NewBtn}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <QuizCard
              key={q.id}
              index={idx}
              question={q}
              options={options.filter((o) => o.question_id === q.id)}
              onSavePrompt={onSavePrompt}
              onSaveOption={onSaveOption}
              onSetCorrect={onSetCorrect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuizCard({
  index, question, options, onSavePrompt, onSaveOption, onSetCorrect, onDelete,
}: {
  index: number;
  question: QuizQ;
  options: QuizOpt[];
  onSavePrompt: (id: string, p: string) => void;
  onSaveOption: (id: string, b: string) => void;
  onSetCorrect: (qId: string, oId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [saved, setSaved] = useState(false);
  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }
  // Pad to 4 visible slots even if backend has fewer
  const padded: (QuizOpt | null)[] = [0, 1, 2, 3].map((i) => options[i] ?? null);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-xl ring-1 ring-emerald-500/10">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
          Q{index + 1}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Translate the sentence</span>
        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          <button
            onClick={() => onDelete(question.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
            title="Delete question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        defaultValue={question.prompt}
        onBlur={(e) => { onSavePrompt(question.id, e.target.value); flashSaved(); }}
        placeholder="Type the German prompt…"
        className="w-full bg-transparent text-3xl md:text-4xl font-black text-white placeholder:text-slate-600 outline-none mb-5 pb-2 border-b border-slate-800 focus:border-emerald-500/60 transition"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {padded.map((o, oi) => {
          const letter = String.fromCharCode(65 + oi);
          if (!o) {
            return (
              <div key={oi} className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3.5 text-slate-600 text-sm">
                <span className="font-black text-emerald-400/60">{letter}.</span>
                <span className="italic">slot pending…</span>
              </div>
            );
          }
          const isCorrect = o.is_correct;
          return (
            <div
              key={o.id}
              className={`group flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                isCorrect
                  ? "border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
              }`}
            >
              <button
                onClick={() => onSetCorrect(question.id, o.id)}
                title={isCorrect ? "Correct answer" : "Mark as correct"}
                className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center font-black text-sm transition ${
                  isCorrect
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/40"
                    : "bg-slate-800 text-emerald-300 group-hover:bg-slate-700"
                }`}
              >
                {isCorrect ? <Check className="w-4 h-4" /> : letter}
              </button>
              <input
                defaultValue={o.body}
                onBlur={(e) => { onSaveOption(o.id, e.target.value); flashSaved(); }}
                placeholder={`Answer ${letter}`}
                className="flex-1 bg-transparent text-base font-semibold text-white placeholder:text-slate-600 outline-none"
              />
              {!isCorrect && (
                <button
                  onClick={() => onSetCorrect(question.id, o.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition"
                >
                  Mark
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-slate-500">
          Click a letter to mark the correct answer. Changes save automatically.
        </div>
        <button
          onClick={(e) => {
            (e.currentTarget as HTMLButtonElement).blur();
            (document.activeElement as HTMLElement | null)?.blur?.();
            flashSaved();
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 border border-white/10"
        >
          <Check className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}
