import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GraduationCap, Play, Sparkles, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { resolveCourseImageUrl } from "@/lib/course-image";

export const Route = createFileRoute("/my/lectures")({
  head: () => ({
    meta: [
      { title: "My Lectures — AquaQBank" },
      { name: "description", content: "Lecture courses you've unlocked across your universities." },
    ],
  }),
  component: MyLecturesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  image_url: string | null;
  university_id: string;
};

type University = { id: string; name: string; short_name: string | null; slug: string };

function MyLecturesPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [universities, setUniversities] = useState<Map<string, University>>(new Map());
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
        const { data: ulc } = await (supabase.from as any)("user_lecture_courses")
          .select("course_id")
          .eq("user_id", user.id);
        courseIds = ((ulc ?? []) as { course_id: string }[]).map((r) => r.course_id);
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
        .select("id,title,year,price,image_url,university_id")
        .eq("kind", "lectures")
        .eq("published", true);
      if (courseIds) q = q.in("id", courseIds);
      const { data: cs } = await q.order("year");
      const list = ((cs ?? []) as Course[]).filter((c) => !!c.university_id);

      const uniIds = Array.from(new Set(list.map((c) => c.university_id)));
      const uniMap = new Map<string, University>();
      if (uniIds.length) {
        const { data: us } = await supabase
          .from("universities")
          .select("id,name,short_name,slug")
          .in("id", uniIds);
        ((us ?? []) as University[]).forEach((u) => uniMap.set(u.id, u));
      }

      if (!cancelled) {
        setCourses(list);
        setUniversities(uniMap);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, authLoading]);

  const byUni = useMemo(() => {
    const m = new Map<string, Course[]>();
    courses.forEach((c) => {
      if (!m.has(c.university_id)) m.set(c.university_id, []);
      m.get(c.university_id)!.push(c);
    });
    return Array.from(m.entries());
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
            <h1 className="mt-5 text-4xl md:text-5xl font-semibold tracking-tight">My Lectures</h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Every lecture course you've unlocked, grouped by university.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-6 md:px-10 mt-10">
          {loading ? (
            <Skeleton />
          ) : courses.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-12">
              {byUni.map(([uid, list]) => {
                const u = universities.get(uid);
                return (
                  <section key={uid}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="grid place-items-center h-9 w-9 rounded-lg bg-muted text-primary">
                        <GraduationCap size={18} />
                      </div>
                      <h2 className="text-xl font-semibold">{u?.name ?? "University"}</h2>
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground bg-card border border-border rounded-full px-2.5 py-1">
                        {list.length} course{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      {list.map((c) => (
                        <LectureCard key={c.id} course={c} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
      </MedicalPageBackdrop>
    </div>
  );
}

function LectureCard({ course }: { course: Course }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCourseImageUrl(course.image_url).then((u) => {
      if (!cancelled) setImg(u);
    });
    return () => {
      cancelled = true;
    };
  }, [course.image_url]);

  return (
    <div className="group overflow-hidden flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
      <Link
        to="/lectures/$courseId"
        params={{ courseId: course.id }}
        className="relative aspect-video block bg-muted overflow-hidden"
      >
        {img ? (
          <img src={img} alt={course.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground"><Video size={28} /></div>
        )}
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid place-items-center h-12 w-12 rounded-full bg-background/95 text-primary shadow group-hover:scale-110 transition-transform">
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </div>
        </div>
      </Link>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="font-semibold text-base text-center capitalize">{course.title}</div>
        <Link
          to="/lectures/$courseId"
          params={{ courseId: course.id }}
          className="mt-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Open lectures <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="aspect-video bg-muted animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-9 bg-muted rounded-md animate-pulse mt-3" />
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
      <div className="text-lg font-semibold">You haven't unlocked any lectures yet</div>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Browse universities to find lecture courses on your syllabus.
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
