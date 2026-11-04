import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { QuestionImage, prefetchQuestionImage } from "@/components/quiz/QuestionImage";
import { ChemText } from "@/components/ChemText";
import { ExplanationPanel, type CapturePayload } from "@/components/ExplanationPanel";
import { SaveNoteDialog, type SaveNotePayload } from "@/components/SaveNoteDialog";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedContent } from "@/components/protect/ProtectedContent";
import { ProtectionNotice } from "@/components/protect/ProtectionNotice";
import { ArabicToggle } from "@/components/quiz/ArabicToggle";
import { useQuestionTranslation } from "@/hooks/useQuestionTranslation";
import { useServerFn } from "@tanstack/react-start";
import { EditQuestionDialog, type EditableQuestion } from "@/components/admin/QuestionListEditor";
import { AMG_MODELS, amgAddCourseQuestion, amgResolveCourseQuestion, amgUpdateCourseQuestion } from "@/lib/aqua-mcq-gen.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoveQuestionControl, type CourseSectionGroup } from "@/components/course/MoveQuestionControl";
import { moveSingleCourseQuestion } from "@/lib/course-sorter.functions";
import { ReportQuestionModal } from "@/components/ReportQuestionModal";
import { loadCourseRunQuestionsServerFn } from "@/lib/course-enrollment.functions";
import { ChallengeGate, useExcludedSubjects } from "@/components/challenge/ChallengeGate";
import { ensureFreeEnrollment } from "@/lib/course-access";
import { formatQuestionStem, ensureCombinedStemWithStatements } from "@/lib/question-format";
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
  Lightbulb,
  SkipForward,
  Plus,
  ChevronDown,
  ChevronLeft,
  LayoutGrid,
  X,
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

/** Challenge mode (if the course has one) decides, from the groups picked, what this session may contain. */
function RunPage() {
  const { courseId } = Route.useParams();
  const { subjects } = Route.useSearch();
  return (
    <ChallengeGate courseId={courseId} subjects={subjects}>
      <RunPageInner />
    </ChallengeGate>
  );
}

