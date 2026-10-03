import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Lock, Medal, Trophy, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { useAuth } from "@/hooks/useAuth";
import {
  getChallengeResultsServerFn,
  getChallengeStatusServerFn,
  nextChallengeQuestionServerFn,
  submitChallengeAnswerServerFn,
} from "@/lib/challenge.functions";
import { formatDuration, type ChallengeQuestion, type ChallengeResults, type ChallengeState } from "@/lib/challenge";

export const Route = createFileRoute("/courses/$courseId/challenge")({
  head: () => ({
    meta: [{ title: "Challenge — AquaQBank" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ChallengePage,
});

type Phase = "loading" | "playing" | "results" | "unavailable";

function ChallengePage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const statusFn = useServerFn(getChallengeStatusServerFn);
  const nextFn = useServerFn(nextChallengeQuestionServerFn);
  const submitFn = useServerFn(submitChallengeAnswerServerFn);
  const resultsFn = useServerFn(getChallengeResultsServerFn);

  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<ChallengeState>("off");
  const [question, setQuestion] = useState<ChallengeQuestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(0);
  const [leftMs, setLeftMs] = useState(0);
  const [limitMs, setLimitMs] = useState(30000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChallengeResults | null>(null);
  const autoSubmitted = useRef<string | null>(null);

  const loadResults = useCallback(async () => {
    try {
      setResults(await resultsFn({ data: { courseId } }));
      setPhase("results");
    } catch (e: any) {
      setError(e?.message || "Could not load the results.");
      setPhase("unavailable");
    }
  }, [courseId, resultsFn]);

  const loadNext = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await nextFn({ data: { courseId } });
      if (res.done) {
        await loadResults();
        return;
      }
      setQuestion(res.question);
      setSelected([]);
      setDeadline(Date.now() + res.question.remainingMs);
      setPhase("playing");
    } catch (e: any) {
      setError(e?.message || "Could not load the next question.");
    } finally {
      setBusy(false);
    }
  }, [courseId, nextFn, loadResults]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      try {
        const s = await statusFn({ data: { courseId } });
        setState(s.state);
        setLimitMs(s.secondsPerQuestion * 1000);
        if (s.state === "active") await loadNext();
        else if (s.state === "finished") await loadResults();
        else setPhase("unavailable");
      } catch (e: any) {
        setError(e?.message || "Could not open the challenge.");
        setPhase("unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, courseId]);

  const submit = useCallback(
    async (optionIds: string[]) => {
      if (!question || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await submitFn({ data: { courseId, questionId: question.id, optionIds } });
        if (res.finished) await loadResults();
        else {
          setBusy(false);
          await loadNext();
        }
      } catch (e: any) {
        setError(e?.message || "Could not save your answer.");
        setBusy(false);
      }
    },
    [question, busy, submitFn, courseId, loadResults, loadNext],
  );

  // Countdown. When it reaches zero the question is sent as unanswered (the server enforces the real time).
  useEffect(() => {
    if (phase !== "playing" || !question) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setLeftMs(left);
      if (left === 0 && autoSubmitted.current !== question.id) {
        autoSubmitted.current = question.id;
        void submit([]);
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [phase, question, deadline, submit]);

  function toggle(optionId: string) {
    if (!question || busy) return;
    setSelected((cur) =>
      question.answer_mode === "multiple" ? (cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId]) : [optionId],
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16">{children}</main>
    </div>
  );

  if (phase === "loading") {
    return shell(
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>,
    );
  }

  if (phase === "unavailable") {
    return shell(
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
        <Lock className="mx-auto text-muted-foreground" />
        <p className="font-semibold">
          {state === "declined"
            ? "You chose to ignore this challenge, so it is no longer available to you. · اخترت تجاهل هذا التحدي، لذلك لم يعد متاحًا لك."
            : error || "There is no open challenge for this course. · لا يوجد تحدٍّ مفتوح لهذا الكورس."}
        </p>
        <Link to="/courses/$courseId" params={{ courseId }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft size={14} /> Back to the course · العودة إلى الكورس
        </Link>
      </div>,
    );
  }

  if (phase === "playing" && question) {
    const pct = Math.max(0, Math.min(100, (leftMs / limitMs) * 100));
    const seconds = Math.ceil(leftMs / 1000);
    return shell(
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold flex items-center gap-2"><Trophy size={16} className="text-amber-600" /> Challenge · التحدي</span>
          <span className="text-muted-foreground tabular-nums">
            {question.index} / {question.total}
          </span>
        </div>

        <div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-[width] duration-200 ${pct < 25 ? "bg-destructive" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-xs font-bold tabular-nums text-muted-foreground">
            <Clock size={12} /> {seconds}s
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="whitespace-pre-wrap font-semibold leading-relaxed">{question.stem}</p>
          {question.image_url && <QuestionImage path={question.image_url} />}
          {question.answer_mode === "multiple" && (
            <p className="text-xs font-semibold text-amber-700">Select all that apply · اختر كل الإجابات الصحيحة</p>
          )}
          <div className="space-y-2">
            {question.options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(o.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-sm flex gap-3 items-start transition-colors ${
                    on ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                  } disabled:opacity-70`}
                >
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs font-bold ${on ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                    {o.label}
                  </span>
                  <span className="leading-relaxed">{o.text}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-muted-foreground">Answers are revealed after you finish · تظهر الإجابات بعد الانتهاء</span>
            <button
              onClick={() => void submit(selected)}
              disabled={busy || selected.length === 0}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Lock answer · تثبيت الإجابة
            </button>
          </div>
        </div>
      </div>,
    );
  }

  if (phase === "results" && results) {
    const { me, leaderboard, review, maxScore } = results;
    const tile = (label: string, value: string) => (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      </div>
    );
    return shell(
      <div className="space-y-8">
        <div className="text-center space-y-1">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600"><Trophy size={28} /></div>
          <h1 className="text-2xl font-black">Challenge finished · انتهى التحدي</h1>
          <p className="text-sm text-muted-foreground">{me.displayName}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tile("Rank · الترتيب", `#${me.rank}`)}
          {tile("Score · النقاط", `${me.score} / ${maxScore}`)}
          {tile("Correct · الصحيحة", `${me.correct} / ${me.total}`)}
          {tile("Time · الوقت", formatDuration(me.timeMs))}
        </div>

        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Medal size={16} className="text-amber-600" /> Leaderboard · لوحة الترتيب</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Name</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2 text-right">Correct</th><th className="px-4 py-2 text-right">Time</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((r) => (
                  <tr key={r.rank} className={r.isMe ? "bg-primary/10 font-bold" : ""}>
                    <td className="px-4 py-2 tabular-nums">{r.rank}</td>
                    <td className="px-4 py-2">{r.displayName}{r.isMe && " (you · أنت)"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.score}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.correct}/{r.total}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatDuration(r.timeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ranked by points, then correct answers, then total time. · الترتيب حسب النقاط ثم الإجابات الصحيحة ثم الوقت الكلي.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold">Review · المراجعة</h2>
          {review.map((r, i) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs font-bold">
                <span className="text-muted-foreground">Question {i + 1}</span>
                <span className={`inline-flex items-center gap-1 ${r.isCorrect ? "text-emerald-600" : "text-destructive"}`}>
                  {r.isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {r.timedOut ? "Time ran out · انتهى الوقت" : r.isCorrect ? "Correct · صحيح" : "Wrong · خطأ"} · {r.points} pts · {(r.elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
              <p className="whitespace-pre-wrap font-semibold leading-relaxed">{r.stem}</p>
              {r.image_url && <QuestionImage path={r.image_url} />}
              <div className="space-y-1.5">
                {r.options.map((o) => {
                  const mine = r.selectedOptionIds.includes(o.id);
                  return (
                    <div
                      key={o.id}
                      className={`rounded-lg border px-3 py-2 text-sm flex gap-2 ${
                        o.is_correct ? "border-emerald-500/60 bg-emerald-500/10" : mine ? "border-destructive/60 bg-destructive/10" : "border-border"
                      }`}
                    >
                      <b>{o.label}.</b> <span>{o.text}</span>
                      {mine && <span className="ml-auto shrink-0 text-xs font-bold">your answer · إجابتك</span>}
                    </div>
                  );
                })}
              </div>
              {r.explanation && (
                <div className="rounded-xl bg-muted/40 p-4 text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-bold [&_p]:my-1.5 [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.explanation}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="text-center">
          <Link to="/courses/$courseId" params={{ courseId }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <ArrowLeft size={14} /> Back to the course · العودة إلى الكورس
          </Link>
        </div>
      </div>,
    );
  }

  return null;
}
