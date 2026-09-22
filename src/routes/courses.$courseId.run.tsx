import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { ExplanationPanel, type CapturePayload } from "@/components/ExplanationPanel";
import { SaveNoteDialog, type SaveNotePayload } from "@/components/SaveNoteDialog";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedContent } from "@/components/protect/ProtectedContent";
import { ProtectionNotice } from "@/components/protect/ProtectionNotice";
import { ArabicToggle } from "@/components/quiz/ArabicToggle";
import { useQuestionTranslation } from "@/hooks/useQuestionTranslation";
import { useServerFn } from "@tanstack/react-start";
import { EditQuestionDialog, type EditableQuestion } from "@/components/admin/QuestionListEditor";
import { AMG_MODELS, amgResolveCourseQuestion, amgUpdateCourseQuestion } from "@/lib/aqua-mcq-gen.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoveQuestionControl, type CourseSectionGroup } from "@/components/course/MoveQuestionControl";
import { moveSingleCourseQuestion } from "@/lib/course-sorter.functions";
import { ReportQuestionModal } from "@/components/ReportQuestionModal";
import { loadCourseRunQuestionsServerFn } from "@/lib/course-enrollment.functions";
import { ensureFreeEnrollment } from "@/lib/course-access";
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
const LOAD_TIMEOUT_MS = 20_000;

