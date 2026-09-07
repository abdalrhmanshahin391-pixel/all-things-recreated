import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  PlayCircle,
  Lock,
  Loader2,
  Video,
  Play,
  ChevronDown,
  ChevronRight,
  ListChecks,
  FileText,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { resolveLectureVideoUrl, resolveLecturePdfUrl } from "@/lib/lecture-video";
import { IntroVideoModal } from "@/components/lectures/IntroVideoModal";
import { LecturePdfModal } from "@/components/lectures/LecturePdfModal";
import { ProtectedContent } from "@/components/protect/ProtectedContent";
import { ProtectionNotice } from "@/components/protect/ProtectionNotice";
import { CourseMaterialsList, LiveClassesList } from "@/components/lectures/LectureExtras";
import { ensureFreeEnrollment } from "@/lib/course-access";

export const Route = createFileRoute("/lectures/$courseId/")({
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
    const name = loaderData?.title ?? "Lecture course";
    const title = `${name} lectures — AquaQBank`;
    const description = loaderData?.title
      ? `Video lectures for ${name}${loaderData.year ? ` (year ${loaderData.year})` : ""}.`
      : "Video lectures for medical school courses.";
    const url = `https://aquaqbank.com/lectures/${params.courseId}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: () => (
    <ProtectedContent context="lectures">
      <LectureCoursePage />
    </ProtectedContent>
  ),
});


type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  kind: string;
  image_url: string | null;
  published: boolean;
  intro_video_url: string | null;
  intro_video_storage_path: string | null;
  intro_free: boolean;
};

type Subject = { id: string; title: string; position: number; hidden?: boolean };
type Item = {
  id: string;
  subject_id: string;
  kind: "lecture" | "quiz";
  title: string;
  position: number;
  video_url: string | null;
  video_storage_path: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  duration_seconds: number | null;
  is_free: boolean;
};
type Quiz = { id: string; item_id: string };

function LectureCoursePage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ src: string; title: string } | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [videoLoading, setVideoLoading] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{ src: string; title: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const owns = enrolled || isAdmin;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("courses")
        .select("id,title,year,price,kind,image_url,published,intro_video_url,intro_video_storage_path,intro_free")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      const c = data as Course | null;
      if (c && c.kind !== "lectures") {
        navigate({ to: "/courses/$courseId", params: { courseId: c.id }, replace: true });
        return;
      }
      setCourse(c);
      if (c?.image_url) resolveCourseImageUrl(c.image_url).then((u) => !cancelled && setCoverUrl(u));

      const { data: subs } = await (supabase.from as any)("lecture_subjects")
        .select("id,title,position,hidden")
        .eq("course_id", courseId)
        .order("position");
      const subjList = (((subs ?? []) as Subject[])).filter((s) => isAdmin || !s.hidden);
      if (!cancelled) {
        setSubjects(subjList);
        if (subjList.length && openSubject === null) setOpenSubject(subjList[0].id);
      }

      if (subjList.length) {
        const { data: its } = await (supabase.from as any)("lecture_items")
          .select("id,subject_id,kind,title,position,video_url,video_storage_path,pdf_url,pdf_storage_path,duration_seconds,is_free")
          .in("subject_id", subjList.map((s) => s.id))
          .order("position");
        if (!cancelled) setItems((its ?? []) as Item[]);

        const quizItemIds = ((its ?? []) as Item[]).filter((i) => i.kind === "quiz").map((i) => i.id);
        if (quizItemIds.length) {
          let { data: qz } = await (supabase.from as any)("lecture_quizzes")
            .select("id,item_id")
            .in("item_id", quizItemIds);
          let qzList = (qz ?? []) as Quiz[];
          if (isAdmin) {
            const missing = quizItemIds.filter((id) => !qzList.some((q) => q.item_id === id));
            if (missing.length) {
              await (supabase.from as any)("lecture_quizzes").insert(missing.map((id) => ({ item_id: id })));
              const { data: qz2 } = await (supabase.from as any)("lecture_quizzes")
                .select("id,item_id")
                .in("item_id", quizItemIds);
              qzList = (qz2 ?? []) as Quiz[];
            }
          }
          if (!cancelled) setQuizzes(qzList);
        }
      }

      if (user && c) {
        if ((Number(c.price) || 0) <= 0) {
          await ensureFreeEnrollment(user.id, c.id, "lectures");
          if (!cancelled) setEnrolled(true);
          setLoading(false);
          return;
        }
        const { data: enr } = await (supabase.from as any)("user_lecture_courses")
          .select("course_id")
          .eq("user_id", user.id)
          .eq("course_id", c.id)
          .maybeSingle();
        if (!cancelled) setEnrolled(!!enr);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user, navigate]);

  const itemsBySubject = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((it) => {
      if (!map.has(it.subject_id)) map.set(it.subject_id, []);
      map.get(it.subject_id)!.push(it);
    });
    return map;
  }, [items]);

  const quizByItemId = useMemo(() => {
    const m = new Map<string, string>();
    quizzes.forEach((q) => m.set(q.item_id, q.id));
    return m;
  }, [quizzes]);

  async function playLecture(item: Item) {
    if (!owns && !item.is_free) return;
    setVideoLoading(item.id);
    const url = await resolveLectureVideoUrl(item.video_url, item.video_storage_path);
    setVideoLoading(null);
    if (url) setActiveVideo({ src: url, title: item.title });
  }

  async function openPdf(item: Item) {
    if (!owns && !item.is_free) return;
    setPdfLoading(item.id);
    const url = await resolveLecturePdfUrl(item.pdf_url, item.pdf_storage_path);
    setPdfLoading(null);
    if (url) setActivePdf({ src: url, title: item.title });
  }

  async function openIntro() {
    if (!course) return;
    if (!owns && !course.intro_free) return;
    const url = await resolveLectureVideoUrl(course.intro_video_url, course.intro_video_storage_path);
    if (url) {
      setActiveVideo({ src: url, title: `${course.title} — Intro` });
      setIntroOpen(true);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading lecture course…
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 pt-32 text-center">
          <h1 className="text-2xl font-semibold">Lecture course not found</h1>
          <Link to="/lectures" className="mt-4 inline-block text-accent hover:underline text-sm">
            ← Back to lectures
          </Link>
        </div>
      </div>
    );
  }

  const hasIntro = !!(course.intro_video_url || course.intro_video_storage_path);
  const introPlayable = hasIntro && (owns || course.intro_free);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 md:px-10 pt-24 pb-24">
        <Link
          to="/lectures"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" /> Back to lectures
        </Link>

        <div className="mt-6 grid md:grid-cols-[1.1fr_1fr] gap-6 items-start">
          <button
            onClick={introPlayable ? openIntro : undefined}
            className={`group rounded-lg overflow-hidden bg-card aspect-video relative border border-border text-left shadow-[var(--shadow-card)] ${
              introPlayable ? "cursor-pointer hover:border-accent transition" : "cursor-default"
            }`}
          >
            {coverUrl ? (
              <img src={coverUrl} alt={course.title} className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="absolute inset-0 bg-muted" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid place-items-center h-16 w-16 rounded-full bg-background/95 text-primary shadow-lg group-hover:scale-110 transition-transform">
                <Play size={26} strokeWidth={2.5} className="ml-1" fill="currentColor" />
              </div>
            </div>
            <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest px-2.5 py-1 rounded-full uppercase bg-background/95 text-foreground border border-border">
              <Video size={11} /> {hasIntro ? (introPlayable ? "Watch intro" : "Intro · locked") : "Lectures"}
            </span>
            {hasIntro && (
              <span className="absolute bottom-4 left-4 right-4 text-background font-semibold text-base drop-shadow-md">
                What to expect from this course →
              </span>
            )}
          </button>

          <div className="rounded-lg bg-card border border-border p-6 md:p-7 shadow-[var(--shadow-card)]">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Year {course.year}
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight capitalize text-foreground">{course.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Recorded lecture course. Watch at your own pace — independent from the question bank.
            </p>

            <div className="mt-6">
              {owns ? (
                <div className="rounded-md border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
                  <CheckCircle2 className="inline w-4 h-4 mr-1 -mt-0.5 text-accent" />
                  {isAdmin && !enrolled ? "Admin preview — you can play everything." : "You own this lecture course. Dive into the syllabus below."}
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-foreground">
                      ${Number(course.price).toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground">one-time · separate from Q-bank</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/courses/$courseId/checkout",
                        params: { courseId: course.id },
                      })
                    }
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90"
                  >
                    <Lock size={14} /> Unlock this course
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground text-center">
                    Secure one-time payment · instant access
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Syllabus</h2>
            <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground bg-card border border-border rounded-full px-2.5 py-1">
              {subjects.length} subject{subjects.length === 1 ? "" : "s"}
            </span>
          </div>

          {subjects.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <Sparkles className="mx-auto w-8 h-8 text-accent mb-2" />
              <div className="text-foreground font-semibold">Syllabus coming soon</div>
              <p className="text-sm text-muted-foreground mt-1">Lecture topics will appear here once published.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((s, idx) => {
                const subItems = itemsBySubject.get(s.id) ?? [];
                const isOpen = openSubject === s.id;
                const lectureCount = subItems.filter((i) => i.kind === "lecture").length;
                const quizCount = subItems.filter((i) => i.kind === "quiz").length;
                return (
                  <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setOpenSubject(isOpen ? null : s.id)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/50"
                    >
                      <span className="grid place-items-center h-8 w-8 rounded-md bg-muted text-primary font-semibold text-sm">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground truncate">{s.title}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">
                          {lectureCount} lecture{lectureCount === 1 ? "" : "s"} · {quizCount} quiz{quizCount === 1 ? "" : "zes"}
                        </div>
                      </div>
                      {isOpen ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border">
                        {subItems.length === 0 ? (
                          <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                            No items in this subject yet.
                          </div>
                        ) : (
                          subItems.map((item) => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              owns={owns}
                              courseId={courseId}
                              quizId={quizByItemId.get(item.id)}
                              loadingId={videoLoading}
                              pdfLoadingId={pdfLoading}
                              onPlay={() => playLecture(item)}
                              onOpenPdf={() => openPdf(item)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isAdmin && (
          <div className="mt-10 rounded-lg border border-border bg-card p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest">Admin</div>
              <div className="text-foreground font-semibold">Manage this lecture course's syllabus</div>
            </div>
            <Link
              to="/admin/lectures"
              search={{ courseId }}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            >
              Open syllabus admin →
            </Link>
          </div>
        )}
      </main>

      {activePdf && (
        <LecturePdfModal
          src={activePdf.src}
          title={activePdf.title}
          onClose={() => setActivePdf(null)}
        />
      )}

      {activeVideo && (
        <IntroVideoModal
          src={activeVideo.src}
          title={activeVideo.title}
          onClose={() => {
            setActiveVideo(null);
            setIntroOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  owns,
  courseId,
  quizId,
  loadingId,
  pdfLoadingId,
  onPlay,
  onOpenPdf,
}: {
  item: Item;
  owns: boolean;
  courseId: string;
  quizId?: string;
  loadingId: string | null;
  pdfLoadingId?: string | null;
  onPlay: () => void;
  onOpenPdf?: () => void;
}) {
  const isLecture = item.kind === "lecture";
  const hasVideo = !!(item.video_url || item.video_storage_path);
  const hasPdf = !!(item.pdf_url || item.pdf_storage_path);
  const Icon = isLecture ? (hasVideo ? PlayCircle : FileText) : ListChecks;
  const unlocked = owns || item.is_free;

  const kindLabel = isLecture
    ? hasVideo && hasPdf
      ? "Lecture video + PDF"
      : hasPdf
        ? "Lecture PDF"
        : "Lecture video"
    : "Quiz · session mode";

  const content = (
    <>
      <span className="grid place-items-center h-9 w-9 rounded-md bg-muted text-primary shrink-0">
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-foreground truncate flex items-center gap-2">
          {item.title}
          {item.is_free && (
            <span className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
              Free
            </span>
          )}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">
          {kindLabel}
        </div>
      </div>
    </>
  );

  const cls = "w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition";

  if (!unlocked) {
    return (
      <div className={cls}>
        {content}
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-md bg-muted text-muted-foreground border border-border shrink-0">
          <Lock size={11} /> Locked
        </span>
      </div>
    );
  }

  if (isLecture) {
    return (
      <div className={cls}>
        {content}
        <div className="flex items-center gap-2 shrink-0">
          {hasVideo && (
            <button
              onClick={onPlay}
              disabled={loadingId === item.id}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-70"
            >
              {loadingId === item.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
              Watch
            </button>
          )}
          {hasPdf && (
            <button
              onClick={onOpenPdf}
              disabled={pdfLoadingId === item.id}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-accent text-accent-foreground disabled:opacity-70"
            >
              {pdfLoadingId === item.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText size={12} />
              )}
              Open PDF
            </button>
          )}
          {!hasVideo && !hasPdf && (
            <span className="text-[11px] text-muted-foreground font-semibold">No material yet</span>
          )}
        </div>
      </div>
    );
  }

  if (quizId) {
    return (
      <Link
        to="/lectures/$courseId/quiz/$quizId"
        params={{ courseId, quizId }}
        className={cls}
      >
        {content}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-accent text-accent-foreground shrink-0">
          Start →
        </span>
      </Link>
    );
  }
  return (
    <div className={cls}>
      {content}
      <span className="text-[11px] text-muted-foreground font-semibold shrink-0">No questions yet</span>
    </div>
  );
}
