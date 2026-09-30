import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Radio,
  Save,
  Settings2,
  Upload,
  UserCog,
  Users,
  Video,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { LectureStaffCard } from "@/components/lectures/LectureStaffCard";
import { CourseMaterialsCard } from "@/components/lectures/CourseMaterialsCard";
import { LectureQuestionsCard } from "@/components/lectures/LectureQuestionsCard";
import { LiveClassesCard } from "@/components/lectures/LiveClassesCard";
import { resolveCourseImageUrl } from "@/lib/course-image";

import { LectureCourseOwnersDashboard } from "@/components/lectures/LectureCourseOwnersDashboard";

export const Route = createFileRoute("/admin/lecture-centre")({
  head: () => ({
    meta: [
      { title: "Lecture Centre — AquaQBank" },
      { name: "description", content: "Create and run lecture courses: topics, materials, questions, staff and live classes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LectureCentrePage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  published: boolean;
  is_live: boolean;
  university_id: string;
  image_url: string | null;
  intro_image_url: string | null;
  intro_video_url: string | null;
  intro_video_storage_path: string | null;
  intro_free: boolean;
};
type University = { id: string; name: string };

type Tab = "course" | "materials" | "questions" | "live" | "staff" | "owners";

const TABS: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: "course", label: "Course", icon: Settings2 },
  { id: "materials", label: "Material", icon: FileText },
  { id: "questions", label: "Questions", icon: HelpCircle },
  { id: "live", label: "Live classes", icon: CalendarClock },
  { id: "staff", label: "Staff & Leadership", icon: UserCog },
  { id: "owners", label: "Course Owners", icon: Users },
];

function LectureCentrePage() {
  const { user, isRealAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [courses, setCourses] = useState<Course[]>([]);
  const [unis, setUnis] = useState<University[]>([]);
  const [activeId, setActiveId] = useState("");
  const [tab, setTab] = useState<Tab>("course");
  const [staffCourseIds, setStaffCourseIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const active = courses.find((c) => c.id === activeId) ?? null;
  const canManageCourse = isRealAdmin;

  const loadCourses = useCallback(
    async (staffIds: string[]) => {
      let q = (supabase.from as any)("courses")
        .select(
          "id,title,year,price,published,is_live,university_id,image_url,intro_image_url,intro_video_url,intro_video_storage_path,intro_free",
        )
        .eq("kind", "lectures")
        .order("year")
        .order("title");
      if (!isRealAdmin) q = q.in("id", staffIds.length ? staffIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await q;
      if (error) setErr(error.message);
      const list = (data as Course[]) ?? [];
      setCourses(list);
      setActiveId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? "")));
    },
    [isRealAdmin],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data: staffRows } = await (supabase.from as any)("lecture_staff")
        .select("course_id")
        .eq("user_id", user.id);
      const ids = ((staffRows ?? []) as { course_id: string }[]).map((r) => r.course_id);
      setStaffCourseIds(ids);
      if (!isRealAdmin && ids.length === 0) {
        navigate({ to: "/" });
        return;
      }
      if (isRealAdmin) {
        const { data: u } = await (supabase.from as any)("universities").select("id,name").order("name");
        setUnis((u as University[]) ?? []);
      }
      await loadCourses(ids);
      setReady(true);
    })();
  }, [loading, user, isRealAdmin, navigate, loadCourses]);

  const heading = useMemo(
    () => (isRealAdmin ? "Lecture Centre" : "My lecture courses"),
    [isRealAdmin],
  );

  if (loading || !ready) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pt-28 pb-24">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{heading}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything for a lecture course in one place: cover, material, topics, questions, staff and live classes.
            </p>
          </div>
          <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Admin
          </Link>
        </div>

        {err && (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start justify-between gap-3">
            <span>{err}</span>
            <button onClick={() => setErr(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              Lecture course
            </label>
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {courses.length === 0 && <option value="">No lecture courses yet</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Y{c.year} · {c.title}
                </option>
              ))}
            </select>
          </div>
          {canManageCourse && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold"
            >
              <Plus size={14} /> New lecture course
            </button>
          )}
          {active && (
            <Link
              to="/admin/lectures"
              search={{ courseId: active.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-accent"
            >
              <Layers size={14} /> Topics &amp; lessons
            </Link>
          )}
        </div>

        {creating && canManageCourse && (
          <NewCourseForm
            unis={unis}
            onClose={() => setCreating(false)}
            onCreated={async (id) => {
              setCreating(false);
              await loadCourses(staffCourseIds);
              setActiveId(id);
            }}
          />
        )}

        {active && (
          <>
            <div className="mt-8 flex flex-wrap gap-2 border-b border-border pb-3">
              {TABS.map((t) => {
                const Icon = t.icon;
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-6">
              {tab === "course" && (
                <CourseSettings
                  course={active}
                  canManage={canManageCourse}
                  onSaved={() => loadCourses(staffCourseIds)}
                />
              )}
              {tab === "materials" && <CourseMaterialsCard courseId={active.id} />}
              {tab === "questions" && <LectureQuestionsCard courseId={active.id} />}
              {tab === "live" && <LiveClassesCard courseId={active.id} />}
              {tab === "staff" && (
                <LectureStaffCard
                  courseId={active.id}
                  canManage={canManageCourse}
                  courseTitle={active.title}
                />
              )}
              {tab === "owners" && (
                <LectureCourseOwnersDashboard
                  courseId={active.id}
                  courseTitle={active.title}
                  isAdmin={canManageCourse}
                  isHead={true}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function NewCourseForm({
  unis,
  onClose,
  onCreated,
}: {
  unis: University[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(1);
  const [price, setPrice] = useState(0);
  const [uniId, setUniId] = useState(unis[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !uniId) {
      setErr("A title and a university are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await (supabase.from as any)("courses")
      .insert({
        title: title.trim(),
        year,
        price,
        kind: "lectures",
        university_id: uniId,
        published: false,
      })
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error || !data) setErr(error?.message ?? "Could not create the course");
    else onCreated(data.id as string);
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">New lecture course</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      {err && <div className="mb-3 text-xs text-destructive">{err}</div>}
      <div className="grid md:grid-cols-4 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Course title"
          className="md:col-span-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={uniId}
          onChange={(e) => setUniId(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        >
          {unis.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        >
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value) || 0)}
          placeholder="Price"
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <button
        onClick={create}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create course
      </button>
    </section>
  );
}

function CourseSettings({
  course,
  canManage,
  onSaved,
}: {
  course: Course;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [videoUrl, setVideoUrl] = useState(course.intro_video_url ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [free, setFree] = useState(course.intro_free);
  const [live, setLive] = useState(course.is_live);
  const [published, setPublished] = useState(course.published);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setVideoUrl(course.intro_video_url ?? "");
    setVideoFile(null);
    setImageFile(null);
    setFree(course.intro_free);
    setLive(course.is_live);
    setPublished(course.published);
    setPreview(null);
    if (course.intro_image_url) resolveCourseImageUrl(course.intro_image_url).then(setPreview);
  }, [course]);

  async function save() {
    setBusy(true);
    setErr(null);
    setOk(false);
    const patch: Record<string, unknown> = {
      intro_video_url: videoUrl.trim() || null,
      intro_free: free,
      is_live: live,
    };
    if (canManage) patch.published = published;

    if (videoFile) {
      const key = `intro/${course.id}-${crypto.randomUUID()}-${videoFile.name}`;
      const { error } = await supabase.storage
        .from("lecture-videos")
        .upload(key, videoFile, { upsert: false, contentType: videoFile.type });
      if (error) {
        setBusy(false);
        setErr(error.message);
        return;
      }
      patch.intro_video_storage_path = key;
    }
    if (imageFile) {
      const key = `lecture-intro/${course.id}-${crypto.randomUUID()}-${imageFile.name}`;
      const { error } = await supabase.storage
        .from("course-images")
        .upload(key, imageFile, { upsert: false, contentType: imageFile.type });
      if (error) {
        setBusy(false);
        setErr(error.message);
        return;
      }
      patch.intro_image_url = key;
    }

    const { error } = await (supabase.from as any)("courses").update(patch).eq("id", course.id);
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(true);
      onSaved();
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)] space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="text-primary" size={18} />
          <h2 className="font-semibold text-sm">Course cover &amp; settings</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick a picture or a video for the course hero. If a video is set, the hero plays it.
        </p>
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <ImageIcon size={12} /> Intro picture
          </div>
          {preview && <img src={preview} alt="" className="rounded-md border border-border w-full aspect-video object-cover" />}
          <label className="rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-sm cursor-pointer hover:border-accent flex items-center gap-2">
            <Upload size={14} />
            <span className="truncate">{imageFile ? imageFile.name : "Upload a picture…"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Video size={12} /> Intro video
          </div>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste a URL (YouTube, Vimeo, .mp4)"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <label className="rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-sm cursor-pointer hover:border-accent flex items-center gap-2">
            <Upload size={14} />
            <span className="truncate">{videoFile ? videoFile.name : "Or upload an MP4…"}</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="accent-[var(--primary)]" />
          Free intro for everyone
        </label>
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-[var(--primary)]" />
          <span className="inline-flex items-center gap-1">
            <Radio size={12} /> Live course (scheduled classes)
          </span>
        </label>
        {canManage && (
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Published (visible to students)
          </label>
        )}
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        {ok && !busy && <span className="text-[11px] font-normal">· saved</span>}
      </button>
    </section>
  );
}
