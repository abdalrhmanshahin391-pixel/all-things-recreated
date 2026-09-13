import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BookOpen,
  Timer,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Lock,
  ShieldCheck,
  FileText,
  Stethoscope,
  Pill,
  Heart,
  Sparkles,
  Flag,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { setSubjectAccess, setSubjectOrdered, type SubjectAccess } from "@/lib/subjects.functions";
import { AdminBackupControls } from "@/components/course/AdminBackupControls";
import { CourseSessionGuide, LiveTourButtonTrigger } from "@/components/course/CourseSessionGuide";
import { LiveCourseTour } from "@/components/course/LiveCourseTour";
import { useLang } from "@/components/LanguageProvider";
import { ensureFreeEnrollment } from "@/lib/course-access";
import { toast } from "sonner";
import { ProtectionNotice } from "@/components/protect/ProtectionNotice";

export const Route = createFileRoute("/courses/$courseId/")({
  loader: async ({ params }) => {
    try {
      const { data } = await supabase
        .from("courses")
        .select("title,year")
        .eq("id", params.courseId)
        .maybeSingle();
      return { title: (data?.title as string | undefined) ?? null, year: (data?.year as number | undefined) ?? null };
    } catch {
      return { title: null, year: null };
    }
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.title ?? "Course";
    const title = `${name} — AquaQBank`;
    const description = loaderData?.title
      ? `${name}${loaderData.year ? ` (year ${loaderData.year})` : ""} question bank on AquaQBank Academy for medical students, with midterm and final practice questions.`
      : "AquaQBank Academy medical question bank course.";
    const url = `https://aquaqbank.com/courses/${params.courseId}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Course",
            name,
            description,
            url,
            provider: { "@type": "Organization", name: "AquaQBank", url: "https://aquaqbank.com/" },
          }),
        },
      ],
    };
  },
  component: CourseDetailPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  currency?: string;
  paddle_price_id?: string | null;
  exam_type: string;
  image_url: string | null;
  subjects_count: number;
  questions_count_mid: number;
  questions_count_final: number;
  published: boolean;
  compare_at_price?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  badge?: string | null;
  badge_color?: string | null;
  badge_expires_at?: string | null;
};

type Group = { id: string; name: string; sort_order: number };
type Subject = {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  question_count: number;
  access_level: SubjectAccess;
  ordered: boolean;
};

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { lang } = useLang();
  const isArabic = lang === "ar";
  const [liveTourOpen, setLiveTourOpen] = useState(false);
  const updateAccess = useServerFn(setSubjectAccess);
  const updateOrdered = useServerFn(setSubjectOrdered);

  const [course, setCourse] = useState<Course | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [flaggedBySubject, setFlaggedBySubject] = useState<Record<string, number>>({});
  const [incorrectBySubject, setIncorrectBySubject] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timed, setTimed] = useState(false);
  const [durationMin, setDurationMin] = useState(60);
  const [pool, setPool] = useState<"all" | "flagged" | "incorrect">("all");
  const [adminSelected, setAdminSelected] = useState<Set<string>>(new Set());
  const [adminBusy, setAdminBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      // If this is a lectures-kind course, send the user to the lectures page.
      if (c && (c as any).kind === "lectures") {
        navigate({ to: "/lectures/$courseId", params: { courseId: (c as any).id }, replace: true });
        return;
      }
      setCourse(c as Course | null);


      const { data: g } = await (supabase.from as any)("subject_groups")
        .select("id,name,sort_order")
        .eq("course_id", courseId)
        .order("sort_order");
      const gs = (g ?? []) as Group[];
      setGroups(gs);
      setOpenGroups(Object.fromEntries(gs.map((x) => [x.id, false])));
      if (gs.length) {
        const { data: s } = await (supabase.from as any)("subjects")
          .select("id,group_id,name,sort_order,access_level,ordered")
          .in(
            "group_id",
            gs.map((x) => x.id),
          )
          .order("sort_order");
        const rawSubs = (s ?? []) as any[];
        const subjectIds = rawSubs.map((row) => row.id as string);
        let countsBySubject = new Map<string, number>();
        if (subjectIds.length) {
          const { data: counts } = await (supabase as any).rpc("get_subject_question_counts", { _subject_ids: subjectIds });
          countsBySubject = new Map<string, number>(
            ((counts ?? []) as { subject_id: string; cnt: number }[]).map((r) => [r.subject_id, Number(r.cnt) || 0]),
          );
        }
        const subs: Subject[] = rawSubs.map((row) => ({
          id: row.id,
          group_id: row.group_id,
          name: row.name,
          sort_order: row.sort_order,
          access_level: (row.access_level ?? "paid") as SubjectAccess,
          ordered: Boolean(row.ordered),
          question_count: countsBySubject.get(row.id) ?? 0,
        }));
        setSubjects(subs);
      } else {
        setSubjects([]);
      }
      setLoading(false);
    })();
  }, [courseId]);

  useEffect(() => {
    (async () => {
      if (!user?.id || subjects.length === 0) {
        setFlaggedBySubject({});
        setIncorrectBySubject({});
        return;
      }
      const subjectIds = subjects.map((s) => s.id);
      const { data: qRows } = await (supabase.from as any)("questions")
        .select("id,subject_id")
        .in("subject_id", subjectIds);
      const qToSubject = new Map<string, string>(
        ((qRows ?? []) as any[]).map((r) => [r.id, r.subject_id]),
      );
      const courseQids = Array.from(qToSubject.keys());
      if (courseQids.length === 0) return;
      const [{ data: flagRows }, { data: attemptRows }] = await Promise.all([
        (supabase.from as any)("question_flags")
          .select("question_id")
          .eq("user_id", user.id)
          .in("question_id", courseQids),
        (supabase.from as any)("question_attempts")
          .select("question_id")
          .eq("user_id", user.id)
          .eq("is_correct", false)
          .in("question_id", courseQids),
      ]);
      const flagged: Record<string, number> = {};
      for (const r of (flagRows ?? []) as any[]) {
        const sid = qToSubject.get(r.question_id);
        if (sid) flagged[sid] = (flagged[sid] ?? 0) + 1;
      }
      const wrongSet = new Set<string>(
        ((attemptRows ?? []) as any[]).map((r) => r.question_id),
      );
      const incorrect: Record<string, number> = {};
      for (const qid of wrongSet) {
        const sid = qToSubject.get(qid);
        if (sid) incorrect[sid] = (incorrect[sid] ?? 0) + 1;
      }
      setFlaggedBySubject(flagged);
      setIncorrectBySubject(incorrect);
    })();
  }, [user?.id, subjects]);

  useEffect(() => {
    if (!user?.id) {
      setEnrolled(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_courses")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();
      if (!data && course && (Number(course.price) || 0) <= 0) {
        await ensureFreeEnrollment(user.id, courseId, "questions");
        if (!cancelled) setEnrolled(true);
        return;
      }
      if (!cancelled) setEnrolled(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, courseId, course?.price]);

  const isFree = (course?.price ?? 0) <= 0;

  /** A discount counts only while it is switched on, cheaper than the original, and not expired. */
  const discountLive =
    !!course &&
    !!course.discount_active &&
    !!course.compare_at_price &&
    Number(course.compare_at_price) > Number(course.price ?? 0) &&
    (!course.discount_ends_at || new Date(course.discount_ends_at).getTime() > Date.now());
  const wasPrice = discountLive ? Number(course!.compare_at_price) : null;
  const isSubjectLocked = (s: Subject) => {
    if (enrolled || isFree) return false;
    if (s.access_level === "free_public") return false;
    if (s.access_level === "free_logged_in" && user) return false;
    return true;
  };

  const countFor = (s: Subject) =>
    pool === "flagged"
      ? (flaggedBySubject[s.id] ?? 0)
      : pool === "incorrect"
        ? (incorrectBySubject[s.id] ?? 0)
        : s.question_count;

  const totalQuestions = useMemo(
    () =>
      subjects
        .filter((s) => selected.size === 0 || selected.has(s.id))
        .filter((s) => !isSubjectLocked(s))
        .reduce((a, s) => a + countFor(s), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjects, selected, pool, flaggedBySubject, incorrectBySubject, enrolled, isAdmin, user],
  );

  const totalSubjectsCount = subjects.length;
  const totalQuestionsCount = useMemo(
    () => subjects.reduce((a, s) => a + s.question_count, 0),
    [subjects],
  );

  const anySelectedLocked = useMemo(() => {
    if (selected.size === 0) {
      return subjects.some((s) => isSubjectLocked(s));
    }
    return subjects.filter((s) => selected.has(s.id)).some((s) => isSubjectLocked(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, selected, enrolled, isAdmin, user]);

  const toggleSubject = (s: Subject) => {
    if (isSubjectLocked(s)) {
      if (!user) {
        navigate({ to: "/login" });
      } else {
        navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
      }
      return;
    }
    const next = new Set(selected);
    if (next.has(s.id)) next.delete(s.id);
    else next.add(s.id);
    setSelected(next);
  };

  const firstFreeSubject = useMemo(
    () => subjects.find((s) => !isSubjectLocked(s)) || subjects[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjects, enrolled, isFree, user],
  );

  const handleStartLiveTour = () => {
    if (firstFreeSubject) {
      setOpenGroups((prev) => ({ ...prev, [firstFreeSubject.group_id]: true }));
      if (!enrolled) {
        setSelected(new Set([firstFreeSubject.id]));
      }
    }
    setLiveTourOpen(true);
  };

  const startSession = (mode: "study" | "session" | "exam") => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (anySelectedLocked && !enrolled) {
      navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
      return;
    }
    const subjectIds = selected.size ? Array.from(selected).join(",") : "all";
    navigate({
      to: "/courses/$courseId/run",
      params: { courseId },
      search: {
        mode,
        subjects: subjectIds,
        timed: timed && mode === "exam" ? 1 : 0,
        duration: timed && mode === "exam" ? durationMin : 0,
        pool,
      },
    });
  };

  const handleToggleOrdered = async (subjectId: string, next: boolean) => {
    const prev = subjects;
    setSubjects((cur) => cur.map((s) => (s.id === subjectId ? { ...s, ordered: next } : s)));
    try {
      await updateOrdered({ data: { subjectId, ordered: next } });
      toast.success(next ? "Questions will stay in order" : "Order lock removed");
    } catch (e: any) {
      setSubjects(prev);
      toast.error(e?.message ?? "Failed to update");
    }
  };

  const handleSetAccess = async (subjectId: string, level: SubjectAccess) => {
    const prev = subjects;
    setSubjects((cur) =>
      cur.map((s) => (s.id === subjectId ? { ...s, access_level: level } : s)),
    );
    try {
      await updateAccess({ data: { subjectId, accessLevel: level } });
      toast.success("Access updated");
    } catch (e: any) {
      setSubjects(prev);
      toast.error(e?.message ?? "Failed to update access");
    }
  };

  const handleBulkSetAccess = async (level: SubjectAccess) => {
    const ids = Array.from(adminSelected);
    if (ids.length === 0) {
      toast.error("Select at least one subject first");
      return;
    }
    setAdminBusy(true);
    const prev = subjects;
    setSubjects((cur) =>
      cur.map((s) => (adminSelected.has(s.id) ? { ...s, access_level: level } : s)),
    );
    try {
      await Promise.all(
        ids.map((id) => updateAccess({ data: { subjectId: id, accessLevel: level } })),
      );
      toast.success(`Updated ${ids.length} subject${ids.length > 1 ? "s" : ""} → ${level.replace("_", " ")}`);
      setAdminSelected(new Set());
    } catch (e: any) {
      setSubjects(prev);
      toast.error(e?.message ?? "Bulk update failed");
    } finally {
      setAdminBusy(false);
    }
  };

  const toggleAdminSelected = (id: string) => {
    setAdminSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAdminSelectAll = () => {
    if (adminSelected.size === subjects.length) {
      setAdminSelected(new Set());
    } else {
      setAdminSelected(new Set(subjects.map((s) => s.id)));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-7xl px-6 pt-28 pb-24">
          <div className="h-10 w-64 rounded-lg bg-muted animate-pulse mb-6" />
          <div className="h-32 rounded-2xl bg-muted animate-pulse mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
            <div className="h-80 rounded-2xl bg-muted animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <div className="pt-32 text-center text-muted-foreground">Course not found.</div>
      </div>
    );
  }

  const groupedSubjects = groups.map((g) => ({
    group: g,
    items: subjects.filter((s) => s.group_id === g.id),
  }));

  const showPaywall = !enrolled && !isAdmin && !isFree && (course.paddle_price_id || (course.price ?? 0) > 0);
  const locked = showPaywall;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-7xl px-6 md:px-10 pt-24 pb-24">
        {/* Header band */}
        <section className="relative overflow-hidden rounded-lg bg-card border border-border px-6 md:px-10 py-8 md:py-10 mb-8 shadow-[var(--shadow-card)]">
          {isAdmin && (
            <div className="absolute right-6 bottom-6 z-10">
              <AdminBackupControls
                courseId={courseId}
                courseTitle={course.title}
                onImported={() => window.location.reload()}
              />
            </div>
          )}

          <Link
            to="/courses"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            ← All courses
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground bg-background border border-border rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Year {course.year}{(course as any).semester ? ` · Sem ${(course as any).semester}` : ""} · {course.exam_type ?? "Mid + Final"}
            </span>
            {enrolled && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent bg-accent/10 border border-accent/30 rounded-full px-3 py-1">
                <ShieldCheck className="w-3 h-3" /> Enrolled
              </span>
            )}
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight capitalize text-foreground">
            {course.title}
          </h1>

          <p className="mt-2 text-muted-foreground max-w-xl">
            Curated exam-ready bank — covering all subjects, mid & final question pools, with
            step-by-step explanations.
          </p>

          {/* Stat chips */}
          <div className="mt-6 flex flex-wrap gap-2">
            <StatPill icon={<BookOpen className="w-3.5 h-3.5" />} label="Subjects" value={String(totalSubjectsCount || course.subjects_count || 0)} />
            <StatPill icon={<FileText className="w-3.5 h-3.5" />} label="Questions" value={String(totalQuestionsCount || (course.questions_count_mid + course.questions_count_final))} />
            <StatPill icon={<Timer className="w-3.5 h-3.5" />} label="Mid" value={String(course.questions_count_mid)} />
            <StatPill icon={<Sparkles className="w-3.5 h-3.5" />} label="Final" value={String(course.questions_count_final)} />
          </div>
        </section>

        {/* Lock banner */}
        {showPaywall && (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6 mb-8 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative w-12 h-12 shrink-0 aurora-ring">
                  <div className="relative z-10 w-12 h-12 rounded-full bg-background border border-border grid place-items-center shadow-sm">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-foreground">
                    You're not subscribed to this course yet
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Preview the curriculum below. Unlock full question banks and study mode in one click.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/packages"
                  className="px-4 py-2.5 rounded-xl border border-border bg-background text-foreground font-semibold text-sm hover:border-primary hover:text-primary transition-colors"
                >
                  See packages
                </Link>
                <button
                  onClick={() => navigate({ to: "/courses/$courseId/checkout", params: { courseId } })}
                  className="magnetic-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm"
                >
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {discountLive && (
                      <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: course!.discount_ends_at ? "#8b5cf6" : "#f43f5e" }}>
                        {course!.discount_ends_at ? "LIMITED" : "HOT OFFER"}
                      </span>
                    )}
                    {discountLive && <s className="text-white/60 font-medium">${wasPrice!.toFixed(0)}</s>}
                    Unlock · ${Number(course?.price ?? 0).toFixed(0)}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              </div>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              Secure · Paddle MoR · Instant access
            </div>
          </div>
        )}

        <ProtectionNotice className="mb-6" />

        {/* Course Session Guide Banner */}
        <CourseSessionGuide
          showInlineBanner={true}
          onStartTour={handleStartLiveTour}
          className="mb-8"
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* LEFT — curriculum */}
          <section>
            {isAdmin && (
              <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold uppercase tracking-widest text-indigo-700">Admin</span>
                    <span className="text-muted-foreground">
                      {adminSelected.size} of {subjects.length} ticked
                    </span>
                    <button
                      onClick={toggleAdminSelectAll}
                      className="ml-2 text-[11px] underline text-muted-foreground hover:text-foreground"
                    >
                      {adminSelected.size === subjects.length ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Set access:</span>
                    <button disabled={adminBusy} onClick={() => handleBulkSetAccess("free_public")} className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-200 disabled:opacity-50">Public</button>
                    <button disabled={adminBusy} onClick={() => handleBulkSetAccess("free_logged_in")} className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700 ring-1 ring-sky-300 hover:bg-sky-200 disabled:opacity-50">Logged-in</button>
                    <button disabled={adminBusy} onClick={() => handleBulkSetAccess("paid")} className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 hover:bg-indigo-200 disabled:opacity-50">Paid</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest font-bold text-indigo-600">Curriculum</div>
                <h2 className="text-xl font-bold text-foreground">Subjects · {selected.size} selected</h2>
              </div>
              {groupedSubjects.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setOpenGroups(Object.fromEntries(groups.map((g) => [g.id, true])))}
                    className="text-muted-foreground hover:text-indigo-600 hover:underline font-semibold transition-colors"
                  >
                    Expand all
                  </button>
                  <span className="text-muted-foreground/40">•</span>
                  <button
                    type="button"
                    onClick={() => setOpenGroups(Object.fromEntries(groups.map((g) => [g.id, false])))}
                    className="text-muted-foreground hover:text-indigo-600 hover:underline font-semibold transition-colors"
                  >
                    Collapse all
                  </button>
                </div>
              )}
            </div>

            <div className={`relative space-y-3 ${locked ? "lock-veil" : ""}`}>
              {groupedSubjects.length === 0 && (
                <div className="medical-card p-8 text-center text-muted-foreground text-sm">
                  No subjects yet for this course.
                </div>
              )}
              {groupedSubjects.map(({ group, items }, gi) => {
                const open = Boolean(openGroups[group.id]);
                const selectedCount = items.filter((s) => selected.has(s.id)).length;
                const GroupIcon = [Stethoscope, Pill, Heart, BookOpen][gi % 4];
                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((p) => ({ ...p, [group.id]: !p[group.id] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-card border border-border rounded-xl hover:border-indigo-300 transition-colors"
                      aria-expanded={open}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-1 h-8 rounded-full bg-primary" />
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 grid place-items-center shrink-0">
                          <GroupIcon className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="text-left min-w-0">
                          <div className="font-bold text-foreground text-sm md:text-base truncate">{group.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {selectedCount} of {items.length} subjects selected
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden sm:inline-flex text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                          {items.length} {items.length === 1 ? "subject" : "subjects"}
                        </span>
                        {open
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {open && (
                      <div className="mt-2 space-y-1.5">
                        {items.length === 0 && (
                          <div className="px-6 py-3 text-xs text-muted-foreground italic">No subjects in this group.</div>
                        )}
                        {items.map((s, idx) => {
                          const sLocked = isSubjectLocked(s);
                          const isSelected = selected.has(s.id);
                          const flaggedCount = flaggedBySubject[s.id] ?? 0;
                          const wrongCount = incorrectBySubject[s.id] ?? 0;
                          const isTourSubject = !enrolled && firstFreeSubject ? s.id === firstFreeSubject.id : s.id === subjects[0]?.id;
                          return (
                            <div
                              key={s.id}
                              className="subject-row"
                              data-locked={sLocked}
                              data-tour={isTourSubject ? "tour-subject" : undefined}
                            >
                              <span className="text-[11px] font-bold text-muted-foreground tabular-nums w-6">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              {sLocked ? (
                                <span className="w-5 h-5 rounded-md bg-muted grid place-items-center">
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  className="cb-indigo"
                                  checked={isSelected}
                                  onChange={() => toggleSubject(s)}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => toggleSubject(s)}
                                className="flex-1 text-left min-w-0"
                              >
                                <div className="font-semibold text-foreground truncate">{s.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {s.question_count} {s.question_count === 1 ? "question" : "questions"}
                                  {!sLocked && user && (flaggedCount > 0 || wrongCount > 0) && (
                                    <span className="ml-2 inline-flex items-center gap-2">
                                      {flaggedCount > 0 && (
                                        <span className="inline-flex items-center gap-1 text-rose-600">
                                          <Flag className="w-3 h-3" /> {flaggedCount}
                                        </span>
                                      )}
                                      {wrongCount > 0 && (
                                        <span className="inline-flex items-center gap-1 text-amber-600">
                                          <XCircle className="w-3 h-3" /> {wrongCount}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {!sLocked && user && flaggedCount > 0 && (
                                <Link
                                  to="/summaries/new"
                                  search={{ source: "flags", courseId, subjectId: s.id }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-full bg-rose-50 hover:bg-rose-100 shrink-0"
                                  title="Make a summary from your red-flagged questions in this subject"
                                >
                                  <Sparkles className="w-3 h-3" /> Flag summary
                                </Link>
                              )}


                              {isAdmin ? (
                                <div className="flex items-center gap-2 pl-3 ml-1 border-l border-border">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Admin</span>
                                  <label className="inline-flex items-center gap-1 cursor-pointer" title="Tick to include in bulk access change">
                                    <input
                                      type="checkbox"
                                      aria-label="Admin bulk select"
                                      checked={adminSelected.has(s.id)}
                                      onChange={() => toggleAdminSelected(s.id)}
                                      className="cb-indigo"
                                    />
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Bulk</span>
                                  </label>
                                  <AccessStatePill value={s.access_level} />
                                  <AccessToggle value={s.access_level} onChange={(v) => handleSetAccess(s.id, v)} />
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleToggleOrdered(s.id, !s.ordered); }}
                                    title="Keep these questions together and in order (cases)"
                                    className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 border transition-colors ${
                                      s.ordered
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-card text-muted-foreground border-border hover:border-indigo-300"
                                    }`}
                                  >
                                    In order
                                  </button>
                                </div>
                              ) : sLocked ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted border border-border rounded-full px-2 py-1">
                                  Locked
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-muted-foreground tabular-nums shrink-0">
                                  {countFor(s)} Q
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* RIGHT — session panel */}
          <aside className="lg:sticky lg:top-24 self-start">
            <div className="medical-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-foreground">
                    {isArabic ? "بدء جلسة أو امتحان" : "Start a session"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <LiveTourButtonTrigger onClick={handleStartLiveTour} isArabic={isArabic} />
                </div>
              </div>

              {locked && !liveTourOpen && (selected.size === 0 || anySelectedLocked) ? (
                <div className="p-6 text-center">
                  <div className="mx-auto w-12 h-12 aurora-ring mb-4">
                    <div className="relative z-10 w-12 h-12 rounded-full bg-card border border-indigo-200 grid place-items-center mx-auto">
                      <Lock className="w-5 h-5 text-indigo-600" />
                    </div>
                  </div>
                  <div className="font-bold text-foreground">Subscribe to start sessions</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick study, session, or exam mode after unlocking the course.
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground font-semibold">
                    {totalSubjectsCount} subjects · {totalQuestionsCount} questions
                  </div>
                  <button
                    onClick={() => navigate({ to: "/courses/$courseId/checkout", params: { courseId } })}
                    className="magnetic-cta mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm"
                  >
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {discountLive && (
                        <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white"
                          style={{ background: course!.discount_ends_at ? "#8b5cf6" : "#f43f5e" }}>
                          {course!.discount_ends_at ? "LIMITED" : "HOT OFFER"}
                        </span>
                      )}
                      {discountLive && <s className="text-white/60 font-medium">${wasPrice!.toFixed(0)}</s>}
                      Unlock · ${Number(course.price ?? 0).toFixed(0)} <ArrowRight className="w-4 h-4" />
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Selection summary */}
                  {(() => {
                    const totalCourseQ = (course.questions_count_mid ?? 0) + (course.questions_count_final ?? 0);
                    const midRatio = totalCourseQ > 0 ? (course.questions_count_mid ?? 0) / totalCourseQ : 0.5;
                    const midShare = Math.round(totalQuestions * midRatio);
                    const finalShare = Math.max(0, totalQuestions - midShare);
                    const estMin = Math.max(1, Math.round(totalQuestions * 0.9));
                    return (
                      <div className="px-5 py-3 border-b border-border bg-muted">
                        <div className="flex items-center gap-1.5 mb-2">
                          {[
                            { label: "Q", value: totalQuestions },
                            { label: "Mid", value: midShare },
                            { label: "Final", value: finalShare },
                          ].map((c) => (
                            <span key={c.label} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-card border border-border rounded-lg px-2 py-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.label}</span>
                              <span className="text-sm font-extrabold text-foreground tabular-nums">{c.value}</span>
                            </span>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <Row label="Subjects" value={selected.size === 0 ? "All accessible" : `${selected.size} of ${totalSubjectsCount}`} />
                          <Row label={timed ? "Timer" : "Est. time"} value={timed ? `${durationMin} min` : `~${estMin} min`} />
                        </div>
                      </div>
                    );
                  })()}

                  <div className="px-5 py-3 space-y-3 text-sm">
                    <div data-tour="tour-timed" className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Timer className="w-4 h-4 text-indigo-600" />
                          <span className="font-semibold text-muted-foreground">
                            {isArabic ? "امتحان بوقت محدد" : "Timed (Exam)"}
                          </span>
                        </div>
                        <button
                          onClick={() => setTimed((v) => !v)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${timed ? "bg-indigo-600" : "bg-muted"}`}
                          aria-label="Toggle timed mode"
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${timed ? "translate-x-5" : ""}`} />
                        </button>
                      </div>
                      {timed && (
                        <div className="flex flex-wrap gap-1.5">
                          {[15, 30, 60, 90, 120].map((m) => (
                            <button
                              key={m}
                              onClick={() => setDurationMin(m)}
                              className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                                durationMin === m
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "border-border text-muted-foreground hover:border-indigo-300"
                              }`}
                            >
                              {m < 60 ? `${m}m` : `${m / 60}h${m % 60 ? ` ${m % 60}m` : ""}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div data-tour="tour-pool">
                      <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                        {isArabic ? "مجموعة الأسئلة" : "Question pool"}
                      </div>
                      <div className="segmented w-full">
                        {(["all", "flagged", "incorrect"] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPool(p)}
                            data-active={pool === p}
                            className="flex-1"
                          >
                            {p === "all" ? (isArabic ? "الكل" : "All") : p === "flagged" ? (isArabic ? "المعلمة" : "Flagged") : (isArabic ? "الأخطاء" : "Wrong")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div data-tour="tour-modes" className="px-5 pb-5 space-y-2">
                    <button
                      onClick={() => startSession("study")}
                      className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-700 font-bold text-sm hover:bg-indigo-50 transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <BookOpen className="w-4 h-4" /> {isArabic ? "نمط المراجعة (Study)" : "Study mode"}
                    </button>
                    <button
                      onClick={() => startSession("session")}
                      className="magnetic-cta w-full py-3 rounded-xl text-white font-bold text-sm inline-flex items-center justify-center gap-2"
                    >
                      <span className="relative z-10 inline-flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> {isArabic ? "نمط التدريب (Session)" : "Session mode"}
                      </span>
                    </button>
                    <button
                      onClick={() => startSession("exam")}
                      className="w-full py-2.5 rounded-xl bg-foreground text-white font-bold text-sm hover:opacity-90 transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <Timer className="w-4 h-4" /> {isArabic ? "نمط الامتحان (Exam)" : "Exam mode"}
                    </button>
                    <button
                      onClick={() => { setSelected(new Set()); setTimed(false); }}
                      className="w-full py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted text-xs font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {isArabic ? "إعادة ضبط" : "Reset"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>

        <LiveCourseTour
          isOpen={liveTourOpen}
          onClose={() => setLiveTourOpen(false)}
          isArabic={isArabic}
          isEnrolled={enrolled}
          freeSubjectName={firstFreeSubject?.name}
          onSelectFreeSubject={() => {
            if (firstFreeSubject) {
              setSelected(new Set([firstFreeSubject.id]));
            }
          }}
        />
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground truncate">{value}</span>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 bg-card border border-border rounded-full pl-3 pr-4 py-1.5 shadow-sm">
      <span className="text-indigo-600">{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function AccessStatePill({ value }: { value: SubjectAccess }) {
  const map: Record<SubjectAccess, { label: string; cls: string; dot: string }> = {
    free_public: { label: "Public", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    free_logged_in: { label: "Logged-in", cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
    paid: { label: "Paid", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  };
  const v = map[value];
  return (
    <span className={`hidden lg:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${v.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

function AccessToggle({
  value,
  onChange,
}: {
  value: SubjectAccess;
  onChange: (v: SubjectAccess) => void;
}) {
  const opts: { key: SubjectAccess; label: string; cls: string }[] = [
    { key: "free_public", label: "Public", cls: "bg-emerald-100 text-emerald-700 ring-emerald-300" },
    { key: "free_logged_in", label: "Logged-in", cls: "bg-sky-100 text-sky-700 ring-sky-300" },
    { key: "paid", label: "Paid", cls: "bg-indigo-100 text-indigo-700 ring-indigo-300" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted ring-1 ring-border p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(o.key); }}
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ring-1 transition-colors ${
            value === o.key ? o.cls : "ring-transparent text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
          title={`Set access: ${o.label}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

