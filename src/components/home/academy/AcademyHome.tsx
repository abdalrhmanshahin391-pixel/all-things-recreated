import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Stethoscope,
  Microscope,
  Brain,
  HeartPulse,
  Bone,
  Pill,
  Dna,
  Syringe,
  Baby,
  Eye,
  Activity,
  Star,
} from "lucide-react";
import { homeCoursesQuery } from "@/components/home/CoursesStrip";
import { useHomeUniversities } from "@/hooks/useHomeUniversities";
import { HomeFaq } from "@/components/home/HomeFaq";
import { ExamPrepPanel } from "@/components/home/ExamPrepPanel";
import { QuestionCountsSection } from "@/components/home/QuestionCountsSection";
import doctorImg from "@/assets/academy-doctor.jpg";
import anatomyImg from "@/assets/academy-anatomy.jpg";
import labImg from "@/assets/academy-lab.jpg";

/* ── Hero ───────────────────────────────────────────────────────────── */

const START_CARDS = [
  { to: "/courses", title: "Student", note: "Practise questions and track my progress" },
  { to: "/committee", title: "Committee member", note: "Share lectures, notes and past papers" },
  { to: "/universities", title: "Browse universities", note: "See what is available at my school" },
] as const;

function AcademyHero() {
  return (
    <section className="relative overflow-hidden bg-background pt-24 pb-16 md:pt-32 md:pb-24">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="decor-runway" />
        <span className="decor-confetti" style={{ left: "6%", top: "58%", background: "#f97316", clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)", width: 34, height: 34 }} />
        <span className="decor-confetti" style={{ left: "44%", top: "78%", background: "#ec4899", width: 26, height: 26, borderRadius: 4, animationDelay: "1.4s" }} />
        <span className="decor-confetti" style={{ left: "33%", top: "24%", background: "#f5c518", clipPath: "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)", width: 30, height: 30, animationDelay: "2.2s" }} />
        <span className="decor-confetti" style={{ left: "60%", top: "12%", background: "#0e7490", width: 18, height: 18, borderRadius: 999, animationDelay: "0.8s" }} />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-start gap-12 px-4 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <h1
            className="font-display font-black leading-[1.02] tracking-tight text-foreground"
            style={{ fontSize: "clamp(2.4rem, 5.6vw, 4.2rem)" }}
          >
            Turn long study nights into{" "}
            <em className="italic" style={{ color: "var(--primary)" }}>
              real marks
            </em>
            .
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            AquaQBank Academy gives medical students one calm place to practise exam-style
            questions, read trusted lecture notes and revise past papers — organised by year,
            subject and university.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Stat value="10k+" label="Practice questions" />
            <Stat value="6" label="Study years covered" />
            <Stat value="24/7" label="Access on any device" />
          </div>
        </div>

        <div>
          <h2 className="font-display text-xl font-black text-foreground md:text-2xl">
            Get started as a…
          </h2>
          <div className="mt-4 space-y-3">
            {START_CARDS.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-[color:var(--primary)]"
              >
                <span>
                  <span className="block font-display text-base font-black text-foreground">
                    {c.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{c.note}</span>
                </span>
                <ChevronRight
                  size={20}
                  className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[color:var(--primary)]"
                />
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-bold underline text-[color:var(--primary)]">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-black text-foreground">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

/* ── Explore chips ──────────────────────────────────────────────────── */

const GLYPHS = [
  { Icon: Stethoscope, color: "#0e7490" },
  { Icon: HeartPulse, color: "#ef4444" },
  { Icon: Brain, color: "#8b5cf6" },
  { Icon: Microscope, color: "#16a34a" },
  { Icon: Bone, color: "#f59e0b" },
  { Icon: Dna, color: "#0ea5e9" },
  { Icon: Pill, color: "#ec4899" },
  { Icon: Syringe, color: "#14b8a6" },
  { Icon: Baby, color: "#f97316" },
  { Icon: Eye, color: "#6366f1" },
  { Icon: Activity, color: "#22c55e" },
];

function AcademyChips() {
  const { data } = useQuery(homeCoursesQuery);
  const courses = data?.courses ?? [];
  if (courses.length === 0) return null;

  return (
    <section className="bg-background py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <h2 className="text-center font-display text-2xl font-black text-foreground md:text-3xl">
          Explore our content
        </h2>
        <ul className="mt-8 flex flex-wrap justify-center gap-3">
          {courses.map((c, i) => {
            const g = GLYPHS[i % GLYPHS.length]!;
            const Icon = g.Icon;
            return (
              <li key={c.id}>
                <Link
                  to="/courses/$courseId"
                  params={{ courseId: c.id }}
                  className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-foreground transition-colors hover:border-[color:var(--primary)] hover:bg-muted"
                >
                  <Icon size={20} style={{ color: g.color }} strokeWidth={2.4} />
                  {c.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── Featured courses ───────────────────────────────────────────────── */

const FEATURE_IMAGES = [doctorImg, anatomyImg, labImg];

function AcademyCourses() {
  const { data } = useQuery(homeCoursesQuery);
  const courses = (data?.courses ?? []).slice(0, 3);
  const counts = data?.counts ?? {};
  if (courses.length === 0) return null;

  return (
    <section className="bg-background pb-16 md:pb-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Ready to start revising?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Popular question banks students open first.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {courses.map((c, i) => (
            <Link
              key={c.id}
              to="/courses/$courseId"
              params={{ courseId: c.id }}
              className="rounded-2xl border border-border bg-card p-3 transition-transform hover:-translate-y-1"
            >
              <img
                src={FEATURE_IMAGES[i % FEATURE_IMAGES.length]}
                alt={c.title}
                width={800}
                height={600}
                loading="lazy"
                className="h-44 w-full rounded-xl object-cover"
              />
              <div className="px-2 pb-2 pt-4">
                <div className="font-display text-lg font-black text-foreground">{c.title}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-bold text-foreground">
                    <Star size={12} className="fill-[#f5c518] text-[#f5c518]" /> 4.8
                  </span>
                  <span className="rounded-md border border-border px-2 py-1 text-xs font-bold text-muted-foreground">
                    {counts[c.id]?.questions ?? 0} questions
                  </span>
                  <span className="rounded-md border border-border px-2 py-1 text-xs font-bold text-muted-foreground">
                    {counts[c.id]?.subjects ?? 0} subjects
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Universities + CTA ─────────────────────────────────────────────── */

function AcademyUniversities() {
  const unis = useHomeUniversities();
  if (unis.length === 0) return null;
  return (
    <section className="border-y border-border bg-muted/40 py-14">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="text-center font-display text-2xl font-black text-foreground">
          Built with students at these schools
        </h2>
        <ul className="mt-7 flex flex-wrap justify-center gap-3">
          {unis.map((u) => (
            <li key={u.id}>
              <Link
                to="/u/$uniSlug"
                params={{ uniSlug: u.slug }}
                className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 transition-colors hover:border-[color:var(--primary)]"
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-full font-display text-xs font-black text-[color:var(--primary-foreground)]"
                  style={{ background: "var(--primary)" }}
                >
                  {(u.short_name ?? u.name).slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-bold text-foreground">{u.short_name ?? u.name}</span>
                {u.home_badge === "COMING_SOON" && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Soon
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AcademyCta() {
  return (
    <section className="bg-background py-20 text-center">
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Your medical school, in one place.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Create a free account and start with your year's question bank today.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/register"
            className="rounded-xl px-7 py-3.5 font-display text-base font-black text-[color:var(--primary-foreground)]"
            style={{ background: "var(--primary)" }}
          >
            Create free account
          </Link>
          <Link
            to="/courses"
            className="rounded-xl border border-border bg-card px-7 py-3.5 font-display text-base font-black text-foreground"
          >
            Browse courses
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export function AcademyHome() {
  return (
    <>
      <AcademyHero />
      <AcademyChips />
      <ExamPrepPanel />
      <QuestionCountsSection />
      <AcademyCourses />
      <AcademyUniversities />
      <HomeFaq />
      <AcademyCta />
    </>
  );
}
