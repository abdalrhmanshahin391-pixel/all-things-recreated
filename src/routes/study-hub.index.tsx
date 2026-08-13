import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarClock, ListChecks, Timer } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { ICONS } from "@/lib/admin-hub-defaults";
import { fetchStudyHubTiles } from "@/lib/study-hub-tiles";

export const Route = createFileRoute("/study-hub/")({
  head: () => ({
    meta: [
      { title: "Study Hub — AquaQBank Academy" },
      {
        name: "description",
        content:
          "Plan your topics, track exam countdowns and run focused study sessions — three free study tools for medical students.",
      },
      { property: "og:title", content: "Study Hub — AquaQBank Academy" },
      {
        property: "og:description",
        content: "Plan topics, track exams and run focused study sessions in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudyHubPage,
});

const TOOLS = [
  {
    to: "/study-hub/todo",
    icon: ListChecks,
    title: "To do",
    title_ar: "قائمة المهام",
    desc: "Build your subjects, list every topic and watch your progress bar fill up.",
    desc_ar: "أنشئ موادك، اكتب كل موضوع، وتابع تقدمك.",
    points: ["Subjects and topics", "Not started / in progress / done", "Progress per subject"],
  },
  {
    to: "/study-hub/exams",
    icon: CalendarClock,
    title: "My exams & tests",
    title_ar: "امتحاناتي",
    desc: "Add each exam with its date and time and always know how long is left.",
    desc_ar: "أضف كل امتحان بتاريخه ووقته واعرف كم بقي.",
    points: ["Live countdown", "Upcoming and past", "Notes per exam"],
  },
  {
    to: "/study-hub/focus",
    icon: Timer,
    title: "Study with me",
    title_ar: "ادرس معي",
    desc: "A focus timer with automatic breaks and proven study systems.",
    desc_ar: "مؤقّت تركيز مع استراحات تلقائية وأنظمة دراسة مجرّبة.",
    points: ["Pomodoro 25/5, 50/10, 90/20", "Automatic breaks", "Daily focused minutes"],
  },
] as const;

function StudyHubPage() {
  const s = useSiteSettings();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "").startsWith("ar");

  const { data: tiles = [] } = useQuery({
    queryKey: ["study-hub-tiles"],
    queryFn: fetchStudyHubTiles,
    staleTime: 5 * 60_000,
  });

  // Built-in tools always show; admin tiles are extras (never duplicates).
  const builtInHrefs = new Set(TOOLS.map((t) => t.to as string));
  const extras = tiles.filter((t) => !t.hidden && !builtInHrefs.has(t.href));

  const title =
    (isAr ? s.study_hub_title_ar : s.study_hub_title) || (isAr ? "مركز الدراسة" : "Study Hub");
  const subtitle =
    (isAr ? s.study_hub_subtitle_ar : s.study_hub_subtitle) ||
    (isAr
      ? "خطّط لموادك، تابع امتحاناتك، وادرس بتركيز — كل شيء في مكان واحد."
      : "Plan your topics, track your exams and study with focus — all in one place.");

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <header className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            {isAr ? "أدوات الدراسة" : "Study tools"}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
          {!user && (
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              {isAr
                ? "سجّل الدخول لحفظ خطتك وامتحاناتك بشكل خاص."
                : "Sign in to keep your plan, exams and sessions private to you."}
              <Link to="/login" className="font-black text-foreground underline">
                {isAr ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </p>
          )}
        </header>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.to}
                to={tool.to}
                className="group flex flex-col rounded-2xl border-2 border-border bg-card p-6 transition-transform hover:-translate-y-1"
                style={{ boxShadow: "0 6px 0 var(--border)" }}
              >
                <span
                  className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground"
                  style={{ background: "var(--primary)" }}
                >
                  <Icon size={22} />
                </span>
                <h2 className="mt-4 text-lg font-black text-foreground">
                  {isAr ? tool.title_ar : tool.title}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isAr ? tool.desc_ar : tool.desc}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {tool.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs font-bold text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-black text-foreground">
                  {isAr ? "افتح الأداة" : "Open tool"}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>

        {extras.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              {isAr ? "المزيد" : "More"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {extras.map((t) => {
                const Icon = ICONS[t.icon] ?? ICONS.Star!;
                const cls =
                  "group aspect-square rounded-2xl border-2 border-border bg-card p-4 flex flex-col items-center justify-center gap-3 text-center transition-transform hover:-translate-y-1";
                const inner = (
                  <>
                    <span
                      className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground"
                      style={{ background: "var(--primary)" }}
                    >
                      <Icon size={22} />
                    </span>
                    <span className="text-sm font-bold leading-tight text-foreground">
                      {isAr && t.label_ar ? t.label_ar : t.label}
                    </span>
                  </>
                );
                return t.external || !t.href.startsWith("/") ? (
                  <a
                    key={t.id}
                    href={t.href || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={cls}
                    style={{ boxShadow: "0 4px 0 var(--border)" }}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    key={t.id}
                    to={t.href as any}
                    className={cls}
                    style={{ boxShadow: "0 4px 0 var(--border)" }}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
