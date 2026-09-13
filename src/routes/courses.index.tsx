import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCourseOptions,
  isAllYearsCourse,
  isZeroCourse,
  getYearSortPriority,
  hasSemesterSupport,
} from "@/lib/course-options";
import { useLang } from "@/components/LanguageProvider";
import {
  Stethoscope,
  Pill,
  Heart,
  Activity,
  Microscope,
  Syringe,
  Sparkles,
  Globe,
  GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { CourseCard } from "@/components/common/CourseCard";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Courses — AquaQBank" },
      {
        name: "description",
        content:
          "All AquaQBank Academy question bank courses for medical students, organized year by year with midterm and final question sets.",
      },
      { property: "og:title", content: "Courses — AquaQBank" },
      {
        property: "og:description",
        content:
          "All AquaQBank Academy question bank courses for medical students, organized year by year with midterm and final question sets.",
      },
      { property: "og:url", content: "https://aquaqbank.com/courses" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://aquaqbank.com/courses" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Courses — AquaQBank",
          description: "AquaQBank medical question bank courses by year.",
          url: "https://aquaqbank.com/courses",
        }),
      },
    ],
  }),
  component: CoursesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  semester?: number | null;
  price: number;
  currency: string | null;
  category: string;
  exam_type: string;
  image_url: string | null;
  subjects_count: number;
  questions_count_mid: number;
  questions_count_final: number;
  published: boolean;
  badge?: string | null;
  badge_color?: string | null;
  badge_expires_at?: string | null;
  compare_at_price?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
};

const YEAR_ICONS = [Stethoscope, Heart, Pill, Microscope, Activity, Syringe];

