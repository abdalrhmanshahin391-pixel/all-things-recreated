import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  Video,
  GraduationCap,
  Mic,
  Clapperboard,
  Film,
  ArrowRight,
  Sparkles,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/lectures/")({
  head: () => ({
    meta: [
      { title: "Lectures — AquaQBank" },
      {
        name: "description",
        content:
          "Recorded medical lecture courses taught by senior students, organized year by year.",
      },
    ],
  }),
  component: LecturesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  kind: string;
  image_url: string | null;
  published: boolean;
};

const YEAR_ICONS = [GraduationCap, Video, PlayCircle, Mic, Clapperboard, Film];

function LecturesPage() {
  const { user, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,title,year,price,kind,image_url,published")
        .eq("published", true)
        .eq("kind", "lectures")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setErrorMsg("Couldn't load lectures. Please refresh.");
        setCourses([]);
      } else {
        setCourses((data as Course[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setEnrolledIds(new Set());
      return;
    }
    (async () => {
      const { data } = await (supabase.from as any)("user_lecture_courses")
        .select("course_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      setEnrolledIds(
        new Set(((data ?? []) as { course_id: string }[]).map((r) => r.course_id)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const byYear = useMemo(() => {
    const map = new Map<number, Course[]>();
    courses.forEach((c) => {
      if (!map.has(c.year)) map.set(c.year, []);
      map.get(c.year)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
      <main className="pt-24 pb-24">

        {/* Hero — institutional light */}
        <section className="border-b border-border">
          <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-16 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Recorded lectures · Years 1–6
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-semibold tracking-tight text-foreground max-w-3xl">
              Lectures, on your time.
            </h1>
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl">
              A separate library of full lecture recordings — independent from
              the question bank. Buy what you need, watch when you want.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-6 md:px-10 mt-12">
          {loading ? (
            <SkeletonGrid />
          ) : errorMsg ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-6 py-10 text-center">
              {errorMsg}
            </div>
          ) : courses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-14">
              {byYear.map(([year, list], idx) => (
                <LectureSection
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

function LectureSection({
  year,
  courses,
  enrolledIds,
  Icon,
}: {
  year: number;
  courses: Course[];
  enrolledIds: Set<string>;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="grid place-items-center h-9 w-9 rounded-lg bg-muted text-primary">
          <Icon size={18} strokeWidth={2} />
        </div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          {ordinal(year)} Year
        </h2>
        <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground bg-card border border-border rounded-full px-2.5 py-1">
          {courses.length} lecture{courses.length === 1 ? "" : " courses"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {courses.map((c) => (
          <LectureCard key={c.id} course={c} active={enrolledIds.has(c.id)} />
        ))}
      </div>
    </section>
  );
}

function LectureCard({ course, active }: { course: Course; active: boolean }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCourseImageUrl(course.image_url).then((u) => {
      if (!cancelled) setImgUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [course.image_url]);

  return (
    <div className="group overflow-hidden flex flex-col rounded-lg bg-card border border-border shadow-[var(--shadow-card)] hover:border-accent/50 transition-colors">
      <Link
        to="/lectures/$courseId"
        params={{ courseId: course.id }}
        className="relative aspect-video overflow-hidden block bg-muted"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={course.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-transparent to-transparent" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid place-items-center h-12 w-12 rounded-full bg-background/95 text-primary shadow-md group-hover:scale-110 transition-transform">
            <Play size={18} strokeWidth={2.5} className="ml-0.5" fill="currentColor" />
          </div>
        </div>
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest px-2.5 py-1 rounded-full uppercase bg-background/95 text-foreground border border-border">
          <Video size={11} /> Lectures
        </span>
        {active && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest px-2.5 py-1 rounded-full uppercase bg-accent text-accent-foreground">
            Owned
          </span>
        )}
      </Link>
      <div className="px-4 py-4 flex flex-col gap-3 flex-1">
        <div className="font-semibold text-base text-foreground text-center capitalize">
          {course.title}
        </div>

        {active ? (
          <Link
            to="/lectures/$courseId"
            params={{ courseId: course.id }}
            className="mt-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold tracking-wide px-4 py-2.5 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Open lectures <ArrowRight size={14} />
          </Link>
        ) : (
          <Link
            to="/lectures/$courseId"
            params={{ courseId: course.id }}
            className="mt-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold tracking-wide px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Subscribe · ${Number(course.price).toFixed(0)} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card border border-border overflow-hidden">
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

function EmptyState() {
  return (
    <div className="rounded-lg bg-card border border-border text-center py-16 px-6">
      <div className="grid place-items-center mx-auto h-16 w-16 rounded-lg bg-muted text-primary mb-4">
        <Sparkles size={28} />
      </div>
      <div className="text-lg font-semibold text-foreground">No lecture courses yet</div>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Lecture recordings will appear here as they're published. Check back soon.
      </p>
    </div>
  );
}
