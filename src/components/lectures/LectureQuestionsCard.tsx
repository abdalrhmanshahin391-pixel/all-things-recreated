import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, HelpCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Topic = { id: string; title: string };
type LectureQuestion = {
  id: string;
  subject_id: string;
  stem: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  visible: boolean;
  position: number;
};

/** Questions written inside a topic, with a show/hide switch per question. */
export function LectureQuestionsCard({ courseId }: { courseId: string }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [rows, setRows] = useState<LectureQuestion[]>([]);
  const [topicId, setTopicId] = useState("");
  const [stem, setStem] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: subs } = await (supabase.from as any)("lecture_subjects")
      .select("id,title,position")
      .eq("course_id", courseId)
      .order("position");
    const list = ((subs ?? []) as Topic[]);
    setTopics(list);
    if (list.length && !topicId) setTopicId(list[0].id);
    if (!list.length) {
      setRows([]);
      return;
    }
    const { data, error } = await (supabase.from as any)("lecture_questions")
      .select("id,subject_id,stem,options,answer_index,explanation,visible,position")
      .in("subject_id", list.map((t) => t.id))
      .order("position");
    if (error) setErr(error.message);
    else setRows((data as LectureQuestion[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const byTopic = useMemo(() => {
    const m = new Map<string, LectureQuestion[]>();
    rows.forEach((q) => {
      if (!m.has(q.subject_id)) m.set(q.subject_id, []);
      m.get(q.subject_id)!.push(q);
    });
    return m;
  }, [rows]);

  async function add() {
    const cleaned = opts.map((o) => o.trim()).filter(Boolean);
    if (!topicId || !stem.trim() || cleaned.length < 2) {
      setErr("Write the question and at least two choices.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await (supabase.from as any)("lecture_questions").insert({
      subject_id: topicId,
      stem: stem.trim(),
      options: cleaned,
      answer_index: Math.min(answer, cleaned.length - 1),
      explanation: explanation.trim() || null,
      position: (byTopic.get(topicId) ?? []).length,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setStem("");
      setOpts(["", "", "", ""]);
      setAnswer(0);
      setExplanation("");
      load();
    }
  }

  async function toggle(q: LectureQuestion) {
    setRows((prev) => prev.map((r) => (r.id === q.id ? { ...r, visible: !r.visible } : r)));
    const { error } = await (supabase.from as any)("lecture_questions")
      .update({ visible: !q.visible })
      .eq("id", q.id);
    if (error) {
      setErr(error.message);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    const { error } = await (supabase.from as any)("lecture_questions").delete().eq("id", id);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle className="text-primary" size={18} />
        <h2 className="font-semibold text-sm text-foreground">Questions dashboard</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Write questions inside a topic and switch each one on or off. Hidden questions never reach students.
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      {topics.length === 0 ? (
        <div className="text-xs text-muted-foreground">Add a topic first, then questions can live inside it.</div>
      ) : (
        <>
          <div className="rounded-md border border-border bg-background p-4 space-y-3">
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              rows={3}
              placeholder="The question…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="grid md:grid-cols-2 gap-2">
              {opts.map((o, i) => (
                <label key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="lecture-answer"
                    checked={answer === i}
                    onChange={() => setAnswer(i)}
                    className="accent-[var(--primary)]"
                  />
                  <input
                    value={o}
                    onChange={(e) => setOpts((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                    placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
              ))}
            </div>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Explanation (optional)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={add}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add question
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {topics.map((t) => {
              const list = byTopic.get(t.id) ?? [];
              if (!list.length) return null;
              return (
                <div key={t.id}>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    {t.title} · {list.length}
                  </div>
                  <div className="space-y-1.5">
                    {list.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className={`text-sm truncate ${q.visible ? "text-foreground" : "text-muted-foreground line-through"}`}>
                            {q.stem}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            Answer: {q.options?.[q.answer_index] ?? "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggle(q)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            title={q.visible ? "Hide from students" : "Show to students"}
                          >
                            {q.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button
                            onClick={() => remove(q.id)}
                            className="p-1 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