function RunPageInner() {
  const { courseId } = Route.useParams();
  const { mode, subjects, timed, duration, pool, t } = Route.useSearch();
  // Challenge groups the student has not finished or ignored stay out of normal practice.
  const excludedSubjects = useExcludedSubjects();
  const excludedKey = excludedSubjects.join(",");
  const navigate = useNavigate();
  const { isAdmin, user, loading: authLoading } = useAuth();
  /** A QBank member an admin assigned to this course may edit its questions (Admin -> Users -> Course editing). */
  const [isCourseEditor, setIsCourseEditor] = useState(false);
  const canEdit = isAdmin || isCourseEditor;
  useEffect(() => {
    let alive = true;
    if (!user || isAdmin) { setIsCourseEditor(false); return; }
    (async () => {
      const { data } = await (supabase.rpc as any)("can_edit_course", { _user_id: user.id, _course_id: courseId });
      if (alive) setIsCourseEditor(data === true);
    })().catch(() => { if (alive) setIsCourseEditor(false); });
    return () => { alive = false; };
  }, [user, isAdmin, courseId]);
  const accessKey = `${courseId}:${user?.id ?? "guest"}:${isAdmin ? "admin" : "student"}:${t ?? 0}`;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<SelectedAnswers>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  /** Session mode: questions the student chose to leave for later (they come back until answered). */
  const [skipped, setSkipped] = useState<string[]>([]);
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
  const addCourseQuestion = useServerFn(amgAddCourseQuestion);
  const [addSubjectId, setAddSubjectId] = useState<string | null>(null);
  const newQuestionId = useRef<string | null>(null);
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
      // The editor check, the course price and the enrollment do not depend on each other: read them together.
      const [{ data: editor }, { data: c, error: courseError }, enrollmentRes] = await Promise.all([
        user
          ? Promise.resolve((supabase.rpc as any)("can_edit_course", { _user_id: user.id, _course_id: courseId }))
          : Promise.resolve({ data: null }),
        Promise.resolve(
          (supabase.from as any)("courses").select("price").eq("id", courseId).maybeSingle().abortSignal(controller.signal),
        ),
        user
          ? Promise.resolve(
              (supabase.from as any)("user_courses")
                .select("id")
                .eq("user_id", user.id)
                .eq("course_id", courseId)
                .maybeSingle()
                .abortSignal(controller.signal),
            )
          : Promise.resolve({ data: null, error: null }),
      ]);
      // a course editor always gets in, even when the course is paid and they are not enrolled
      if (user && editor === true) { if (!cancelled) setAccessReady(accessKey); return; }
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
      const { data: enr, error: enrollmentError } = enrollmentRes;
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
          // Check if student owns a lecture course that links to this course as test or homework
          let hasLectureAccess = false;
          try {
            const { data: userLec } = await (supabase.from as any)("user_lecture_courses")
              .select("course_id")
              .eq("user_id", user.id);
            const { data: staffLec } = await (supabase.from as any)("lecture_staff")
              .select("course_id")
              .eq("user_id", user.id);
            const userCourseIds = Array.from(new Set([
              ...((userLec ?? []).map((l: any) => l.course_id)),
              ...((staffLec ?? []).map((s: any) => s.course_id)),
            ]));

            if (userCourseIds.length > 0) {
              const { data: matchingItems } = await (supabase.from as any)("lecture_items")
                .select("id, link_url, lecture_subjects!inner(course_id)")
                .in("lecture_subjects.course_id", userCourseIds)
                .ilike("link_url", `%"linked_course_id":"${courseId}"%`)
                .limit(1);
              if (matchingItems && matchingItems.length > 0) {
                hasLectureAccess = true;
              }
            }
          } catch (err) {
            console.warn("Could not check lecture linked access:", err);
          }

          if (!hasLectureAccess) {
            setAccessDenied(accessKey);
            navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
            return;
          }
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
      // The student's flags do not depend on the questions: start reading them now, not after the questions arrive.
      const flagsPromise: Promise<any> | null = user
        ? Promise.resolve(
            (supabase.from as any)("question_flags").select("question_id").eq("user_id", user.id).abortSignal(controller.signal),
          )
        : null;
      flagsPromise?.catch(() => {});

      let subjectIds: string[] = [];
      let subjMeta: any[] | null = null;
      if (subjects === "all") {
        // all subjects of the course, with their order settings, in one request
        const { data: s, error: subjectError } = await (supabase.from as any)("subjects")
          .select("id,sort_order,ordered,subject_groups!inner(course_id)")
          .eq("subject_groups.course_id", courseId)
          .abortSignal(controller.signal);
        if (subjectError) throw subjectError;
        subjMeta = (s ?? []) as any[];
        subjectIds = subjMeta.map((r: { id: string }) => r.id);
      } else {
        subjectIds = subjects.split(",").filter(Boolean);
      }
      if (excludedKey) {
        const left = new Set(excludedKey.split(","));
        subjectIds = subjectIds.filter((id) => !left.has(id));
      }

      if (!subjectIds.length) {
        if (cancelled) return;
        setQuestions([]);
        setLoading(false);
        return;
      }

      if (!subjMeta) {
        const { data: meta, error: metadataError } = await (supabase.from as any)("subjects")
          .select("id,sort_order,ordered")
          .in("id", subjectIds)
          .abortSignal(controller.signal);
        if (metadataError) throw metadataError;
        subjMeta = (meta ?? []) as any[];
      }
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
        const { data: flagRows, error: flagError } = await flagsPromise!;
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
            setSkipped(Array.isArray(saved.skipped) ? saved.skipped.filter((id: unknown) => list.some((q) => q.id === id)) : []);
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
  }, [courseId, subjects, pool, user, hasAccess, accessKey, initialSeconds, mode, reloadVersion, sessionKey, t, excludedKey]);

  // The next few questions' pictures are fetched while the student answers the current one.
  useEffect(() => {
    if (!sessionReady) return;
    for (let i = current; i <= current + 3 && i < questions.length; i++) {
      prefetchQuestionImage(questions[i].image_url);
    }
  }, [sessionReady, current, questions]);

  useEffect(() => {
    if (!sessionReady || !questions.length) return;
    const answerOptionIds: Record<string, string[]> = {};
    for (const q of questions) {
      const labels = new Set(answers[q.id] ?? []);
      answerOptionIds[q.id] = q.options.filter((option) => labels.has(option.label)).map((option) => option.id);
    }
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        questionIds: questions.map((q) => q.id), answerOptionIds, submitted, skipped, current, finished, reviewMode, reviewIndex, secondsLeft,
      }));
    } catch {}
  }, [sessionReady, sessionKey, questions, answers, submitted, skipped, current, finished, reviewMode, reviewIndex, secondsLeft]);

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

  // Stable callbacks, so the exam cards are not re-rendered every second by the timer or by every answer click.
  const toggleFlagRef = useRef(toggleFlag);
  toggleFlagRef.current = toggleFlag;
  const onFlagStable = useCallback((questionId: string) => {
    void toggleFlagRef.current(questionId);
  }, []);
  const onExamSelect = useCallback((question: Question, option: string) => {
    setAnswers((p) => ({ ...p, [question.id]: toggleSelection(p[question.id], option, question.answer_mode === "multiple") }));
  }, []);

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

  /** Questions the student skipped and has not answered yet, other than the one on screen. */
  const skippedLeft = questions.filter((q) => skipped.includes(q.id) && !submitted[q.id] && q.id !== currentQ?.id);

  /** Leave this question for later: go to the next open one (wrapping around), preferring the ones not skipped before. */
  const skipCurrent = () => {
    if (!currentQ) return;
    const marked = skipped.includes(currentQ.id) ? skipped : [...skipped, currentQ.id];
    setSkipped(marked);
    const n = questions.length;
    const find = (allowSkipped: boolean) => {
      for (let step = 1; step < n; step++) {
        const i = (current + step) % n;
        const q = questions[i]!;
        if (!submitted[q.id] && (allowSkipped || !marked.includes(q.id))) return i;
      }
      return -1;
    };
    const next = find(false) >= 0 ? find(false) : find(true);
    if (next >= 0) setCurrent(next);
    else toast.info("This is the last open question. Answer it, or finish the session.");
  };

  // A new question (or review item) opens at its top, even if the student scrolled down to read the explanation.
  const cardTopRef = useRef<HTMLDivElement | null>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    if (firstScroll.current) { firstScroll.current = false; return; }
    cardTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current, reviewIndex, reviewMode, mode]);

  // Map sheet and the number strip in the bottom dock
  const [mapOpen, setMapOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = stripRef.current;
    const el = box?.querySelector<HTMLElement>('[data-current="true"]');
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [current, questions.length]);
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMapOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapOpen]);

  const goNextFrom = () => {
    if (current < questions.length - 1) { setCurrent((c) => c + 1); return; }
    // At the end: come back to what was skipped before finishing.
    if (mode === "session" && skippedLeft.length) {
      const first = questions.findIndex((q) => q.id === skippedLeft[0]!.id);
      if (first >= 0) { setCurrent(first); return; }
    }
    setFinished(true);
  };

  const isFlagShining =
    !!currentQ && timeSpentOnQuestion >= 45 && !isFlaggedCurrent && !submitted[currentQ.id];

  const resetSession = useCallback(() => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {}
    setCurrent(0);
    setAnswers({});
    setSubmitted({});
    setSkipped([]);
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

  const editStable = useCallback((question: Question) => setAdminEditing(question), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deleteStable = useCallback((id: string) => { void deleteQuestion(id); }, [questions.length]);

  /** After a question was added: fetch it and put it right after the one on screen. */
  async function showNewQuestion(questionId: string) {
    const { data, error } = await (supabase.from as any)("questions")
      .select("id,subject_id,stem,explanation,image_url,answer_mode,sort_order,question_options(id,label,text,is_correct,sort_order)")
      .eq("id", questionId).single();
    if (error) throw error;
    const added: Question = {
      id: data.id, subject_id: data.subject_id, stem: data.stem, explanation: data.explanation,
      image_url: data.image_url ?? null, answer_mode: data.answer_mode === "multiple" ? "multiple" : "single",
      sort_order: Number(data.sort_order) || 0,
      options: [...(data.question_options ?? [])].sort((a: Option, b: Option) => a.sort_order - b.sort_order),
    };
    setQuestions((previous) => [...previous.slice(0, current + 1), added, ...previous.slice(current + 1)]);
    setAnswers((previous) => ({ ...previous, [added.id]: mode === "study" ? added.options.filter((o) => o.is_correct).map((o) => o.label) : [] }));
    setCurrent(Math.min(current + 1, questions.length));
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
    if (canEdit) {
      void loadCourseSections();
    }
  }, [canEdit, loadCourseSections]);

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
          <div className="q-card p-10" role="alert">
            <h1 className="text-xl font-bold">We could not open this session</h1>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => setReloadVersion((version) => version + 1)}
              className="q-btn q-btn--primary mt-6">
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
          <div className="q-card p-10">
            <h1 className="text-xl font-bold">Sign in to start your session</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your answers and progress are saved to your account.</p>
            <Link to="/login" search={{ next: `/courses/${courseId}/run?mode=${mode}&subjects=${encodeURIComponent(subjects)}&timed=${timed}&duration=${duration}&pool=${pool}` } as any}
              className="q-btn q-btn--primary mt-6">
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
          <div className="q-card p-10">
            <h1 className="text-xl font-bold">You don't have access to this course yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">Unlock it to start solving questions.</p>
            <Link to="/courses/$courseId" params={{ courseId }}
              className="q-btn q-btn--primary mt-6">
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
          <div className="q-card p-10">
            <Sparkles className="w-10 h-10 mx-auto text-primary mb-3" />
            <h1 className="text-xl font-bold">Nothing to study here yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {pool === "flagged" ? "You have no flagged questions in these topics yet."
                : pool === "incorrect" ? "No previously incorrect questions in these topics."
                  : "No questions in the selected topics yet."}
            </p>
            <Link to="/courses/$courseId" params={{ courseId }}
              className="q-btn q-btn--primary mt-6">
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
            <div className="q-chip">
              <Pencil className="w-3 h-3" /> Reviewing wrong answers
            </div>
            <div className="text-sm text-muted-foreground font-semibold">
              {reviewIndex + 1} <span className="text-muted-foreground">/ {wrongQuestions.length}</span>
            </div>
          </div>
          <ProtectionNotice className="mb-6" />
          <ProtectedContent context="exam" scope="card" consentScope={courseId ? `course:${courseId}` : "global"}>
            <ReviewCard
              q={q}
              userAnswer={answers[q.id]}
              isAdmin={canEdit}
              onEditQuestion={editStable}
              onDeleteQuestion={deleteStable}
              courseId={courseId}
              courseSections={courseSections}
              onMoveQuestion={handleMoveQuestion}
            />
          </ProtectedContent>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button onClick={() => setReviewIndex((i) => Math.max(0, i - 1))} disabled={reviewIndex === 0}
              className="q-btn q-btn--ghost disabled:opacity-40">
              ‹ Previous
            </button>
            <button onClick={goToCourse}
              className="q-btn q-btn--ghost">
              Done
            </button>
            <button onClick={() => setReviewIndex((i) => Math.min(wrongQuestions.length - 1, i + 1))}
              disabled={reviewIndex === wrongQuestions.length - 1}
              className="q-btn q-btn--primary">
              Next ›
            </button>
          </div>
        </main>
      </div>
    );
  }

  const timeLow = timed && secondsLeft <= initialSeconds * 0.1;

  const answeredTotal = questions.filter((q) => answers[q.id]?.length).length;
  const flaggedTotal = questions.filter((q) => flags.has(q.id)).length;
  const pct = questions.length ? Math.round(((mode === "exam" ? answeredTotal : current + 1) / questions.length) * 100) : 0;
  const cellState = (q: Question, i: number) => {
    const answered = !!answers[q.id]?.length;
    const wasSubmitted = !!submitted[q.id] || mode === "study";
    const right = wasSubmitted && answered && isExactAnswer(q, answers[q.id]);
    const wrong = wasSubmitted && answered && !right;
    const skippedOpen = mode === "session" && skipped.includes(q.id) && !wasSubmitted;
    if (i === current) return "current";
    if (mode === "study") return "idle";
    if (mode === "session") return right ? "right" : wrong ? "wrong" : skippedOpen ? "skipped" : answered ? "answered" : "idle";
    return answered ? "answered" : "idle";
  };
  const isLastQ = current === questions.length - 1;
  const sessionOpen = mode === "session" && !!currentQ && !submitted[currentQ.id];
  const modeName = mode === "study" ? "Study mode" : mode === "session" ? "Session mode" : "Exam mode";
  const openFinish = () => (mode === "exam" ? setMapOpen(true) : setFinished(true));

  return (
    <div className="f-page">
      <header className="f-top">
        <button onClick={goToCourse} className="f-iconbtn" aria-label="End and exit" title="End & exit"><X className="h-4 w-4" /></button>
        <div className="min-w-0">
          <div className="f-top__title">
            {modeName}
            {pool !== "all" && <span className="text-[color:var(--gold-ink)]"> Â· {pool === "flagged" ? "Flagged only" : "Incorrect only"}</span>}
          </div>
          <div className="f-top__sub">
            {mode === "exam" ? `${answeredTotal} of ${questions.length} answered` : `Question ${current + 1} of ${questions.length}`}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mode === "exam" && timed === 1 && (
            <span className="f-timer" data-low={timeLow ? "true" : "false"}><Clock className="h-4 w-4" /> {fmtTime(secondsLeft)}</span>
          )}
          <button onClick={() => setMapOpen(true)} className="f-pill" aria-haspopup="dialog">
            <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Map</span>
          </button>
          <button onClick={openFinish} className="f-pill f-pill--solid">Finish</button>
        </div>
        <div className="f-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
      </header>

      <main className="f-wrap">
        <ProtectionNotice className="mb-8" />
        {currentQ && (
          <>
            <div ref={cardTopRef} className="scroll-mt-24" aria-hidden />
            <QuestionCard
              q={currentQ} mode={mode} isAdmin={canEdit} canResolve={isAdmin}
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
              onNext={goNextFrom}
              onSkip={mode === "session" ? skipCurrent : undefined}
              skippedLeft={mode === "session" ? skippedLeft.length : 0}
              isLast={isLastQ}
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
          </>
        )}
      </main>

      <nav className="f-dock" aria-label="Question navigation">
        <div className="f-dock__in">
          <button className="f-iconbtn" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} aria-label="Previous question">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="f-dock__mid">
            <span className="f-count-sm"><b>{current + 1}</b> / {questions.length}</span>
            <div className="f-strip" ref={stripRef}>
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  data-state={cellState(q, i)}
                  data-flag={flags.has(q.id) ? "true" : "false"}
                  data-current={i === current ? "true" : "false"}
                  aria-label={`Question ${i + 1}${flags.has(q.id) ? ", flagged" : ""}`}
                  aria-current={i === current ? "true" : undefined}
                  onClick={() => setCurrent(i)}
                  className="f-dot"
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionOpen && currentQ ? (
              <>
                <button type="button" onClick={skipCurrent} className="f-btn f-btn--ghost" title="Leave this question for later; it comes back before the session ends">
                  <SkipForward className="h-4 w-4" /> <span className="hidden sm:inline">Skip</span>
                </button>
                <button
                  disabled={!answers[currentQ.id]?.length}
                  onClick={() => setSubmitted((p) => ({ ...p, [currentQ.id]: true }))}
                  className="f-btn f-btn--primary"
                >
                  Submit
                </button>
              </>
            ) : (
              <button
                onClick={mode === "exam" ? (isLastQ ? () => setMapOpen(true) : () => setCurrent((c) => c + 1)) : goNextFrom}
                className={`f-btn ${isLastQ ? "f-btn--gold" : "f-btn--primary"}`}
              >
                {isLastQ
                  ? mode === "exam"
                    ? "Review & finish"
                    : skippedLeft.length && mode === "session"
                      ? `Skipped (${skippedLeft.length})`
                      : "Finish"
                  : "Next"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {mapOpen && (
        <>
          <div className="f-veil" onClick={() => setMapOpen(false)} />
          <aside className="f-sheet" role="dialog" aria-modal="true" aria-label="Question map">
            <div className="f-sheet__head">
              <div>
                <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>Question map</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{modeName}</p>
              </div>
              <button onClick={() => setMapOpen(false)} className="f-iconbtn" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="f-sheet__body">
              <div className="f-sum">
                <div><b>{answeredTotal}</b><span>Answered</span></div>
                <div><b>{questions.length - answeredTotal}</b><span>{mode === "study" ? "Left" : "Unanswered"}</span></div>
                <div><b>{flaggedTotal}</b><span>Flagged</span></div>
              </div>
              <div className="f-grid">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    data-state={cellState(q, i)}
                    data-flag={flags.has(q.id) ? "true" : "false"}
                    aria-label={`Question ${i + 1}${flags.has(q.id) ? ", flagged" : ""}`}
                    onClick={() => { setCurrent(i); setMapOpen(false); }}
                    className="f-dot"
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="f-legend">
                <span><i style={{ background: "var(--primary)" }} />Current</span>
                <span><i style={{ background: "var(--primary-soft)", border: "1px solid var(--primary)" }} />Answered</span>
                {mode === "session" && <span><i style={{ background: "var(--ok)" }} />Correct</span>}
                {mode === "session" && <span><i style={{ background: "var(--bad)" }} />Wrong</span>}
                {mode === "session" && <span><i style={{ border: "1.5px dashed var(--gold)" }} />Skipped</span>}
                <span><i style={{ background: "var(--gold)" }} />Flagged</span>
              </div>
            </div>
            <div className="f-sheet__foot">
              {mode === "exam" && questions.length - answeredTotal > 0 && (
                <p className="f-warn">{questions.length - answeredTotal} question{questions.length - answeredTotal === 1 ? " is" : "s are"} still unanswered.</p>
              )}
              <button onClick={() => { setMapOpen(false); setFinished(true); }} className="f-btn f-btn--primary f-btn--block">
                Finish {mode === "study" ? "study" : mode === "session" ? "session" : "exam"}
              </button>
              <button onClick={() => setMapOpen(false)} className="f-btn f-btn--ghost f-btn--block">Keep going</button>
            </div>
          </aside>
        </>
      )}
      {user && (
        <SaveNoteDialog
          open={!!pendingNote}
          payload={pendingNote}
          userId={user.id}
          onClose={() => setPendingNote(null)}
          onSaved={() => setPendingNote(null)}
        />
      )}
      {canEdit && addSubjectId && (
        <EditQuestionDialog
          question={{ id: "new", stem: "", explanation: null, sort_order: 0, image_url: null, answer_mode: "single", options: [] }}
          onClose={() => setAddSubjectId(null)}
          onPersist={async (value) => {
            const created = await addCourseQuestion({ data: { subjectId: addSubjectId, ...value } });
            newQuestionId.current = created.id;
          }}
          onSaved={() => {
            const id = newQuestionId.current;
            setAddSubjectId(null);
            if (id) void showNewQuestion(id).catch(() => toast.error("The question was added. Reload the page to see it."));
          }}
        />
      )}
      {canEdit && !finished && questions.length > 0 && (
        <button
          type="button"
          onClick={() => setAddSubjectId((questions[current] ?? questions[0]).subject_id)}
          className="fixed bottom-24 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 touch-manipulation"
          title="Add a new question to this section"
        >
          <Plus className="h-4 w-4" /> Add question
        </button>
      )}
      {canEdit && adminEditing && (
        <EditQuestionDialog
          question={adminEditing as EditableQuestion}
          onClose={() => setAdminEditing(null)}
          onPersist={async (value) => {
            await updateCourseQuestion({ data: { questionId: adminEditing.id, ...value } });
            // Read the question back: the old picture file is deleted right after this returns, so make sure the database really
            // points at the new picture (or none) first. If it does not, stop here and keep the old file.
            const { data: check, error: checkError } = await (supabase.from as any)("questions").select("image_url").eq("id", adminEditing.id).maybeSingle();
            if (checkError) throw checkError;
            if ((check?.image_url ?? null) !== (value.imageUrl ?? null)) {
              throw new Error("The picture was not changed in the database, so nothing was deleted. Please try again or tell an admin.");
            }
          }}
          onSaved={() => {
            const savedId = adminEditing.id;
            setAdminEditing(null);
            refreshQuestion(savedId).catch(() => {
              toast.error("Saved, but the page could not refresh this question. Reload the page to see the change.");
            });
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
  onToggleFlag, onSelect, onSubmit, onNext, onSkip, skippedLeft = 0, isLast, onSetCorrect, onDelete, onEdit, onResolve, onCapture, canResolve = false,
}: {
  q: Question; mode: Mode; isAdmin: boolean; canResolve?: boolean;
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
  /** Session mode only: leave this question for later. */
  onSkip?: () => void; skippedLeft?: number;
  onSetCorrect: (optionId: string) => void; onDelete: () => void;
  onEdit: () => void; onResolve: () => void;
  onCapture: (cap: CapturePayload) => void;
}) {
  const isStudy = mode === "study";
  const [ar, setAr] = useState(false);
  const { data: tr, loading: trLoading, error: trError } = useQuestionTranslation(q.id, ar);
  const show = ar && tr ? tr : null;
  // Session mode: the explanation stays closed until the student asks for it.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const explanationText = (show?.explanation ?? q.explanation) as string | null;
  // Session and study mode: the explanation stays hidden until the student asks (study mode shows the right answer straight away).
  const hiddenUntilAsked = mode === "session" || mode === "study";
  const explanationOpen = !hiddenUntilAsked || !!revealed[q.id];
  const answerShown = submitted; // study mode always shows the right answer; only the explanation waits for the button

  return (
    <article className="f-q">
      <div className="f-q__tools">
        <button onClick={onToggleFlag} className={`q-chip ${isFlagged ? "q-chip--flag" : isShining ? "q-chip--shine" : ""}`}>
          <Flag className={`h-3.5 w-3.5 ${isFlagged ? "fill-current" : ""}`} />
          {isFlagged ? "Flagged" : "Flag question"}
        </button>
        {isShining && !isFlagged && (
          <span className="q-hint">{show ? "Ø³Ø¤Ø§Ù„ ÙŠØ³ØªØºØ±Ù‚ ÙˆÙ‚ØªØ§Ù‹ØŸ Ø§Ø¶ØºØ· ðŸš© Ù„ØªØ¹Ù„ÙŠÙ…Ù‡" : "Taking long? Flag it to revisit"}</span>
        )}
        <ReportQuestionModal
          questionId={q.id}
          questionStem={q.stem}
          source="course"
          sourceContext={courseId}
        />
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
        {isAdmin && (
          <button onClick={onDelete} className="q-chip hover:!text-[color:var(--bad)]">
            <Trash2 className="h-3.5 w-3.5" /> Delete question
          </button>
        )}
        {isAdmin && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
            {canResolve && <Button type="button" size="sm" variant="outline" onClick={onResolve}><Sparkles className="mr-1 h-3.5 w-3.5" />Re-solve</Button>}
          </>
        )}
      </div>
      <ProtectedContent context="quiz" scope="card" consentScope={courseId ? `course:${courseId}` : "global"}>
      {q.image_url && <div className="f-img"><QuestionImage path={q.image_url} /></div>}
      {(q.stem?.trim() || !q.image_url) && (
        <div dir={show ? "rtl" : undefined} className="f-stem">
          <ChemText text={ensureCombinedStemWithStatements(show ? show.stem : q.stem, (show?.explanation ?? q.explanation) as string, q.options)} />
        </div>
      )}
      {q.answer_mode === "multiple" && <p className="f-note">More than one answer: select all that apply.</p>}
      <div className="f-opts">
        {q.options.map((o) => {
          const isSelected = selected?.includes(o.label) ?? false;
          const showAnswers = answerShown;
          const isRight = showAnswers && o.is_correct;
          const isWrong = showAnswers && isSelected && !o.is_correct;
          const lockedInStudy = isStudy;
          return (
            <div key={o.id} className="flex items-stretch gap-2">
              <button
                disabled={(submitted && mode !== "study") || lockedInStudy}
                onClick={() => !lockedInStudy && onSelect(o.label)}
                data-state={isRight ? "right" : isWrong ? "wrong" : isSelected ? "selected" : "idle"}
                data-dim={lockedInStudy && !isRight ? "true" : undefined}
                className="f-opt flex-1"
              >
                <span className="f-letter">{o.label}</span>
                <span dir={show ? "rtl" : undefined} className="f-opt__text">
                  <ChemText text={(show ? (show.options[o.id] ?? o.text) : o.text) || ""} />
                </span>
                {isRight && <CheckCircle2 className="h-5 w-5 shrink-0 text-[color:var(--ok)]" />}
                {isWrong && <XCircle className="h-5 w-5 shrink-0 text-[color:var(--bad)]" />}
              </button>
              {isAdmin && isStudy && (q.answer_mode === "multiple" || !o.is_correct) && (
                <button
                  onClick={() => onSetCorrect(o.id)}
                  title={o.is_correct ? "Remove from correct answers" : "Mark as a correct answer"}
                  className="q-chip"
                >
                  <Save className="h-3.5 w-3.5" /> {o.is_correct ? "Unset" : "Set correct"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      </ProtectedContent>

      {((mode === "session" && submitted) || isStudy) && explanationText && (
        <button
          type="button"
          onClick={() => setRevealed((p) => ({ ...p, [q.id]: !p[q.id] }))}
          aria-expanded={!!revealed[q.id]}
          className="f-explain"
        >
          <Lightbulb className="h-4 w-4" />
          {revealed[q.id] ? "Hide explanation" : "Show explanation"}
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${revealed[q.id] ? "rotate-180" : ""}`} />
        </button>
      )}
      {(submitted || isStudy) && explanationText && explanationOpen && (
        <div dir={show?.explanation ? "rtl" : undefined} className="-mx-1 mt-4">
          <ExplanationPanel explanation={explanationText} onCapture={onCapture} />
        </div>
      )}
    </article>
  );
}

function ReviewCard({
  q,
  userAnswer,
  isAdmin,
  courseId,
  courseSections,
  onMoveQuestion,
  onEditQuestion,
  onDeleteQuestion,
}: {
  q: Question;
  userAnswer: string[] | undefined;
  onEditQuestion?: (question: Question) => void;
  onDeleteQuestion?: (questionId: string) => void;
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
    <div className="q-card">
      <div className="q-card__head">
        <div className="flex items-center gap-3">
          <span className="q-chip" style={{ cursor: "default", color: "var(--bad)", borderColor: "color-mix(in oklab, var(--bad) 40%, transparent)" }}>
            <XCircle className="h-3.5 w-3.5" /> Wrong answer
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
          {isAdmin && onEditQuestion && (
            <Button type="button" size="sm" variant="outline" onClick={() => onEditQuestion(q)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
          )}
          {isAdmin && onDeleteQuestion && (
            <button type="button" onClick={() => onDeleteQuestion(q.id)} className="q-chip hover:!text-[color:var(--bad)]">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <ArabicToggle on={ar} onToggle={() => setAr((v) => !v)} loading={trLoading} error={trError} />
        </div>
      </div>
      {q.image_url && <div className="f-img px-5 pt-6 md:px-9"><QuestionImage path={q.image_url} /></div>}
      {(q.stem?.trim() || !q.image_url) && (
        <div dir={show ? "rtl" : undefined} className="q-stem">
          <ChemText text={ensureCombinedStemWithStatements(show ? show.stem : q.stem, (show?.explanation ?? q.explanation) as string, q.options)} />
        </div>
      )}
      <div className="q-list">
        {q.options.map((o) => {
          const isUser = userAnswer?.includes(o.label) ?? false;
          const isRight = o.is_correct;
          return (
            <div key={o.id} data-state={isRight ? "right" : isUser ? "wrong" : "idle"} className="q-opt" style={{ cursor: "default" }}>
              <span className="q-key">{o.label}</span>
              <span dir={show ? "rtl" : undefined} className="q-opt__text">
                <ChemText text={(show ? (show.options[o.id] ?? o.text) : o.text) || ""} />
              </span>
              {isRight && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--ok)]">
                  <CheckCircle2 className="h-4 w-4" /> Correct
                </span>
              )}
              {isUser && !isRight && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--bad)]">
                  <XCircle className="h-4 w-4" /> Your answer
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
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="relative mx-auto max-w-3xl px-6 pt-28 pb-20">
        <div className="text-center">
          <p className="text-sm font-semibold text-muted-foreground">
            {mode === "exam" ? "Exam complete" : mode === "session" ? "Session complete" : "Study complete"}
          </p>
          <h1 className="mt-2 text-5xl font-semibold tracking-tight md:text-6xl" style={{ fontFamily: "var(--font-heading)" }}>
            {pass ? "Great work." : "Keep going."}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {pass ? "You passed. Review what you missed to lock it in." : "Review the questions you missed and try again."}
          </p>
        </div>

        <div className="my-10 flex justify-center">
          <ScoreRing value={stats.score} pass={pass} />
        </div>

        <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total" value={stats.total} tone="neutral" />
          <StatTile label="Correct" value={stats.correct} tone="good" />
          <StatTile label="Wrong" value={stats.wrong} tone="bad" />
          <StatTile label="Unanswered" value={stats.unanswered} tone="warn" />
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onRestart && (
            <button onClick={onRestart} className="q-btn q-btn--ghost">
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          )}
          {hasWrong && (
            <button onClick={onReview} className="q-btn q-btn--ghost">
              <RotateCcw className="h-4 w-4" /> Review wrong answers
            </button>
          )}
          <button onClick={onBack} className="q-btn q-btn--primary">
            <Trophy className="h-4 w-4" /> Back to subjects
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
    <div className="relative h-52 w-52">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} stroke="var(--muted)" strokeWidth="12" fill="none" />
        <circle
          cx="100" cy="100" r={r}
          stroke={pass ? "url(#ringGood)" : "var(--bad)"}
          strokeWidth="12" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <defs>
          <linearGradient id="ringGood" x1="0" x2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--gold)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-6xl font-semibold tracking-tight text-foreground tabular-nums" style={{ fontFamily: "var(--font-heading)" }}>{value}%</div>
          <div className="mt-1 text-xs font-semibold text-muted-foreground">Score</div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label, value, tone,
}: {
  label: string; value: number;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const dot =
    tone === "good" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--gold)" : "var(--primary)";
  return (
    <div className="q-stat">
      <div className="q-stat__label">
        <span className="q-stat__dot" style={{ background: dot }} /> {label}
      </div>
      <div className="q-stat__value">{value}</div>
    </div>
  );
}
