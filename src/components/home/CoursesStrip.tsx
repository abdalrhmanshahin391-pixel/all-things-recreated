import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { CourseCard } from "@/components/common/CourseCard";
import { useCourseOptions, yearLabel } from "@/lib/course-options";

type Course = {
  id: string;
  title: string;
  year: number | null;
  category: string | null;
  image_url: string | null;
  exam_type: string | null;
  price: number | null;
  currency: string | null;
  compare_at_price?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
};

type Counts = Record<string, { subjects: number; questions: number }>;


// One query for courses + their counts: the counts request used to wait for
// the courses render, which made the strip pop in twice.
export const homeCoursesQuery = queryOptions({
  queryKey: ["home-courses-strip"],
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
  queryFn: async (): Promise<{ courses: Course[]; counts: Counts }> => {
      const { data } = await supabase
        .from("courses")
        .select(
          "id, title, year, category, image_url, exam_type, price, currency, badge, badge_color, badge_expires_at, compare_at_price, discount_active, discount_ends_at",
        )
        .eq("published", true)
        .eq("show_on_home", true)
        .eq("admin_only", false)
        .eq("kind", "questions")
        .order("year", { ascending: true })
        .order("title", { ascending: true });
      const courses = (data ?? []) as Course[];
      const counts: Counts = {};
      if (courses.length > 0) {
        const { data: rows } = await supabase.rpc("get_course_real_counts", {
          _course_ids: courses.map((c) => c.id),
        });
        for (const r of (rows ?? []) as Array<{ course_id: string; subjects_count: number; questions_count: number }>) {
          counts[r.course_id] = {
            subjects: Number(r.subjects_count) || 0,
            questions: Number(r.questions_count) || 0,
          };
        }
      }
      return { courses, counts };
  },
});

export function CoursesStrip() {
  const { t } = useTranslation();
  const { data } = useQuery(homeCoursesQuery);
  const options = useCourseOptions();
  const courses = data?.courses ?? [];
  const counts = data?.counts ?? {};

  const byYear = useMemo(() => {
    const m = new Map<number, Course[]>();
    for (const c of courses) {
      const y = c.year ?? 0;
      if (!m.has(y)) m.set(y, []);
      m.get(y)!.push(c);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  if (courses.length === 0) return null;

  return (
    <section className="py-20 md:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: "var(--secondary)" }}>
            {t("cms.home.courses.eyebrow")}
          </p>
          <h2 className="font-display font-black text-foreground lowercase leading-[1.05]" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
            {t("cms.home.courses.title")}
          </h2>
        </div>

        <div className="space-y-14">
          {byYear.map(([year, list]) => (
            <div key={year}>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full text-white"
                  style={{
                    background: "var(--primary)",
                    boxShadow: "0 3px 0 color-mix(in oklab, var(--primary) 60%, black)",
                  }}
                >
                  {yearLabel(year, options, t("cms.home.courses.yearOther"))}
                </span>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {list.length === 1
                    ? t("cms.home.courses.countOne")
                    : t("cms.home.courses.countOther", { count: list.length })}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {list.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    counts={counts[c.id]}
                    showPrice={true}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
