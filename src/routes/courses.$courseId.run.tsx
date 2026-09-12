import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { ExplanationPanel, type CapturePayload } from "@/components/ExplanationPanel";
import { SaveNoteDialog, type SaveNotePayload } from "@/components/SaveNoteDialog";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedContent } from "@/components/protect/ProtectedContent";
import { ProtectionNotice } from "@/components/protect/ProtectionNotice";
import { AntiAiText } from "@/components/protect/AntiAiText";
import { PwaInstallBanner } from "@/components/protect/PwaInstallBanner";
import { ArabicToggle } from "@/components/quiz/ArabicToggle";
import { useQuestionTranslation } from "@/hooks/useQuestionTranslation";
import {
  Flag,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  Save,
  Sparkles,
  Trophy,
  Target,
  Clock,
  RotateCcw,
  ArrowRight,
} from "lucide-react";

type Mode = "study" | "session" | "exam";
type Pool = "all" | "flagged" | "incorrect";

export const Route = createFileRoute("/courses/$courseId/run")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode === "session" || search.mode === "exam" ? search.mode : "study") as Mode,
    subjects: typeof search.subjects === "string" ? search.subjects : "all",
    timed: Number(search.timed) === 1 ? 1 : 0,
    duration: Math.max(0, Math.min(600, Number(search.duration) || 0)),
    pool: (search.pool === "flagged" || search.pool === "incorrect" ? search.pool : "all") as Pool,
  }),
  head: () => ({
    meta: [
      { title: "Study — AquaQBank" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RunPage,
});

type Option = { id: string; label: string; text: string; is_correct: boolean; sort_order: number };
type Question = {
  id: string;
  subject_id: string;
  stem: string;
  explanation: string | null;
  image_url: string | null;
  answer_mode: "single" | "multiple";
  sort_order?: number;
  options: Option[];
};

type SelectedAnswers = Record<string, string[]>;

function isExactAnswer(q: Question, selected: string[] | undefined) {
  const chosen = new Set(selected ?? []);
  const correct = q.options.filter((option) => option.is_correct).map((option) => option.label);
  return chosen.size === correct.length && correct.every((label) => chosen.has(label));
}

function toggleSelection(current: string[] | undefined, label: string, multiple: boolean) {
  if (!multiple) return [label];
  const next = new Set(current ?? []);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  return [...next];
}

function RunPage() {
  const { courseId } = Route.useParams();
  const { mode, subjects, timed, duration, pool } = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<SelectedAnswers>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const initialSeconds = (timed && duration > 0 ? duration : 60) * 60;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  const [finished, setFinished] = useState(false);
  const [timeSpentOnQuestion, setTimeSpentOnQuestion] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [pendingNote, setPendingNote] = useState<SaveNotePayload | null>(null);
  /** Questions are only readable once enrollment exists, so wait for the gate. */
  const [accessReady, setAccessReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Access gate: paid course requires admin OR an enrollment row.
  // Free ($0) courses auto-enroll on first entry.
  useEffect(() => {
    if (isAdmin) {
      setAccessReady(true);
      return;
    }
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: c } = await (supabase.from as any)("courses")
        .select("price")
        .eq("id", courseId)
        .maybeSingle();
      const price = Number(c?.price ?? 0);
      if (price <= 0) {
        // Free course: enrol first so the content becomes readable, then load.
        await (supabase.from as any)("user_courses").upsert(
          { user_id: user.id, course_id: courseId },
          { onConflict: "user_id,course_id" },
        );
        if (!cancelled) setAccessReady(true);
        return;
      }
      const { data: enr } = await (supabase.from as any)("user_courses")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (!enr) {
        setAccessDenied(true);
        navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
        return;
      }
      setAccessReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, courseId, navigate]);


  useEffect(() => {
    if (!accessReady) return;
    (async () => {
      setLoading(true);
      let subjectIds: string[] = [];
      if (subjects === "all") {
        const { data: g } = await (supabase.from as any)("subject_groups")
          .select("id")
          .eq("course_id", courseId);
        const gIds = (g ?? []).map((r: { id: string }) => r.id);
        if (gIds.length) {
          const { data: s } = await (supabase.from as any)("subjects")
            .select("id")
            .in("group_id", gIds);
          subjectIds = (s ?? []).map((r: { id: string }) => r.id);
        }
      } else {
        subjectIds = subjects.split(",").filter(Boolean);
      }

      if (!subjectIds.length) {
        setQuestions([]);
        setLoading(false);
        return;
      }

      const { data: subjMeta } = await (supabase.from as any)("subjects")
        .select("id,sort_order,ordered")
        .in("id", subjectIds);
      const subjectInfo = new Map<string, { sort: number; ordered: boolean }>(
        ((subjMeta ?? []) as any[]).map((r) => [r.id as string, { sort: Number(r.sort_order) || 0, ordered: Boolean(r.ordered) }]),
      );

      const { data: qs } = await (supabase.from as any)("questions")
        .select(
          "id,subject_id,stem,explanation,image_url,answer_mode,sort_order,question_options(id,label,text,is_correct,sort_order)",
        )
        .in("subject_id", subjectIds)
        .order("sort_order");

      const LETTERS = ["A", "B", "C", "D", "E", "F"];
      const shuffle = <T,>(arr: T[]): T[] => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      let list: Question[] = ((qs ?? []) as any[]).map((q) => {
        const originals: Option[] = (q.question_options ?? [])
          .slice()
          .sort((a: Option, b: Option) => a.sort_order - b.sort_order);
        // Randomize A/B/C/D display order per load, re-letter by position.
        // is_correct stays with the option, so grading is unaffected.
        const isMultiple = q.answer_mode === "multiple";
        const shuffled: Option[] = isMultiple ? originals : shuffle(originals).map((o, i) => ({
          ...o,
          label: LETTERS[i] ?? o.label,
          sort_order: i + 1,
        }));
        return {
          id: q.id,
          subject_id: q.subject_id,
          stem: q.stem,
          explanation: q.explanation,
          image_url: q.image_url ?? null,
          answer_mode: isMultiple ? "multiple" : "single",
          sort_order: Number(q.sort_order) || 0,
          options: shuffled,
        };
      });

      if (user) {
        const { data: flagRows } = await (supabase.from as any)("question_flags")
          .select("question_id")
          .eq("user_id", user.id);
        const flagSet = new Set<string>((flagRows ?? []).map((r: any) => r.question_id));
        setFlags(flagSet);

        if (pool === "flagged") {
          list = list.filter((q) => flagSet.has(q.id));
        } else if (pool === "incorrect") {
          const { data: attemptRows } = await (supabase.from as any)("question_attempts")
            .select("question_id,is_correct,attempted_at")
            .eq("user_id", user.id)
            .order("attempted_at", { ascending: false });
          const latest = new Map<string, boolean>();
          for (const r of (attemptRows ?? []) as any[]) {
            if (!latest.has(r.question_id)) latest.set(r.question_id, r.is_correct);
          }
          list = list.filter((q) => latest.get(q.id) === false);
        }
      }

      // Subjects marked "in order" (cases) stay together as one block, in the
      // exact order their questions were arranged. Everything else is untouched.
      const orderedIds = new Set(
        Array.from(subjectInfo.entries()).filter(([, v]) => v.ordered).map(([id]) => id),
      );
      if (orderedIds.size) {
        const blocks = new Map<string, Question[]>();
        const rest: (Question | { __block: string })[] = [];
        for (const q of list) {
          if (orderedIds.has(q.subject_id)) {
            if (!blocks.has(q.subject_id)) {
              blocks.set(q.subject_id, []);
              rest.push({ __block: q.subject_id });
            }
            blocks.get(q.subject_id)!.push(q);
          } else {
            rest.push(q);
          }
        }
        for (const arr of blocks.values()) {
          arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }
        list = rest.flatMap((item) =>
          "__block" in (item as any) ? blocks.get((item as any).__block)! : [item as Question],
        );
      }

      setQuestions(list);
      setLoading(false);
    })();
  }, [courseId, subjects, pool, user?.id, accessReady]);

  useEffect(() => {
    if (mode !== "study" || !questions.length) return;
    const preset: SelectedAnswers = {};
    for (const q of questions) {
      const right = q.options.filter((o) => o.is_correct).map((o) => o.label);
      if (right.length) preset[q.id] = right;
    }
    setAnswers(preset);
  }, [mode, questions]);

  useEffect(() => {
    if (mode !== "exam" || !timed || finished) return;
    if (secondsLeft <= 0) {
      setFinished(true);
      return;
    }
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, timed, finished, secondsLeft]);

  useEffect(() => {
    if (!finished || !user || mode === "study") return;
    const rows = questions.map((q) => {
       const sel = answers[q.id] ?? [];
      return {
        user_id: user.id,
        question_id: q.id,
         selected_label: sel.join(",") || null,
         selected_labels: sel,
         is_correct: isExactAnswer(q, sel),
        mode,
      };
    });
    if (rows.length) {
      (supabase.from as any)("question_attempts").insert(rows);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    const wrongIds: string[] = [];
    for (const q of questions) {
      const a = answers[q.id];
       if (!a?.length) { unanswered++; continue; }
       if (isExactAnswer(q, a)) correct++;
      else { wrong++; wrongIds.push(q.id); }
    }
    const total = questions.length;
    const score = total ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, unanswered, total, score, wrongIds };
  }, [questions, answers]);

  const wrongQuestions = useMemo(
    () => questions.filter((q) => stats.wrongIds.includes(q.id)),
    [questions, stats.wrongIds],
  );

  async function toggleFlag(questionId: string) {
    if (!user) return;
    const isFlagged = flags.has(questionId);
    const next = new Set(flags);
    if (isFlagged) {
      next.delete(questionId);
      setFlags(next);
      await (supabase.from as any)("question_flags")
        .delete().eq("user_id", user.id).eq("question_id", questionId);
    } else {
      next.add(questionId);
      setFlags(next);
      await (supabase.from as any)("question_flags")
        .insert({ user_id: user.id, question_id: questionId });
    }
  }

  // Reset question timer on question change
  useEffect(() => {
    setTimeSpentOnQuestion(0);
  }, [current]);

  const currentQ = questions[current];
  const isFlaggedCurrent = currentQ ? flags.has(currentQ.id) : false;

  // Track time spent on current active question in study/session mode
  useEffect(() => {
    if (finished || reviewMode || mode === "exam" || !currentQ || submitted[currentQ?.id]) return;
    const interval = setInterval(() => {
      setTimeSpentOnQuestion((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [finished, reviewMode, mode, currentQ?.id, submitted]);

  const isFlagShining =
    timeSpentOnQuestion >= 45 && !isFlaggedCurrent && !submitted[currentQ?.id];

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="medical-card p-10">
            <h1 className="text-xl font-bold">You don't have access to this course yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">Unlock it to start solving questions.</p>
            <Link
              to="/courses/$courseId" params={{ courseId }}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500"
            >
              Back to course <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (loading || !accessReady) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <div className="mx-auto max-w-4xl px-6 pt-28">
          <div className="h-8 w-48 bg-muted rounded-lg animate-pulse mb-6" />
          <div className="h-96 bg-muted rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="medical-card p-10">
            <Sparkles className="w-10 h-10 mx-auto text-indigo-500 mb-3" />
            <h1 className="text-xl font-bold">Nothing to study here yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {pool === "flagged"
                ? "You have no flagged questions in these subjects yet."
                : pool === "incorrect"
                  ? "No previously incorrect questions in these subjects."
                  : "No questions in the selected subjects yet."}
            </p>
            <Link
              to="/courses/$courseId" params={{ courseId }}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500"
            >
              Back to course <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const goToCourse = () => navigate({ to: "/courses/$courseId", params: { courseId } });

  async function setCorrectOption(questionId: string, optionId: string) {
    const q = questions.find((x) => x.id === questionId);
    if (!q) return;
    const target = q.options.find((option) => option.id === optionId);
    if (!target) return;
    if (q.answer_mode === "single") {
      await (supabase.from as any)("question_options").update({ is_correct: false }).eq("question_id", questionId);
    }
    await (supabase.from as any)("question_options").update({ is_correct: !target.is_correct }).eq("id", optionId);
    setQuestions((prev) =>
      prev.map((qq) =>
        qq.id === questionId
           ? { ...qq, options: qq.options.map((o) => ({
               ...o,
               is_correct: q.answer_mode === "single" ? o.id === optionId : o.id === optionId ? !o.is_correct : o.is_correct,
             })) }
          : qq,
      ),
    );
    if (mode === "study") {
      const nextOptions = q.options.map((o) => ({
        ...o,
        is_correct: q.answer_mode === "single" ? o.id === optionId : o.id === optionId ? !o.is_correct : o.is_correct,
      }));
      setAnswers((p) => ({ ...p, [questionId]: nextOptions.filter((o) => o.is_correct).map((o) => o.label) }));
    }
  }

  async function deleteQuestion(questionId: string) {
    if (!confirm("Delete this question for everyone?")) return;
    await (supabase.from as any)("question_options").delete().eq("question_id", questionId);
    await (supabase.from as any)("questions").delete().eq("id", questionId);
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    setCurrent((c) => Math.max(0, Math.min(c, questions.length - 2)));
  }

  if (finished && !reviewMode) {
    return (
      <ResultsScreen
        stats={stats}
        mode={mode}
        onReview={() => {
          if (!wrongQuestions.length) return;
          setReviewMode(true);
          setReviewIndex(0);
        }}
        onBack={goToCourse}
        hasWrong={wrongQuestions.length > 0}
      />
    );
  }

  if (reviewMode) {
    if (!wrongQuestions.length) { goToCourse(); return null; }
    const q = wrongQuestions[reviewIndex];
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-4xl px-4 md:px-8 pt-24 pb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full">
              <Pencil className="w-3 h-3" /> Reviewing wrong answers
            </div>
            <div className="text-sm text-muted-foreground font-semibold">
              {reviewIndex + 1} <span className="text-muted-foreground">/ {wrongQuestions.length}</span>
            </div>
          </div>
          <ProtectionNotice className="mb-4" />
          <PwaInstallBanner className="mb-6" />
          <ProtectedContent context="exam" scope="card">
            <ReviewCard q={q} userAnswer={answers[q.id]} />
          </ProtectedContent>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button onClick={() => setReviewIndex((i) => Math.max(0, i - 1))} disabled={reviewIndex === 0}
              className="px-5 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 font-semibold text-sm">
              ‹ Previous
            </button>
            <button onClick={goToCourse}
              className="px-5 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-sm">
              Done
            </button>
            <button onClick={() => setReviewIndex((i) => Math.min(wrongQuestions.length - 1, i + 1))}
              disabled={reviewIndex === wrongQuestions.length - 1}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-40">
              Next ›
            </button>
          </div>
        </main>
      </div>
    );
  }

  const timeLow = timed && secondsLeft <= initialSeconds * 0.1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-7xl px-4 md:px-8 pt-24 pb-16">
        {/* Top bar */}
        <div className="medical-card px-5 py-4 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
              <Sparkles className="w-3 h-3" />
              {mode === "study" ? "Study mode" : mode === "session" ? "Session mode" : "Exam mode"}
            </span>
            {pool !== "all" && (
              <span className="text-xs font-semibold text-rose-600">
                · {pool === "flagged" ? "Flagged only" : "Incorrect only"}
              </span>
            )}
          </div>

          {mode !== "exam" && (
            <div className="flex-1 max-w-md mx-4 hidden md:block">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.round(((current + 1) / questions.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {mode === "exam" && timed === 1 && (
              <div className={`px-3 py-1.5 rounded-md font-mono text-sm flex items-center gap-2 border ${
                timeLow ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-indigo-50 border-indigo-200 text-indigo-700"
              }`}>
                <Clock className="w-4 h-4" /> {fmtTime(secondsLeft)}
              </div>
            )}
            <div className="text-sm text-muted-foreground font-semibold tabular-nums">
              Q{current + 1} <span className="text-muted-foreground">/ {questions.length}</span>
            </div>
        </div>

        <ProtectionNotice className="mb-4" />
        <PwaInstallBanner className="mb-6" />

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div>
            {mode === "exam" ? (
              <div className="space-y-6">
                {questions.map((q, i) => (
                  <ExamCard
                    key={q.id} q={q} index={i}
                    selected={answers[q.id]}
                     onSelect={(opt) => setAnswers((p) => ({ ...p, [q.id]: toggleSelection(p[q.id], opt, q.answer_mode === "multiple") }))}
                    isFlagged={flags.has(q.id)}
                    onToggleFlag={() => toggleFlag(q.id)}
                  />
                ))}
                <button onClick={() => setFinished(true)}
                  className="magnetic-cta w-full py-3.5 rounded-xl text-white font-bold">
                  Submit exam ({questions.filter((q) => answers[q.id]?.length).length}/{questions.length} answered)
                </button>
              </div>
            ) : (
              currentQ && (
              <QuestionCard
                q={currentQ} mode={mode} isAdmin={isAdmin}
                selected={answers[currentQ.id]}
                submitted={submitted[currentQ.id] || mode === "study"}
                isFlagged={flags.has(currentQ.id)}
                isShining={isFlagShining}
                onToggleFlag={() => toggleFlag(currentQ.id)}
                 onSelect={(opt) => setAnswers((p) => ({ ...p, [currentQ.id]: toggleSelection(p[currentQ.id], opt, currentQ.answer_mode === "multiple") }))}
                onSubmit={() => setSubmitted((p) => ({ ...p, [currentQ.id]: true }))}
                onNext={() => {
                  if (current === questions.length - 1) setFinished(true);
                  else setCurrent((c) => c + 1);
                }}
                isLast={current === questions.length - 1}
                onSetCorrect={(optionId) => setCorrectOption(currentQ.id, optionId)}
                onDelete={() => deleteQuestion(currentQ.id)}
                onCapture={(cap: CapturePayload) =>
                  setPendingNote({
                    courseId,
                    subjectId: currentQ.subject_id,
                    questionId: currentQ.id,
                    snippetHtml: cap.snippetHtml,
                    snippetText: cap.snippetText,
                  })
                }
              />
              )
            )}
          </div>

          <aside className="lg:sticky lg:top-24 self-start">
            <div className="medical-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border font-bold text-sm text-foreground">
                Question map
              </div>
              <div className="p-3 grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                   const answered = !!answers[q.id]?.length;
                  const isCurrent = i === current && mode !== "exam";
                  const wasSubmitted = !!submitted[q.id] || mode === "study";
                   const right = wasSubmitted && answered && isExactAnswer(q, answers[q.id]);
                   const wrong = wasSubmitted && answered && !right;
                  const flagged = flags.has(q.id);
                  return (
                    <button
                      key={q.id}
                      onClick={() => mode !== "exam" && setCurrent(i)}
                      className={`relative h-9 rounded-lg text-xs font-bold border transition-colors ${
                        isCurrent
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : right
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : wrong
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : flagged
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : answered
                                  ? "bg-muted text-foreground border-border"
                                  : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {i + 1}
                      {flagged && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-card" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-3 border-t border-border space-y-2">
                <button
                  onClick={() => setFinished(true)}
                  className="magnetic-cta w-full py-2.5 rounded-xl text-white font-bold text-sm"
                >
                  <span className="relative z-10">
                    Finish {mode === "study" ? "Study" : mode === "session" ? "Session" : "Exam"}
                  </span>
                </button>
                <button
                  onClick={goToCourse}
                  className="w-full py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted font-semibold text-sm"
                >
                  End & exit
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
      {user && (
        <SaveNoteDialog
          open={!!pendingNote}
          payload={pendingNote}
          userId={user.id}
          onClose={() => setPendingNote(null)}
          onSaved={() => setPendingNote(null)}
        />
      )}
    </div>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function QuestionCard({
  q, mode, isAdmin, selected, submitted, isFlagged, isShining = false,
  onToggleFlag, onSelect, onSubmit, onNext, isLast, onSetCorrect, onDelete, onCapture,
}: {
  q: Question; mode: Mode; isAdmin: boolean;
  selected: string[] | undefined; submitted: boolean; isFlagged: boolean; isShining?: boolean;
  onToggleFlag: () => void; onSelect: (label: string) => void;
  onSubmit: () => void; onNext: () => void; isLast: boolean;
  onSetCorrect: (optionId: string) => void; onDelete: () => void;
  onCapture: (cap: CapturePayload) => void;
}) {
  const isStudy = mode === "study";
  const [ar, setAr] = useState(false);
  const { data: tr, loading: trLoading, error: trError } = useQuestionTranslation(q.id, ar);
  const show = ar && tr ? tr : null;

  return (
    <div className="medical-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="relative inline-flex items-center gap-2">
          <button
            onClick={onToggleFlag}
            className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-all duration-300 ${
              isFlagged
                ? "border-amber-200 bg-amber-50 text-amber-700 font-bold"
                : isShining
                  ? "border-amber-400 bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400 ring-offset-1 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.6)] font-bold scale-105"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Flag
              className={`w-3.5 h-3.5 transition-transform ${
                isFlagged
                  ? "fill-amber-400 text-amber-600"
                  : isShining
                    ? "text-amber-600 fill-amber-300 animate-bounce"
                    : ""
              }`}
            />
            {isFlagged ? "Flagged" : "Flag question"}
          </button>
          {isShining && !isFlagged && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-100/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded-full animate-pulse shadow-sm whitespace-nowrap">
              <Sparkles className="w-3 h-3 text-amber-500" />
              {show ? "سؤال يستغرق وقتاً؟ اضغط 🚩 لتعليمه" : "Taking long? Flag 🚩 to revisit"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ArabicToggle on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
          {isAdmin && isStudy && (
            <button
              onClick={onDelete}
              className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete question
            </button>
          )}
        </div>
      </div>
      <ProtectedContent context="quiz" scope="card">
      {q.image_url && <div className="px-6 pt-6"><QuestionImage path={q.image_url} /></div>}
      {(q.stem?.trim() || !q.image_url) && (
        <div
          dir={show ? "rtl" : undefined}
          className="px-6 py-6 text-lg leading-relaxed text-foreground font-medium"
        >
          <AntiAiText
            text={show ? show.stem : q.stem}
            dir={show ? "rtl" : "ltr"}
            fontSize={18}
            lineHeight={28}
            fontWeight={600}
          />
        </div>
      )}
      {q.answer_mode === "multiple" && (
        <div className="mx-6 mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          More than one answer — select all that apply.
        </div>
      )}
      <div className="px-6 pb-6 space-y-3">
        {q.options.map((o) => {
          const isSelected = selected?.includes(o.label) ?? false;
          const showAnswers = submitted;
          const isRight = showAnswers && o.is_correct;
          const isWrong = showAnswers && isSelected && !o.is_correct;
          const lockedInStudy = isStudy;
          return (
            <div key={o.id} className="flex items-stretch gap-2">
              <button
                disabled={(submitted && mode !== "study") || lockedInStudy}
                onClick={() => !lockedInStudy && onSelect(o.label)}
                className={`flex-1 text-left flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all ${
                  isRight
                    ? "border-emerald-300 bg-emerald-50"
                    : isWrong
                      ? "border-rose-300 bg-rose-50"
                      : isSelected
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-border bg-card hover:border-indigo-300 hover:-translate-y-0.5"
                } ${lockedInStudy && !isRight ? "opacity-70 cursor-default" : ""}`}
              >
                <span
                  className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold border shrink-0 ${
                    isRight
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : isWrong
                        ? "bg-rose-500 text-white border-rose-500"
                        : isSelected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {o.label}
                </span>
                <span dir={show ? "rtl" : undefined} className="flex-1 text-foreground">
                  {(show ? (show.options[o.id] ?? o.text) : o.text) || ""}
                </span>
                {isRight && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {isWrong && <XCircle className="w-5 h-5 text-rose-600" />}
              </button>
               {isAdmin && isStudy && (q.answer_mode === "multiple" || !o.is_correct) && (
                <button
                  onClick={() => onSetCorrect(o.id)}
                   title={o.is_correct ? "Remove from correct answers" : "Mark as a correct answer"}
                  className="px-3 rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-bold inline-flex items-center gap-1"
                >
                   <Save className="w-3.5 h-3.5" /> {o.is_correct ? "Unset" : "Set correct"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      </ProtectedContent>

      {submitted && (show?.explanation || q.explanation) && (
        <div dir={show?.explanation ? "rtl" : undefined}>
          <ExplanationPanel explanation={(show?.explanation ?? q.explanation) as string} onCapture={onCapture} />
        </div>
      )}

      <div className="px-6 pb-6">
        {mode === "session" && !submitted ? (
          <button
             disabled={!selected?.length}
            onClick={onSubmit}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-muted disabled:text-muted-foreground text-white font-bold transition-colors"
          >
            Submit answer
          </button>
        ) : (
          <button
            onClick={onNext}
            className={`w-full py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 ${
              isLast
                ? "magnetic-cta text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              {isLast ? "Finish & see results" : "Next question"}
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function ExamCard({
  q, index, selected, onSelect, isFlagged, onToggleFlag,
}: {
   q: Question; index: number; selected: string[] | undefined;
  onSelect: (label: string) => void; isFlagged: boolean; onToggleFlag: () => void;
}) {
  const [ar, setAr] = useState(false);
  const { data: tr, loading: trLoading, error: trError } = useQuestionTranslation(q.id, ar);
  const show = ar && tr ? tr : null;
  return (
    <div className="medical-card grid grid-cols-1 md:grid-cols-[180px_1fr] overflow-hidden">
      <div className="px-5 py-5 border-b md:border-b-0 md:border-r border-border bg-muted">
        <div className="font-bold text-foreground">Question {index + 1}</div>
         <div className="text-xs text-muted-foreground mt-1">{selected?.length ? "Answered" : "Not yet answered"}</div>
        <button
          onClick={onToggleFlag}
          className={`mt-3 text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
            isFlagged
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flag className={`w-3.5 h-3.5 ${isFlagged ? "fill-amber-400" : ""}`} />
          {isFlagged ? "Flagged" : "Flag question"}
        </button>
        <ArabicToggle className="mt-3" on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
      </div>
      <ProtectedContent context="exam" scope="card">
      <div className="px-5 py-5">
        {q.image_url && <div className="mb-4"><QuestionImage path={q.image_url} /></div>}
        {(q.stem?.trim() || !q.image_url) && (
          <div dir={show ? "rtl" : undefined} className="text-base leading-relaxed mb-4 text-foreground">
            <AntiAiText
              text={show ? show.stem : q.stem}
              dir={show ? "rtl" : "ltr"}
              fontSize={16}
              lineHeight={26}
              fontWeight={600}
            />
          </div>
        )}
         <div className="text-xs italic text-muted-foreground mb-3">
           {q.answer_mode === "multiple" ? "More than one answer — select all that apply:" : "Select one:"}
         </div>
        <div className="space-y-2">
          {q.options.map((o) => (
            <label
              key={o.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                 selected?.includes(o.label)
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-border hover:bg-muted"
              }`}
            >
              <input
                 type={q.answer_mode === "multiple" ? "checkbox" : "radio"} name={q.id} checked={selected?.includes(o.label) ?? false}
                onChange={() => onSelect(o.label)}
                className="accent-indigo-600"
              />
              <span className="font-semibold text-sm w-5 text-muted-foreground">{o.label.toLowerCase()}.</span>
              <span dir={show ? "rtl" : undefined} className="text-sm text-foreground">
                {(show ? (show.options[o.id] ?? o.text) : o.text) || ""}
              </span>
            </label>
          ))}
        </div>
      </div>
      </ProtectedContent>
    </div>
  );
}

function ReviewCard({ q, userAnswer }: { q: Question; userAnswer: string[] | undefined }) {
  const [ar, setAr] = useState(false);
  const { data: tr, loading: trLoading, error: trError } = useQuestionTranslation(q.id, ar);
  const show = ar && tr ? tr : null;
  return (
    <div className="medical-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Pencil className="w-4 h-4 text-rose-500" />
          <span className="text-xs uppercase tracking-widest font-bold text-rose-600">Wrong answer</span>
        </span>
        <ArabicToggle on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
      </div>
      {q.image_url && <div className="px-6 pt-6"><QuestionImage path={q.image_url} /></div>}
      {(q.stem?.trim() || !q.image_url) && (
        <div dir={show ? "rtl" : undefined} className="px-6 py-6 text-base leading-relaxed text-foreground">
          <AntiAiText
            text={show ? show.stem : q.stem}
            dir={show ? "rtl" : "ltr"}
            fontSize={16}
            lineHeight={26}
            fontWeight={600}
          />
        </div>
      )}
      <div className="px-6 pb-6 space-y-3">
        {q.options.map((o) => {
           const isUser = userAnswer?.includes(o.label) ?? false;
          const isRight = o.is_correct;
          return (
            <div
              key={o.id}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border ${
                isRight
                  ? "border-emerald-300 bg-emerald-50"
                  : isUser
                    ? "border-rose-300 bg-rose-50"
                    : "border-border bg-card"
              }`}
            >
              <span
                className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold border shrink-0 ${
                  isRight
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : isUser
                      ? "bg-rose-500 text-white border-rose-500"
                      : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {o.label}
              </span>
              <span dir={show ? "rtl" : undefined} className="flex-1 text-foreground">
                {(show ? (show.options[o.id] ?? o.text) : o.text) || ""}
              </span>
              {isRight && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" /> Correct
                </span>
              )}
              {isUser && !isRight && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                  <XCircle className="w-4 h-4" /> Your answer
                </span>
              )}
            </div>
          );
        })}
      </div>
      {(show?.explanation || q.explanation) && (
        <div dir={show?.explanation ? "rtl" : undefined}>
          <ExplanationPanel explanation={(show?.explanation ?? q.explanation) as string} onCapture={() => {}} />
        </div>
      )}
    </div>
  );
}

function ResultsScreen({
  stats, mode, onReview, onBack, hasWrong,
}: {
  stats: { correct: number; wrong: number; unanswered: number; total: number; score: number };
  mode: Mode; onReview: () => void; onBack: () => void; hasWrong: boolean;
}) {
  const pass = stats.score >= 60;
  return (
    <div className="min-h-screen aurora-bg-soft text-foreground relative overflow-hidden">
      <SiteHeader variant="light" />
      <main className="relative mx-auto max-w-4xl px-6 pt-28 pb-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-200 bg-card text-indigo-700 text-xs font-bold uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            {mode === "exam" ? "Exam Complete" : mode === "session" ? "Session Complete" : "Study Complete"}
          </div>
          <h1 className="mt-6 text-5xl md:text-6xl font-black tracking-tight">
            {pass ? (
              <>Great <span className="text-foreground">work!</span></>
            ) : (
              <>Keep <span className="text-foreground">going!</span></>
            )}
          </h1>
          <p className="mt-3 text-muted-foreground">Here's how you did.</p>
        </div>

        <div className="flex justify-center mb-10">
          <ScoreRing value={stats.score} pass={pass} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatTile icon={<Target className="w-4 h-4" />} label="Total" value={stats.total} tone="neutral" />
          <StatTile icon={<CheckCircle2 className="w-4 h-4" />} label="Correct" value={stats.correct} tone="good" />
          <StatTile icon={<XCircle className="w-4 h-4" />} label="Wrong" value={stats.wrong} tone="bad" />
          <StatTile icon={<Clock className="w-4 h-4" />} label="Unanswered" value={stats.unanswered} tone="warn" />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {hasWrong && (
            <button
              onClick={onReview}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 font-bold"
            >
              <RotateCcw className="w-4 h-4" /> Review wrong answers
            </button>
          )}
          <button
            onClick={onBack}
            className="magnetic-cta inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold"
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Back to subjects
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}

function ScoreRing({ value, pass }: { value: number; pass: boolean }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative w-48 h-48">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={r} className="stroke-border" strokeWidth="14" fill="none" />
        <circle
          cx="100" cy="100" r={r}
          stroke={pass ? "url(#ringGood)" : "url(#ringBad)"}
          strokeWidth="14" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <defs>
          <linearGradient id="ringGood" x1="0" x2="1">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="ringBad" x1="0" x2="1">
            <stop offset="0" stopColor="#FF5C8A" />
            <stop offset="1" stopColor="#FF8A3D" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-5xl font-black tracking-tight text-foreground">{value}%</div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-bold">Score</div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: number;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const colors =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "bad"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-border bg-card text-muted-foreground";
  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold opacity-90">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-black text-foreground">{value}</div>
    </div>
  );
}
