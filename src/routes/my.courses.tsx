import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GraduationCap, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { CourseCard } from "@/components/common/CourseCard";
import { useCourseOptions, yearLabel } from "@/lib/course-options";

export const Route = createFileRoute("/my/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — AquaQBank" },
      { name: "description", content: "Courses you've unlocked across your universities." },
    ],
  }),
  component: MyCoursesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  image_url: string | null;
  university_id: string;
  category: string | null;
  currency?: string | null;
  badge?: string | null;
  badge_color?: string | null;
  badge_expires_at?: string | null;
  compare_at_price?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
};

type Counts = Record<string, { subjects: number; questions: number }>;


function MyCoursesPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const options = useCourseOptions();
  const [courses, setCourses] = useState<Course[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      let courseIds: string[] | null = null;
      if (!isAdmin) {
        const [direct, pkgs] = await Promise.all([
          supabase.from("user_courses").select("course_id").eq("user_id", user.id),
          supabase
            .from("package_purchases")
            .select("package_id,buyer_id,member_user_ids")
            .or(`buyer_id.eq.${user.id},member_user_ids.cs.{${user.id}}`),
        ]);
        const ids = new Set<string>((direct.data ?? []).map((r: any) => r.course_id));
        const pkgIds = (pkgs.data ?? []).map((r: any) => r.package_id);
        if (pkgIds.length) {
          const { data: pkgCourses } = await (supabase.from as any)("package_courses")
            .select("course_id")
            .in("package_id", pkgIds);
          (pkgCourses ?? []).forEach((r: any) => ids.add(r.course_id));
        }
        courseIds = Array.from(ids);
        if (courseIds.length === 0) {
          if (!cancelled) {
            setCourses([]);
            setLoading(false);
          }
          return;
        }
      }

      let q = supabase
        .from("courses")
        .select(
          "id,title,year,price,image_url,university_id,category,badge,badge_color,badge_expires_at,currency,compare_at_price,discount_active,discount_ends_at",
        )
        .eq("kind", "questions")
        .eq("published", true);
      if (courseIds) q = q.in("id", courseIds);
      const { data: cs } = await q.order("year");
      const list = ((cs ?? []) as Course[]);

      let ctMap: Counts = {};
      if (list.length > 0) {
        const { data } = await supabase.rpc("get_course_real_counts", {
          _course_ids: list.map((c) => c.id),
        });
        for (const r of (data ?? []) as Array<{ course_id: string; subjects_count: number; questions_count: number }>) {
          ctMap[r.course_id] = {
            subjects: Number(r.subjects_count) || 0,
            questions: Number(r.questions_count) || 0,
          };
        }
      }

      if (!cancelled) {
        setCourses(list);
        setCounts(ctMap);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, authLoading]);

  const byYear = useMemo(() => {
    const m = new Map<number, Course[]>();
    courses.forEach((c) => {
      const y = c.year ?? 0;
      if (!m.has(y)) m.set(y, []);
      m.get(y)!.push(c);
    });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
        <main className="pt-24 pb-24">
          <section className="border-b border-border">
            <div className="mx-auto max-w-7xl px-6 md:px-10 py-14">
              <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Your library
              </span>
              <h1 className="mt-5 text-4xl md:text-5xl font-semibold tracking-tight">My Courses</h1>
              <p className="mt-3 text-muted-foreground max-w-2xl">
                Every question-bank course you've unlocked, grouped by year.
              </p>
            </div>
          </section>

          <div className="mx-auto max-w-7xl px-6 md:px-10 mt-10">
            {loading ? (
              <Skeleton />
            ) : courses.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-14">
                {byYear.map(([year, list]) => (
                  <section key={year}>
                    <div className="flex items-center gap-3 mb-6">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full text-white"
                        style={{
                          background: "var(--primary)",
                          boxShadow: "0 3px 0 color-mix(in oklab, var(--primary) 60%, black)",
                        }}
                      >
                        <GraduationCap size={14} strokeWidth={2.5} />
                        {yearLabel(year, options)}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {list.length} course{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                      {list.map((c) => (
                        <CourseCard
                          key={c.id}
                          course={c}
                          counts={counts[c.id]}
                          actionLabel="Go to my course"
                          unlocked
                          showPrice
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </main>
      </MedicalPageBackdrop>
    </div>
  );
}


function Skeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-[#e5e5e5] bg-white overflow-hidden">
          <div className="aspect-[4/3] bg-muted animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-7 bg-muted rounded-full animate-pulse mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl border border-border bg-card text-center py-16 px-6">
      <div className="grid place-items-center mx-auto h-16 w-16 rounded-lg bg-muted text-primary mb-4">
        <Sparkles size={28} />
      </div>
      <div className="text-lg font-semibold">You haven't unlocked any courses yet</div>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Browse universities to find courses that match your syllabus.
      </p>
      <Link
        to="/universities"
        className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm"
      >
        Browse universities <ArrowRight size={14} />
      </Link>
    </div>
  );
}