function CoursesPage() {
  const { t } = useTranslation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErrorMsg(null);
      let query = supabase
        .from("courses")
        .select("*")
        .eq("published", true)
        .eq("kind", "questions");
      // Courses flagged "admin only" in CoursesHub stay hidden from students.
      if (!isAdmin) query = query.eq("admin_only", false);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setErrorMsg("load-error");
        setCourses([]);
      } else {
        const list = (data as Course[]) ?? [];
        // Patch real counts from the DB so we never show stale 0 subjects / 0 questions.
        const ids = list.map((c) => c.id);
        if (ids.length > 0) {
          const { data: counts } = await (supabase.rpc as any)("get_course_real_counts", {
            _course_ids: ids,
          });
          const map = new Map<string, { subjects: number; questions: number }>();
          (counts ?? []).forEach((r: any) => {
            map.set(r.course_id, {
              subjects: Number(r.subjects_count) || 0,
              questions: Number(r.questions_count) || 0,
            });
          });
          for (const c of list) {
            const m = map.get(c.id);
            if (m) {
              c.subjects_count = m.subjects;
              // Stash full question total into the mid bucket; we sum mid+final downstream.
              c.questions_count_mid = m.questions;
              c.questions_count_final = 0;
            }
          }
        }
        setCourses(list);
      }
      setLoading(false);

    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setEnrolledIds(new Set());
      return;
    }
    (async () => {
      const { data: enr } = await supabase
        .from("user_courses")
        .select("course_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      setEnrolledIds(new Set((enr ?? []).map((r: { course_id: string }) => r.course_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const options = useCourseOptions();

  const byYear = useMemo(() => {
    const map = new Map<number, Course[]>();
    courses.forEach((c) => {
      if (!map.has(c.year)) map.set(c.year, []);
      map.get(c.year)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const pA = getYearSortPriority(a[0], options);
      const pB = getYearSortPriority(b[0], options);
      if (pA !== pB) return pA - pB;
      return a[0] - b[0];
    });
  }, [courses, options]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
      <main className="pt-24 pb-24">

        {/* Hero — institutional light with ECG accent */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <EcgLine className="absolute left-0 right-0 bottom-6 mx-auto w-[80%] h-16 text-accent/70" />
          </div>
          <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-16 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t("cms.coursesPage.badge")}
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-semibold tracking-tight text-foreground max-w-3xl">
              {t("cms.coursesPage.title")}
            </h1>
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl">
              {t("cms.coursesPage.subtitle")}
            </p>
          </div>
        </section>


        {/* Body */}
        <div className="mx-auto max-w-7xl px-6 md:px-10 mt-12">
          {loading ? (
            <SkeletonGrid />
          ) : errorMsg ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-6 py-10 text-center">
              {errorMsg === "load-error" ? t("cms.coursesPage.error") : errorMsg}
            </div>
          ) : courses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-14">
              {byYear.map(([year, list], idx) => (
                <CourseSection
                  key={year}
                  year={year}
                  courses={list}
                  enrolledIds={enrolledIds}
                  Icon={YEAR_ICONS[idx % YEAR_ICONS.length]}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      </MedicalPageBackdrop>
    </div>
  );
}

function ordinal(n: number) {
  const map: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th" };
  return map[n] ?? `${n}th`;
}

function CourseSection({
  year,
  courses,
  enrolledIds,
  Icon,
}: {
  year: number;
  courses: Course[];
  enrolledIds: Set<string>;
  Icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
}) {
  const { t } = useTranslation();
  const { lang } = useLang();
  const options = useCourseOptions();
  const isAllYears = isAllYearsCourse(year, options);
  const isZero = isZeroCourse(year, options);
  const canHaveSemester = hasSemesterSupport(year, options);
  const [semesterFilter, setSemesterFilter] = useState<"all" | 1 | 2>("all");

  // An admin-defined year label wins over the generic "Nth year" heading.
  const custom = options.year.find((o) => Number(o.value) === year);
  const SectionIcon = isAllYears ? Globe : isZero ? GraduationCap : Icon;

  const sectionTitle = isAllYears
    ? custom?.label || "For all years"
    : isZero
      ? custom?.label || "Zero Course"
      : custom
        ? custom.label
        : t("cms.coursesPage.yearHeading", { ordinal: ordinal(year) });

  const displayedCourses = useMemo(() => {
    if (!canHaveSemester || semesterFilter === "all") return courses;
    return courses.filter((c) => c.semester === semesterFilter);
  }, [courses, canHaveSemester, semesterFilter]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div
            className={`grid place-items-center h-9 w-9 rounded-lg ${
              isAllYears
                ? "bg-amber-500/10 text-amber-500"
                : isZero
                  ? "bg-purple-500/10 text-purple-500"
                  : "bg-muted text-primary"
            }`}
          >
            <SectionIcon size={18} strokeWidth={2} />
          </div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            {sectionTitle}
          </h2>
          <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground bg-card border border-border rounded-full px-2.5 py-1">
            {displayedCourses.length === 1
              ? t("cms.coursesPage.countOne")
              : t("cms.coursesPage.countOther", { count: displayedCourses.length })}
          </span>
        </div>

        {canHaveSemester && (
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border text-xs font-medium shadow-sm">
            <button
              type="button"
              onClick={() => setSemesterFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                semesterFilter === "all"
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang === "ar" ? "الكل" : "All"}
            </button>
            <button
              type="button"
              onClick={() => setSemesterFilter(1)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                semesterFilter === 1
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang === "ar" ? "الفصل الأول" : "1st Semester"}
            </button>
            <button
              type="button"
              onClick={() => setSemesterFilter(2)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                semesterFilter === 2
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang === "ar" ? "الفصل الثاني" : "2nd Semester"}
            </button>
          </div>
        )}
      </div>

      {displayedCourses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 py-12 text-center text-sm text-muted-foreground">
          {lang === "ar"
            ? "لا توجد دورات مضافة لهذا الفصل بعد"
            : "No courses available for this semester yet."}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {displayedCourses.map((c) => {
            const active = enrolledIds.has(c.id);
            const total = (c.questions_count_mid ?? 0) + (c.questions_count_final ?? 0);
            return (
              <CourseCard
                key={c.id}
                course={{
                  id: c.id,
                  title: c.title,
                  year: c.year,
                  semester: c.semester,
                  category: c.category,
                  image_url: c.image_url,
                  price: c.price,
                  currency: c.currency,
                  badge: c.badge,
                  badge_color: c.badge_color,
                  badge_expires_at: c.badge_expires_at,
                  compare_at_price: c.compare_at_price,
                  discount_active: c.discount_active,
                  discount_ends_at: c.discount_ends_at,
                }}
                counts={{ subjects: c.subjects_count ?? 0, questions: total }}
                unlocked={active}
                showPrice
              />
            );
          })}
        </div>
      )}
    </section>
  );
}



function FloatingGlyphCard({
  Icon,
  color,
  delay,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  color: string;
  delay: string;
}) {
  return (
    <div
      className={`grid place-items-center h-[110px] rounded-2xl bg-white/90 backdrop-blur-md border border-white shadow-lg ${color} doc-float`}
      style={{ animationDelay: delay }}
    >
      <Icon size={36} strokeWidth={1.8} />
    </div>
  );
}

function EcgLine({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 80"
      preserveAspectRatio="none"
      className={className}
      fill="none"
    >
      <path
        d="M0 40 H300 L320 40 L335 10 L355 70 L375 25 L395 55 L415 40 H700 L720 40 L735 5 L755 75 L775 30 L795 50 L815 40 H1200"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ecg-draw"
      />
    </svg>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="medical-card overflow-hidden">
          <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-3 bg-muted rounded w-2/3 mx-auto animate-pulse" />
            <div className="h-9 bg-muted rounded-xl animate-pulse mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="medical-card text-center py-16 px-6">
      <div className="grid place-items-center mx-auto h-16 w-16 rounded-2xl bg-indigo-50 text-indigo-600 mb-4">
        <Sparkles size={28} />
      </div>
      <div className="text-lg font-bold text-foreground">{t("cms.coursesPage.emptyTitle")}</div>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        {t("cms.coursesPage.emptyBody")}
      </p>
    </div>
  );
}
