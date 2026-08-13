import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Target,
  RotateCcw,
  Trophy,
  ArrowRight,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/lectures/$courseId/quiz/$quizId")({
  head: () => ({ meta: [{ title: "Lecture quiz — AquaQBank" }] }),
  component: LectureQuizPage,
});

type Option = { id: string; position: number; body: string; is_correct: boolean };
type Question = {
  id: string;
  position: number;
  prompt: string;
  explanation: string | null;
  options: Option[];
};

function LectureQuizPage() {
  const { courseId, quizId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizTitle, setQuizTitle] = useState<string>("Lecture quiz");
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftExplanation, setDraftExplanation] = useState("");
  const [draftOptions, setDraftOptions] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: quiz } = await (supabase.from as any)("lecture_quizzes")
        .select("id,item_id,lecture_items(title,is_free)")
        .eq("id", quizId)
        .maybeSingle();
      const itemFree = !!quiz?.lecture_items?.is_free;
      if (quiz?.lecture_items?.title) setQuizTitle(quiz.lecture_items.title);

      let allow = itemFree || isAdmin;
      if (!allow && user) {
        const { data: ownsData } = await (supabase.rpc as any)("user_owns_lecture_course", {
          _course_id: courseId,
        });
        allow = !!ownsData;
      }
      if (cancelled) return;
      if (!allow) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);

      let q = (supabase.from as any)("lecture_quiz_questions")
        .select("id,position,prompt,explanation,published,lecture_quiz_options(id,position,body,is_correct)")
        .eq("quiz_id", quizId)
        .order("position");
      if (!isAdmin) q = q.eq("published", true);
      const { data: qs } = await q;
      const list: Question[] = ((qs ?? []) as any[]).map((qq) => ({
        id: qq.id,
        position: qq.position,
        prompt: qq.prompt,
        explanation: qq.explanation,
        options: ((qq.lecture_quiz_options ?? []) as Option[])
          .slice()
          .sort((a, b) => a.position - b.position),
      }));
      if (!cancelled) {
        setQuestions(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, quizId, user, isAdmin]);

  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (!a) {
        unanswered++;
        continue;
      }
      const opt = q.options.find((o) => o.id === a);
      if (opt?.is_correct) correct++;
      else wrong++;
    }
    const total = questions.length;
    const score = total ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, unanswered, total, score };
  }, [questions, answers]);

  useEffect(() => {
    if (!finished || !user) return;
    const payload = {
      user_id: user.id,
      quiz_id: quizId,
      score: stats.correct,
      total: stats.total,
      answers,
    };
    (supabase.from as any)("lecture_quiz_attempts").insert(payload);
  }, [finished]); // eslint-disable-line

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading quiz…
        </div>
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 pt-32 text-center">
          <h1 className="text-2xl font-semibold text-foreground">You don't own this lecture course</h1>
          <p className="text-sm text-muted-foreground mt-2">Subscribe to unlock its quizzes.</p>
          <Link
            to="/lectures/$courseId"
            params={{ courseId }}
            className="mt-6 inline-flex items-center gap-2 text-accent hover:underline text-sm"
          >
            <ArrowLeft size={14} /> Back to course
          </Link>
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="rounded-lg border border-border bg-card p-10">
            <Sparkles className="w-10 h-10 mx-auto text-accent mb-3" />
            <h1 className="text-xl font-semibold text-foreground">No questions yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">This quiz hasn't been filled in yet.</p>
            <Link
              to="/lectures/$courseId"
              params={{ courseId }}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
            >
              Back to course <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 pt-28 pb-20">
          <div className="rounded-lg border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <Trophy className="w-14 h-14 mx-auto text-accent mb-3" />
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Session complete</div>
            <div className="mt-2 text-5xl font-semibold text-foreground">{stats.score}%</div>
            <p className="mt-2 text-muted-foreground text-sm">
              {stats.correct} correct · {stats.wrong} wrong · {stats.unanswered} unanswered
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={() => {
                  setAnswers({});
                  setSubmitted({});
                  setCurrent(0);
                  setFinished(false);
                }}
                className="px-5 py-2.5 rounded-md border border-border text-foreground font-semibold text-sm hover:bg-muted"
              >
                <RotateCcw className="inline w-4 h-4 mr-1" /> Retry
              </button>
              <button
                onClick={() => navigate({ to: "/lectures/$courseId", params: { courseId } })}
                className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
              >
                Back to course
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const q = questions[current];
  const wasSubmitted = !!submitted[q.id];
  const selected = answers[q.id];

  function openEditor() {
    setDraftPrompt(q.prompt);
    setDraftExplanation(q.explanation ?? "");
    setDraftOptions(q.options.map((o) => ({ ...o })));
    setEditing(true);
  }

  async function saveEdits() {
    setSaving(true);
    try {
      const { error: e1 } = await (supabase.from as any)("lecture_quiz_questions")
        .update({ prompt: draftPrompt, explanation: draftExplanation || null })
        .eq("id", q.id);
      if (e1) throw e1;
      for (const o of draftOptions) {
        const { error: e2 } = await (supabase.from as any)("lecture_quiz_options")
          .update({ body: o.body, is_correct: o.is_correct })
          .eq("id", o.id);
        if (e2) throw e2;
      }
      setQuestions((prev) =>
        prev.map((qq) =>
          qq.id === q.id
            ? { ...qq, prompt: draftPrompt, explanation: draftExplanation || null, options: draftOptions }
            : qq,
        ),
      );
      setSubmitted((p) => ({ ...p, [q.id]: false }));
      setAnswers((p) => {
        const { [q.id]: _drop, ...rest } = p;
        return rest;
      });
      toast.success("Question updated");
      setEditing(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion() {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setSaving(true);
    try {
      await (supabase.from as any)("lecture_quiz_options").delete().eq("question_id", q.id);
      const { error } = await (supabase.from as any)("lecture_quiz_questions").delete().eq("id", q.id);
      if (error) throw error;
      const remaining = questions.filter((qq) => qq.id !== q.id);
      setQuestions(remaining);
      if (!remaining.length) {
        setFinished(false);
        setCurrent(0);
      } else {
        setCurrent((c) => Math.min(c, remaining.length - 1));
      }
      toast.success("Question deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 md:px-8 pt-24 pb-16">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/lectures/$courseId"
            params={{ courseId }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to course
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-card px-5 py-4 mb-6 flex items-center justify-between gap-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent bg-accent/10 border border-accent/30 rounded-full px-3 py-1">
              <Target className="w-3 h-3" /> Session mode
            </span>
            <span className="text-sm text-foreground font-semibold truncate">{quizTitle}</span>
          </div>
          <div className="flex-1 max-w-xs mx-4 hidden md:block">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.round(((current + 1) / questions.length) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-sm text-muted-foreground font-semibold tabular-nums">
            Q{current + 1} <span className="text-muted-foreground/60">/ {questions.length}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 md:p-8 shadow-[var(--shadow-card)]">
          {isAdmin && !editing && (
            <div className="flex justify-end gap-2 mb-4 -mt-2">
              <button
                onClick={openEditor}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-muted text-foreground border border-border hover:bg-muted/70"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={deleteQuestion}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/15 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Prompt</label>
                <textarea
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md bg-background border border-border focus:border-accent outline-none p-3 text-sm text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Options</label>
                {draftOptions.map((o, idx) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftOptions((prev) =>
                          prev.map((p) => ({ ...p, is_correct: p.id === o.id })),
                        )
                      }
                      title="Mark as correct"
                      className={`grid place-items-center h-9 w-9 rounded-md border text-xs font-semibold ${
                        o.is_correct
                          ? "bg-accent/15 border-accent text-accent"
                          : "bg-background border-border text-muted-foreground"
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </button>
                    <input
                      value={o.body}
                      onChange={(e) =>
                        setDraftOptions((prev) =>
                          prev.map((p) => (p.id === o.id ? { ...p, body: e.target.value } : p)),
                        )
                      }
                      className="flex-1 rounded-md bg-background border border-border focus:border-accent outline-none px-3 py-2 text-sm text-foreground"
                    />
                    {o.is_correct && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Click the letter to mark the correct answer.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Explanation (optional)
                </label>
                <textarea
                  value={draftExplanation}
                  onChange={(e) => setDraftExplanation(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md bg-background border border-border focus:border-accent outline-none p-3 text-sm text-foreground"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-base md:text-lg font-medium text-foreground whitespace-pre-wrap">{q.prompt}</div>
              <div className="mt-6 space-y-2">
                {q.options.map((o) => {
                  const isPicked = selected === o.id;
                  let stateCls =
                    "border-border hover:border-accent/50 bg-background text-foreground";
                  if (wasSubmitted) {
                    if (o.is_correct)
                      stateCls = "border-emerald-300 bg-emerald-50 text-emerald-900";
                    else if (isPicked && !o.is_correct)
                      stateCls = "border-destructive/40 bg-destructive/5 text-destructive";
                    else stateCls = "border-border bg-muted/40 text-muted-foreground";
                  } else if (isPicked) {
                    stateCls = "border-accent bg-accent/10 text-foreground";
                  }
                  return (
                    <button
                      key={o.id}
                      onClick={() => !wasSubmitted && setAnswers((p) => ({ ...p, [q.id]: o.id }))}
                      disabled={wasSubmitted}
                      className={`w-full text-left px-4 py-3 rounded-md border transition-colors flex items-center gap-3 ${stateCls}`}
                    >
                      <span className="grid place-items-center h-7 w-7 rounded-md bg-muted text-xs font-semibold text-foreground">
                        {String.fromCharCode(65 + o.position)}
                      </span>
                      <span className="flex-1 text-sm">{o.body}</span>
                      {wasSubmitted && o.is_correct && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      {wasSubmitted && isPicked && !o.is_correct && <XCircle className="w-4 h-4 text-destructive" />}
                    </button>
                  );
                })}
              </div>

              {wasSubmitted && q.explanation && (
                <div className="mt-5 rounded-md border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
                  <div className="font-semibold text-accent text-xs uppercase tracking-widest mb-1">Explanation</div>
                  {q.explanation}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="px-5 py-2.5 rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-30 font-semibold text-sm"
          >
            ‹ Previous
          </button>
          {!wasSubmitted ? (
            <button
              onClick={() => selected && setSubmitted((p) => ({ ...p, [q.id]: true }))}
              disabled={!selected}
              className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm disabled:opacity-40"
            >
              Submit answer
            </button>
          ) : current === questions.length - 1 ? (
            <button
              onClick={() => setFinished(true)}
              className="px-6 py-2.5 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-sm"
            >
              Finish quiz
            </button>
          ) : (
            <button
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm"
            >
              Next ›
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
