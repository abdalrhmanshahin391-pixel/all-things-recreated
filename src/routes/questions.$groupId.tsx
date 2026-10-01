import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, FolderInput, X } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { QuestionImagePicker } from "@/components/admin/QuestionImagePicker";
import { deleteQuestionImage } from "@/lib/question-image";
import { supabase } from "@/integrations/supabase/client";
import {
  loadGroupQuestions, rdb, saveRequestQuestion,
  type RequestGroup, type RequestOption, type RequestQuestion,
} from "@/lib/question-requests";
import { qrAddToCourse } from "@/lib/question-requests.functions";

export const Route = createFileRoute("/questions/$groupId")({
  head: () => ({
    meta: [
      { title: "Question group — AquaQBank" },
      { name: "description", content: "Add, edit and review the questions in this group." },
      { property: "og:title", content: "Question group — AquaQBank" },
      { property: "og:description", content: "Add, edit and review the questions in this group." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GroupPage,
});

type Draft = Omit<RequestQuestion, "id" | "group_id"> & { id?: string };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

function GroupPage() {
  const { groupId } = Route.useParams();
  const { user, isRealAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showCourse, setShowCourse] = useState(false);

  const group = useQuery({
    enabled: !!user,
    queryKey: ["request-group", groupId],
    queryFn: async () => {
      const { data, error } = await rdb("request_groups").select("*").eq("id", groupId).maybeSingle();
      if (error) throw error;
      return data as RequestGroup | null;
    },
  });
  const questions = useQuery({
    enabled: !!group.data,
    queryKey: ["request-questions", groupId],
    queryFn: () => loadGroupQuestions(groupId),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["request-group", groupId] });
    qc.invalidateQueries({ queryKey: ["request-questions", groupId] });
  };

  if (loading || group.isLoading) return <Shell><Loader2 className="animate-spin" /></Shell>;
  if (!group.data) return <Shell><p className="text-muted-foreground">This group was not found or you can't open it.</p></Shell>;
  const g = group.data;
  const list = questions.data ?? [];

  async function setCompleted(v: boolean) {
    const { error } = await rdb("request_groups").update({ completed: v }).eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function rename() {
    const n = prompt("New group name", g.name)?.trim();
    if (!n) return;
    const { error } = await rdb("request_groups").update({ name: n }).eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function removeQ(q: RequestQuestion) {
    if (!confirm("Delete this question?")) return;
    const { error } = await rdb("request_questions").delete().eq("id", q.id);
    if (error) return toast.error(error.message);
    await deleteQuestionImage(q.image_url).catch(() => {});
    refresh();
  }
  function newDraft() {
    setDraft({
      stem: "", explanation: "", answer_mode: "single", image_url: null, sort_order: list.length + 1,
      options: ["A", "B", "C", "D"].map((l, i) => ({ label: l, text: "", is_correct: false, sort_order: i + 1 })),
    });
  }

  return (
    <Shell>
      <Link to={isRealAdmin && g.owner_id !== user?.id ? "/admin/question-requests" : "/questions"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black text-foreground">{g.name}</h1>
        <button onClick={rename} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
        <span className="text-sm text-muted-foreground">{list.length} questions</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <span className="text-sm font-bold text-foreground">Status:</span>
        {[false, true].map((v) => (
          <button key={String(v)} onClick={() => setCompleted(v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${g.completed === v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
            {v ? "Completed" : "Not completed"}
          </button>
        ))}
        <div className="flex-1" />
        {isRealAdmin && (
          <button onClick={() => setShowCourse(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-sm font-bold text-primary">
            <FolderInput size={15} /> Add to course
          </button>
        )}
        <button onClick={newDraft}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">
          <Plus size={15} /> Add question
        </button>
      </div>

      <div className="space-y-3">
        {list.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex gap-2">
              <span className="font-black text-muted-foreground">{i + 1}.</span>
              <p className="flex-1 whitespace-pre-wrap text-foreground">{q.stem}</p>
              <button onClick={() => setDraft({ ...q })} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
              <button onClick={() => removeQ(q)} className="p-1 text-destructive"><Trash2 size={15} /></button>
            </div>
            {q.image_url && <QuestionImage path={q.image_url} />}
            <ul className="space-y-1 text-sm">
              {q.options.map((o) => (
                <li key={o.id ?? o.label} className={o.is_correct ? "font-bold text-primary" : "text-foreground"}>
                  {o.label}. {o.text}{o.is_correct ? " ✓" : ""}
                </li>
              ))}
            </ul>
            {q.explanation && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.explanation}</p>}
          </div>
        ))}
        {questions.data?.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      </div>

      {draft && (
        <QuestionDialog draft={draft} groupId={g.id} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); refresh(); }} />
      )}
      {showCourse && <AddToCourseDialog group={g} onClose={() => setShowCourse(false)} />}
    </Shell>
  );
}

function QuestionDialog({ draft, groupId, onClose, onSaved }: { draft: Draft; groupId: string; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const originalImage = draft.image_url;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setOpt = (i: number, p: Partial<RequestOption>) =>
    set({ options: d.options.map((o, j) => (j === i ? { ...o, ...p } : d.answer_mode === "single" && p.is_correct ? { ...o, is_correct: false } : o)) });

  async function save() {
    if (!d.stem.trim()) return toast.error("Write the question first.");
    const filled = d.options.filter((o) => o.text.trim());
    if (filled.length < 2) return toast.error("Add at least two options.");
    if (!filled.some((o) => o.is_correct)) return toast.error("Mark the right answer.");
    setBusy(true);
    try {
      await saveRequestQuestion(groupId, { ...d, options: filled.map((o, i) => ({ ...o, label: LETTERS[i] ?? String(i + 1) })) });
      if (originalImage && originalImage !== d.image_url) await deleteQuestionImage(originalImage).catch(() => {});
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-foreground">{d.id ? "Edit question" : "New question"}</h2>
          <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
        </div>
        <textarea value={d.stem} onChange={(e) => set({ stem: e.target.value })} rows={4} placeholder="Question" className={inputCls} />
        <QuestionImagePicker path={d.image_url} prefix="requests/" onChange={(p) => set({ image_url: p })} />
        <div className="flex gap-2">
          {(["single", "multiple"] as const).map((m) => (
            <button key={m} onClick={() => set({ answer_mode: m, options: m === "single" ? d.options.map((o) => ({ ...o, is_correct: false })) : d.options })}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${d.answer_mode === m ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {m === "single" ? "One right answer" : "More than one right answer"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {d.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={d.answer_mode === "single" ? "radio" : "checkbox"} checked={o.is_correct}
                onChange={(e) => setOpt(i, { is_correct: e.target.checked })} title="Right answer" />
              <span className="w-5 text-sm font-bold text-muted-foreground">{LETTERS[i]}</span>
              <input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} className={inputCls} placeholder={`Option ${LETTERS[i]}`} />
              <button onClick={() => set({ options: d.options.filter((_, j) => j !== i) })} className="text-destructive"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => set({ options: [...d.options, { label: LETTERS[d.options.length] ?? "", text: "", is_correct: false, sort_order: d.options.length + 1 }] })}
            className="inline-flex items-center gap-1 text-sm font-bold text-primary"><Plus size={14} /> Add option</button>
        </div>
        <textarea value={d.explanation ?? ""} onChange={(e) => set({ explanation: e.target.value })} rows={3} placeholder="Explanation (optional)" className={inputCls} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddToCourseDialog({ group, onClose }: { group: RequestGroup; onClose: () => void }) {
  const addFn = useServerFn(qrAddToCourse);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (supabase.from as any)("courses").select("id,title").order("title").then(({ data }: any) => {
      setCourses(data ?? []);
      setCourseId(data?.[0]?.id ?? "");
    });
  }, []);
  useEffect(() => {
    if (!courseId) return;
    (supabase.from as any)("subject_groups").select("id,name").eq("course_id", courseId).order("sort_order").then(({ data }: any) => {
      setSections(data ?? []);
      setSectionId(data?.[0]?.id ?? "");
    });
  }, [courseId]);

  async function go() {
    if (!sectionId) return toast.error("Pick a section.");
    setBusy(true);
    try {
      const r = await addFn({ data: { groupId: group.id, sectionId, subjectName: name } });
      toast.success(`Added ${r.saved} questions${r.skipped ? `, ${r.skipped} duplicates skipped` : ""}${r.failed ? `, ${r.failed} failed` : ""}.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add to course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-black text-foreground">Add to a course</h2>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputCls}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subject name" className={inputCls} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground">Cancel</button>
          <button onClick={go} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">{children}</main>
    </div>
  );
}