export const Route = createFileRoute("/courses/$courseId/run")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode === "session" || search.mode === "exam" ? search.mode : "study") as Mode,
    subjects: typeof search.subjects === "string" ? search.subjects : "all",
    timed: Number(search.timed) === 1 ? 1 : 0,
    duration: Math.max(0, Math.min(600, Number(search.duration) || 0)),
    pool: (search.pool === "flagged" || search.pool === "incorrect" ? search.pool : "all") as Pool,
    t: Number(search.t) || undefined,
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
  const { mode, subjects, timed, duration, pool, t } = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin, user, loading: authLoading } = useAuth();
  const accessKey = `${courseId}:${user?.id ?? "guest"}:${isAdmin ? "admin" : "student"}:${t ?? 0}`;

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
  /** Wait for the course access check before requesting protected content. */
  const [accessReady, setAccessReady] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const hasAccess = accessReady === accessKey;
  const [courseSections, setCourseSections] = useState<CourseSectionGroup[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [adminEditing, setAdminEditing] = useState<Question | null>(null);
  const [resolveQuestion, setResolveQuestion] = useState<Question | null>(null);
  const [resolveProvider, setResolveProvider] = useState<"google" | "openai">("google");
  const [resolveModel, setResolveModel] = useState<string>(AMG_MODELS.google[0].id);
  const [resolving, setResolving] = useState(false);
  const resolveCourseQuestion = useServerFn(amgResolveCourseQuestion);
  const updateCourseQuestion = useServerFn(amgUpdateCourseQuestion);
  const sessionKey = `aqua-quiz:${user?.id ?? "guest"}:${courseId}:${mode}:${subjects}:${pool}:${timed}:${duration}`;

  // Access gate: paid course requires admin OR an enrollment row.
  // Free ($0) courses auto-enroll on first entry.
  useEffect(() => {
    setAccessReady(null);
    setAccessDenied(null);
    setLoadError(null);
    if (authLoading) return;
    if (isAdmin) {
      setAccessReady(accessKey);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    (async () => {
      const { data: c, error: courseError } = await (supabase.from as any)("courses")
        .select("price")
        .eq("id", courseId)
        .maybeSingle()
        .abortSignal(controller.signal);
      if (courseError) throw courseError;
      if (!c) throw new Error("Course not found");
      const price = Number(c?.price ?? 0);
      if (price <= 0) {
        if (user) {
          await ensureFreeEnrollment(user.id, courseId, "questions");
        }
        if (!cancelled) setAccessReady(accessKey);
        return;
      }

      // If course is paid and user is not logged in:
      if (!user) {
        let subjectIds: string[] = subjects === "all" ? [] : subjects.split(",").filter(Boolean);
        if (subjectIds.length) {
          const { data: subs } = await (supabase.from as any)("subjects")
            .select("access_level")
            .in("id", subjectIds);
          const allPublic = (subs ?? []).length > 0 && (subs ?? []).every((s: any) => s.access_level === "free_public");
          if (allPublic) {
            if (!cancelled) setAccessReady(accessKey);
            return;
          }
        }
        setAccessDenied(accessKey);
        navigate({ to: "/login" });
        return;
      }

      // User is logged in for paid course:
      const { data: enr, error: enrollmentError } = await (supabase.from as any)("user_courses")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle()
        .abortSignal(controller.signal);
      if (enrollmentError) throw enrollmentError;
      if (cancelled) return;
      if (!enr) {
        // Check active package purchase
        const { data: purchases } = await (supabase.from as any)("package_purchases")
          .select("package_id, status")
          .eq("user_id", user.id);
        const pkgIds = (purchases ?? [])
          .filter((p: any) => !p.status || p.status === "active" || p.status === "completed")
          .map((p: any) => p.package_id);
        let hasPkg = false;
        if (pkgIds.length > 0) {
          const { data: links } = await (supabase.from as any)("package_courses")
            .select("id")
            .eq("course_id", courseId)
            .in("package_id", pkgIds)
            .limit(1);
          if (links && links.length > 0) hasPkg = true;
        }

        // Check if requested subjects are free_public or free_logged_in
        let allFree = false;
        let subjectIds: string[] = subjects === "all" ? [] : subjects.split(",").filter(Boolean);
        if (subjectIds.length) {
          const { data: subs } = await (supabase.from as any)("subjects")
            .select("access_level")
            .in("id", subjectIds);
          allFree = (subs ?? []).length > 0 && (subs ?? []).every((s: any) => s.access_level === "free_public" || s.access_level === "free_logged_in");
        }

        if (!hasPkg && !allFree) {
          setAccessDenied(accessKey);
          navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
          return;
        }
      }
      setAccessReady(accessKey);
    })().catch((error) => {
      if (cancelled) return;
      console.error("Failed to check course access", error);
      setLoadError("We could not check your course access. Please try again.");
    }).finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [user, isAdmin, authLoading, courseId, accessKey, navigate, reloadVersion, subjects]);


  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    setLoading(true);
    setLoadError(null);
    setQuestions([]);
    setAnswers({});
    setSubmitted({});
    setCurrent(0);
    setFinished(false);
    setReviewMode(false);
    setReviewIndex(0);
    setSecondsLeft(initialSeconds);
    setSessionReady(false);
    (async () => {
      let subjectIds: string[] = [];
      if (subjects === "all") {
        const { data: g, error: groupError } = await (supabase.from as any)("subject_groups")
          .select("id")
          .eq("course_id", courseId)
          .abortSignal(controller.signal);
        if (groupError) throw groupError;
        const gIds = (g ?? []).map((r: { id: string }) => r.id);
        if (gIds.length) {
          const { data: s, error: subjectError } = await (supabase.from as any)("subjects")
            .select("id")
            .in("group_id", gIds)
            .abortSignal(controller.signal);
          if (subjectError) throw subjectError;
          subjectIds = (s ?? []).map((r: { id: string }) => r.id);
        }
      } else {
        subjectIds = subjects.split(",").filter(Boolean);
      }

      if (!subjectIds.length) {
        if (cancelled) return;
        setQuestions([]);
        setLoading(false);
        return;
      }

      const { data: subjMeta, error: metadataError } = await (supabase.from as any)("subjects")
        .select("id,sort_order,ordered")
        .in("id", subjectIds)
        .abortSignal(controller.signal);
      if (metadataError) throw metadataError;
      const subjectInfo = new Map<string, { sort: number; ordered: boolean }>(
        ((subjMeta ?? []) as any[]).map((r) => [r.id as string, { sort: Number(r.sort_order) || 0, ordered: Boolean(r.ordered) }]),
      );

      let qs: any[] = [];
      try {
        const res = await loadCourseRunQuestionsServerFn({
          data: { courseId, subjectIds },
        });
        if (res?.ok && Array.isArray(res.questions) && res.questions.length > 0) {
          qs = res.questions;
        }
      } catch (err) {
        console.warn("[courses.run] Server questions loader error, falling back:", err);
      }

      if (qs.length === 0) {
        const { data: clientQs, error: questionError } = await (supabase.from as any)("questions")
          .select(
            "id,subject_id,stem,explanation,image_url,answer_mode,sort_order,question_options(id,label,text,is_correct,sort_order)",
          )
          .in("subject_id", subjectIds)
          .order("sort_order")
          .abortSignal(controller.signal);
        if (questionError && !qs.length) throw questionError;
        qs = clientQs ?? [];
      }

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
        const { data: flagRows, error: flagError } = await (supabase.from as any)("question_flags")
          .select("question_id")
          .eq("user_id", user.id)
          .abortSignal(controller.signal);
        if (flagError) throw flagError;
        const flagSet = new Set<string>((flagRows ?? []).map((r: any) => r.question_id));
        if (!cancelled) setFlags(flagSet);

        if (pool === "flagged") {
          list = list.filter((q) => flagSet.has(q.id));
        } else if (pool === "incorrect") {
          const { data: attemptRows, error: attemptError } = await (supabase.from as any)("question_attempts")
            .select("question_id,is_correct,attempted_at")
            .eq("user_id", user.id)
            .order("attempted_at", { ascending: false })
            .abortSignal(controller.signal);
          if (attemptError) throw attemptError;
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

      if (cancelled) return;
      setQuestions(list);
      try {
        const saved = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null");
        if (saved && Array.isArray(saved.questionIds) && saved.questionIds.join("|") === list.map((q) => q.id).join("|")) {
          if (!saved.finished) {
            const restoredAnswers: SelectedAnswers = {};
            for (const q of list) {
              const ids = Array.isArray(saved.answerOptionIds?.[q.id]) ? saved.answerOptionIds[q.id] : [];
              restoredAnswers[q.id] = q.options.filter((option) => ids.includes(option.id)).map((option) => option.label);
            }
            setAnswers(restoredAnswers);
            setSubmitted(saved.submitted ?? {});
            setCurrent(Math.max(0, Math.min(Number(saved.current) || 0, list.length - 1)));
            setFinished(false);
            setReviewMode(Boolean(saved.reviewMode));
            setReviewIndex(Math.max(0, Number(saved.reviewIndex) || 0));
            setSecondsLeft(Math.max(0, Number(saved.secondsLeft) || initialSeconds));
          } else {
            sessionStorage.removeItem(sessionKey);
          }
        }
      } catch { sessionStorage.removeItem(sessionKey); }
      setSessionReady(true);
      setLoading(false);
    })().catch((error) => {
      if (cancelled) return;
      console.error("Failed to load course questions", error);
      setLoadError("We could not load the questions. Please try again.");
      setLoading(false);
    }).finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [courseId, subjects, pool, user, hasAccess, accessKey, initialSeconds, mode, reloadVersion, sessionKey, t]);

  useEffect(() => {
    if (!sessionReady || !questions.length) return;
    const answerOptionIds: Record<string, string[]> = {};
    for (const q of questions) {
      const labels = new Set(answers[q.id] ?? []);
      answerOptionIds[q.id] = q.options.filter((option) => labels.has(option.label)).map((option) => option.id);
    }
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        questionIds: questions.map((q) => q.id), answerOptionIds, submitted, current, finished, reviewMode, reviewIndex, secondsLeft,
      }));
    } catch {}
  }, [sessionReady, sessionKey, questions, answers, submitted, current, finished, reviewMode, reviewIndex, secondsLeft]);

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
    if (mode !== "exam" || !timed || finished || loading || !hasAccess || !questions.length || loadError) return;
    if (secondsLeft <= 0) {
      setFinished(true);
      return;
    }
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, timed, finished, secondsLeft, loading, hasAccess, questions.length, loadError]);

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
    if (finished || reviewMode || mode === "exam" || !currentQ || submitted[currentQ.id]) return;
    const interval = setInterval(() => {
      setTimeSpentOnQuestion((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [finished, reviewMode, mode, currentQ, submitted]);

  const isFlagShining =
    !!currentQ && timeSpentOnQuestion >= 45 && !isFlaggedCurrent && !submitted[currentQ.id];

  const resetSession = useCallback(() => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {}
    setCurrent(0);
    setAnswers({});
    setSubmitted({});
    setFinished(false);
    setReviewMode(false);
    setReviewIndex(0);
    setSecondsLeft(initialSeconds);
  }, [initialSeconds, sessionKey]);

  const restartSession = useCallback(() => {
    resetSession();
    if (mode === "study" && questions.length) {
      const preset: SelectedAnswers = {};
      for (const q of questions) {
        const right = q.options.filter((o) => o.is_correct).map((o) => o.label);
        if (right.length) preset[q.id] = right;
      }
      setAnswers(preset);
    }
  }, [resetSession, mode, questions]);

  const goToCourse = () => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {}
    resetSession();
    navigate({ to: "/courses/$courseId", params: { courseId } });
  };

  const refreshQuestion = useCallback(async (questionId: string) => {
    const { data, error } = await (supabase.from as any)("questions")
      .select("id,subject_id,stem,explanation,image_url,answer_mode,sort_order,question_options(id,label,text,is_correct,sort_order)")
      .eq("id", questionId).single();
    if (error) throw error;
    const refreshed: Question = {
      id: data.id, subject_id: data.subject_id, stem: data.stem, explanation: data.explanation,
      image_url: data.image_url ?? null, answer_mode: data.answer_mode === "multiple" ? "multiple" : "single",
      sort_order: Number(data.sort_order) || 0,
      options: [...(data.question_options ?? [])].sort((a: Option, b: Option) => a.sort_order - b.sort_order),
    };
    setQuestions((previous) => previous.map((question) => question.id === questionId ? refreshed : question));
    setAnswers((previous) => ({ ...previous, [questionId]: mode === "study" ? refreshed.options.filter((option) => option.is_correct).map((option) => option.label) : [] }));
  }, [mode]);

  async function runAdminResolve() {
    if (!resolveQuestion) return;
    setResolving(true);
    try {
      await resolveCourseQuestion({ data: { questionId: resolveQuestion.id, provider: resolveProvider, model: resolveModel } });
      await refreshQuestion(resolveQuestion.id);
      setResolveQuestion(null);
      toast.success("The answer and explanation were regenerated.");
    } catch (error: any) {
      toast.error(error?.message || "The question was not changed.");
    } finally {
      setResolving(false);
    }
  }

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

  const loadCourseSections = useCallback(async () => {
    if (!courseId) return;
    try {
      const { data: grps } = await (supabase.from as any)("subject_groups")
        .select("id, name, sort_order")
        .eq("course_id", courseId)
        .order("sort_order", { ascending: true });
      const groupList = (grps ?? []) as Array<{ id: string; name: string; sort_order: number }>;
      if (!groupList.length) return;

      const { data: subs } = await (supabase.from as any)("subjects")
        .select("id, group_id, name, sort_order")
        .in("group_id", groupList.map((g) => g.id))
        .order("sort_order", { ascending: true });
      const subList = (subs ?? []) as Array<{ id: string; group_id: string; name: string; sort_order: number }>;

      const subByGroup = new Map<string, Array<{ id: string; name: string; sort_order: number }>>();
      for (const s of subList) {
        const arr = subByGroup.get(s.group_id) ?? [];
        arr.push({ id: s.id, name: s.name, sort_order: s.sort_order });
        subByGroup.set(s.group_id, arr);
      }

      const structured: CourseSectionGroup[] = groupList.map((g) => ({
        id: g.id,
        name: g.name,
        sort_order: g.sort_order,
        subjects: subByGroup.get(g.id) ?? [],
      }));

      setCourseSections(structured);
    } catch (e) {
      console.error("Failed to load course sections for admin move", e);
    }
  }, [courseId]);

  useEffect(() => {
    if (isAdmin) {
      void loadCourseSections();
    }
  }, [isAdmin, loadCourseSections]);

  const handleMoveQuestion = useCallback(
    async (
      questionId: string,
      targetSubjectId?: string,
      createNewSubject?: { courseId: string; name: string; groupId?: string; newGroupName?: string },
    ) => {
      const res = await moveSingleCourseQuestion({
        data: {
          questionId,
          targetSubjectId,
          createNewSubject,
        },
      });

      if (res.success) {
        toast.success(`Question moved to "${res.targetSubjectName}"`);
        setQuestions((prev) =>
          prev.map((q) => (q.id === questionId ? { ...q, subject_id: res.targetSubjectId } : q)),
        );
        if (res.newSubject || createNewSubject) {
          void loadCourseSections();
        }
      }
    },
    [loadCourseSections],
  );

  // Every hook above must run on loading, denied, empty and ready renders.
  // Returning earlier changes React's hook order when questions arrive.
  if (loadError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="medical-card p-10" role="alert">
            <h1 className="text-xl font-bold">We could not open this session</h1>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => setReloadVersion((version) => version + 1)}
              className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">
              Try again
            </button>
            <Link to="/courses/$courseId" params={{ courseId }} className="ml-4 text-sm underline">
              Back to course
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!authLoading && !user && !isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="medical-card p-10">
            <h1 className="text-xl font-bold">Sign in to start your session</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your answers and progress are saved to your account.</p>
            <Link to="/login" search={{ next: `/courses/${courseId}/run?mode=${mode}&subjects=${encodeURIComponent(subjects)}&timed=${timed}&duration=${duration}&pool=${pool}` } as any}
              className="mt-6 inline-flex px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">
              Sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (accessDenied === accessKey) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-xl px-6 pt-32 text-center">
          <div className="medical-card p-10">
            <h1 className="text-xl font-bold">You don't have access to this course yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">Unlock it to start solving questions.</p>
            <Link to="/courses/$courseId" params={{ courseId }}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">
              Back to course <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (loading || !hasAccess || authLoading) {
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
              {pool === "flagged" ? "You have no flagged questions in these subjects yet."
                : pool === "incorrect" ? "No previously incorrect questions in these subjects."
                  : "No questions in the selected subjects yet."}
            </p>
            <Link to="/courses/$courseId" params={{ courseId }}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">
              Back to course <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
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
        onRestart={restartSession}
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
          <ProtectionNotice className="mb-6" />
          <ProtectedContent context="exam" scope="card">
            <ReviewCard
              q={q}
              userAnswer={answers[q.id]}
              isAdmin={isAdmin}
              courseId={courseId}
              courseSections={courseSections}
              onMoveQuestion={handleMoveQuestion}
            />
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
        </div>

        <ProtectionNotice className="mb-6" />

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
                    isAdmin={isAdmin}
                    courseId={courseId}
                    courseSections={courseSections}
                    onMoveQuestion={handleMoveQuestion}
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
                courseId={courseId}
                courseSections={courseSections}
                onMoveQuestion={handleMoveQuestion}
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
                onEdit={() => setAdminEditing(currentQ)}
                onResolve={() => setResolveQuestion(currentQ)}
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
      {isAdmin && adminEditing && (
        <EditQuestionDialog
          question={adminEditing as EditableQuestion}
          onClose={() => setAdminEditing(null)}
          onPersist={async (value) => {
            await updateCourseQuestion({ data: { questionId: adminEditing.id, ...value } });
          }}
          onSaved={() => {
            void refreshQuestion(adminEditing.id);
            setAdminEditing(null);
          }}
        />
      )}
      {isAdmin && resolveQuestion && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 shadow-xl">
            <div>
              <h2 className="font-bold">Re-solve and explain</h2>
              <p className="mt-1 text-sm text-muted-foreground">This replaces only this question’s correct answer and explanation after a valid result.</p>
            </div>
            <Select value={resolveProvider} onValueChange={(value) => {
              const provider = value as "google" | "openai";
              setResolveProvider(provider);
              setResolveModel(AMG_MODELS[provider][0].id);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="google">Google</SelectItem><SelectItem value="openai">OpenAI</SelectItem></SelectContent>
            </Select>
            <Select value={resolveModel} onValueChange={setResolveModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AMG_MODELS[resolveProvider].map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResolveQuestion(null)} disabled={resolving}>Cancel</Button>
              <Button onClick={runAdminResolve} disabled={resolving}>{resolving ? "Working…" : "Re-solve & explain"}</Button>
            </div>
          </div>
        </div>
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
  courseId, courseSections, onMoveQuestion,
  onToggleFlag, onSelect, onSubmit, onNext, isLast, onSetCorrect, onDelete, onEdit, onResolve, onCapture,
}: {
  q: Question; mode: Mode; isAdmin: boolean;
  courseId?: string;
  courseSections?: CourseSectionGroup[];
  onMoveQuestion?: (
    questionId: string,
    targetSubjectId?: string,
    createNewSubject?: { courseId: string; name: string; groupId?: string; newGroupName?: string },
  ) => Promise<void>;
  selected: string[] | undefined; submitted: boolean; isFlagged: boolean; isShining?: boolean;
  onToggleFlag: () => void; onSelect: (label: string) => void;
  onSubmit: () => void; onNext: () => void; isLast: boolean;
  onSetCorrect: (optionId: string) => void; onDelete: () => void;
  onEdit: () => void; onResolve: () => void;
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
          <ReportQuestionModal
            questionId={q.id}
            questionStem={q.stem}
            source="course"
            sourceContext={courseId}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ArabicToggle on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
          {isAdmin && courseId && courseSections && onMoveQuestion && (
            <MoveQuestionControl
              questionId={q.id}
              currentSubjectId={q.subject_id}
              courseId={courseId}
              courseSections={courseSections}
              onMoveQuestion={onMoveQuestion}
            />
          )}
          {isAdmin && isStudy && (
            <button
              onClick={onDelete}
              className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete question
            </button>
          )}
          {isAdmin && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
              <Button type="button" size="sm" variant="outline" onClick={onResolve}><Sparkles className="mr-1 h-3.5 w-3.5" />Re-solve</Button>
            </>
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
          {show ? show.stem : q.stem}
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
  isAdmin, courseId, courseSections, onMoveQuestion,
}: {
  q: Question; index: number; selected: string[] | undefined;
  onSelect: (label: string) => void; isFlagged: boolean; onToggleFlag: () => void;
  isAdmin?: boolean; courseId?: string; courseSections?: CourseSectionGroup[];
  onMoveQuestion?: (
    questionId: string,
    targetSubjectId?: string,
    createNewSubject?: { courseId: string; name: string; groupId?: string; newGroupName?: string },
  ) => Promise<void>;
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
        <div className="mt-2">
          <ReportQuestionModal
            questionId={q.id}
            questionStem={q.stem}
            source="course"
            sourceContext={courseId}
            className="w-full justify-center"
          />
        </div>
        <ArabicToggle className="mt-3" on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
        {isAdmin && courseId && courseSections && onMoveQuestion && (
          <div className="mt-3">
            <MoveQuestionControl
              questionId={q.id}
              currentSubjectId={q.subject_id}
              courseId={courseId}
              courseSections={courseSections}
              onMoveQuestion={onMoveQuestion}
            />
          </div>
        )}
      </div>
      <ProtectedContent context="exam" scope="card">
      <div className="px-5 py-5">
        {q.image_url && <div className="mb-4"><QuestionImage path={q.image_url} /></div>}
        {(q.stem?.trim() || !q.image_url) && (
          <div dir={show ? "rtl" : undefined} className="text-base leading-relaxed mb-4 text-foreground">
            {show ? show.stem : q.stem}
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

function ReviewCard({
  q,
  userAnswer,
  isAdmin,
  courseId,
  courseSections,
  onMoveQuestion,
}: {
  q: Question;
  userAnswer: string[] | undefined;
  isAdmin?: boolean;
  courseId?: string;
  courseSections?: CourseSectionGroup[];
  onMoveQuestion?: (
    questionId: string,
    targetSubjectId?: string,
    createNewSubject?: { courseId: string; name: string; groupId?: string; newGroupName?: string },
  ) => Promise<void>;
}) {
  const [ar, setAr] = useState(false);
  const { data: tr, loading: trLoading, error: trError } = useQuestionTranslation(q.id, ar);
  const show = ar && tr ? tr : null;
  return (
    <div className="medical-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <Pencil className="w-4 h-4 text-rose-500" />
            <span className="text-xs uppercase tracking-widest font-bold text-rose-600">Wrong answer</span>
          </span>
          <ReportQuestionModal
            questionId={q.id}
            questionStem={q.stem}
            source="course"
            sourceContext={courseId}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAdmin && courseId && courseSections && onMoveQuestion && (
            <MoveQuestionControl
              questionId={q.id}
              currentSubjectId={q.subject_id}
              courseId={courseId}
              courseSections={courseSections}
              onMoveQuestion={onMoveQuestion}
            />
          )}
          <ArabicToggle on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
        </div>
      </div>
      {q.image_url && <div className="px-6 pt-6"><QuestionImage path={q.image_url} /></div>}
      {(q.stem?.trim() || !q.image_url) && (
        <div dir={show ? "rtl" : undefined} className="px-6 py-6 text-base leading-relaxed text-foreground">
          {show ? show.stem : q.stem}
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
  stats, mode, onReview, onRestart, onBack, hasWrong,
}: {
  stats: { correct: number; wrong: number; unanswered: number; total: number; score: number };
  mode: Mode; onReview: () => void; onRestart?: () => void; onBack: () => void; hasWrong: boolean;
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
          {onRestart && (
            <button
              onClick={onRestart}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted font-bold"
            >
              <RotateCcw className="w-4 h-4" /> Restart
            </button>
          )}
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
