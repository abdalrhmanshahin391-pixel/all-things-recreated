import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { autoNotify } from "@/lib/push.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  BookOpen,
  Users as UsersIcon,
  X,
  Check,
  Pencil,
  Upload,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { useCourseOptions } from "@/lib/course-options";
import { CourseOptionsManager } from "@/components/admin/CourseOptionsManager";
import {
  syncPaddleCoursePrice,
  syncAllCoursesToPaddle,
  autoReconcileCoursesToPaddle,
} from "@/utils/payments.functions";
import { toast } from "sonner";

function CourseThumb({ value, className }: { value: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCourseImageUrl(value).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!url) return null;
  return <img src={url} alt="" className={className} />;
}

export const Route = createFileRoute("/admin/courses")({
  head: () => ({ meta: [{ title: "Courses Control — AquaQBank" }] }),
  component: AdminCoursesPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  paddle_price_id?: string | null;
  category: string;
  exam_type: string;
  image_url: string | null;
  subjects_count: number;
  questions_count_mid: number;
  questions_count_final: number;
  published: boolean;
  created_at: string;
  kind: "questions" | "lectures";
  university_id: string | null;
};

type University = { id: string; name: string; short_name: string | null };


type Enrollment = { id: string; user_id: string; course_id: string };

type KindFilter = "all" | "questions" | "lectures";


function AdminCoursesPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const options = useCourseOptions();

  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courseQuery, setCourseQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [universities, setUniversities] = useState<University[]>([]);
  const [uniFilter, setUniFilter] = useState<string>("all");

  // new course form
  const [title, setTitle] = useState("");
  const [year, setYear] = useState<number>(1);
  const [price, setPrice] = useState<string>("");
  const [paddlePriceId, setPaddlePriceId] = useState<string>("");
  const [category, setCategory] = useState<string>("major");
  const [examType, setExamType] = useState<string>("MINI-OSCE");
  const [kind, setKind] = useState<"questions" | "lectures">("questions");
  const [universityId, setUniversityId] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  async function handleSyncAllPaddle() {
    setBulkSyncing(true);
    setError(null);
    try {
      const res = await syncAllCoursesToPaddle({ data: { environment: "live" } });
      const syncedCount = (res as any)?.synced ?? (res as any)?.reconciled ?? 0;
      const totalCount = (res as any)?.total ?? 0;
      toast.success(`Successfully synced ${syncedCount} of ${totalCount} courses to Paddle!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Bulk Paddle sync failed");
      setError(e?.message || "Failed to sync courses to Paddle");
    } finally {
      setBulkSyncing(false);
    }
  }

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  // Zero-click background auto-reconciliation: automatically provisions active Paddle products & prices
  useEffect(() => {
    if (!loading && user && isAdmin) {
      autoReconcileCoursesToPaddle({ data: { environment: "live" } })
        .then((res) => {
          if (res?.reconciled && res.reconciled > 0) {
            toast.success(`Automatically synced ${res.reconciled} courses with Paddle!`);
            refresh();
          }
        })
        .catch((err) => {
          console.warn("Background Paddle sync auto-check:", err);
        });
    }
  }, [loading, user, isAdmin]);

  async function refresh() {
    const [c, u, e, un] = await Promise.all([
      supabase.from("courses").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_courses").select("id,user_id,course_id"),
      supabase.from("universities").select("id,name,short_name").eq("is_active", true).order("sort_order"),
    ]);
    if (c.error) setError(c.error.message);
    else setCourses((c.data as Course[]) ?? []);
    if (!u.error) setUsers((u.data as Profile[]) ?? []);
    if (!e.error) setEnrollments((e.data as Enrollment[]) ?? []);
    if (!un.error) {
      const list = (un.data as University[]) ?? [];
      setUniversities(list);
      if (!universityId && list[0]) setUniversityId(list[0].id);
    }
  }

  // Keep the pickers on a valid option whenever the admin edits the lists.
  useEffect(() => {
    if (options.category[0] && !options.category.some((o) => o.value === category)) {
      setCategory(options.category[0].value);
    }
    if (options.exam_type[0] && !options.exam_type.some((o) => o.value === examType)) {
      setExamType(options.exam_type[0].value);
    }
    if (options.year[0] && !options.year.some((o) => Number(o.value) === year)) {
      setYear(Number(options.year[0].value) || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);


  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    let list = courses;
    if (kindFilter !== "all") list = list.filter((c) => (c.kind ?? "questions") === kindFilter);
    if (uniFilter !== "all") list = list.filter((c) => c.university_id === uniFilter);
    if (!q) return list;
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) || String(c.year).includes(q),
    );
  }, [courses, courseQuery, kindFilter, uniFilter]);



  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  function enrollmentsFor(uid: string) {
    return enrollments.filter((e) => e.user_id === uid);
  }

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (!universityId) {
      setError("Pick a university for this course.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: any = {
      title: title.trim(),
      year,
      price: Number(price) || 0,
      paddle_price_id: paddlePriceId.trim() || null,
      category,
      exam_type: kind === "lectures" ? "LECTURES" : examType,
      kind,
      university_id: universityId,
      created_by: user!.id,
    };

    if (payload.price > 0 && !payload.paddle_price_id) {
      try {
        const syncRes = await syncPaddleCoursePrice({
          data: {
            title: payload.title,
            price: payload.price,
            environment: "live",
          },
        });
        if (syncRes.paddlePriceId) {
          payload.paddle_price_id = syncRes.paddlePriceId;
        }
      } catch (syncErr) {
        console.warn("Auto-sync to Paddle failed:", syncErr);
      }
    }

    const { error } = await (supabase.from("courses") as any).insert(payload);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    autoNotify({
      data: {
        kind: "on_new_course",
        title_en: "New course available",
        body_en: payload.title,
        title_ar: "دورة جديدة متاحة",
        body_ar: payload.title,
        url: "/courses",
      },
    }).catch(() => undefined);
    setTitle("");
    setPrice("");
    setPaddlePriceId("");
    setYear(Number(options.year[0]?.value) || 1);
    setCategory(options.category[0]?.value ?? "major");
    setExamType(options.exam_type[0]?.value ?? "MINI-OSCE");
    setKind("questions");
    refresh();
  }



  async function deleteCourse(id: string) {
    if (!confirm("Delete this course? It will also remove all user access to it.")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) setError(error.message);
    else {
      if (editingCourse?.id === id) setEditingCourse(null);
      refresh();
    }
  }

  async function grantCourse(uid: string, cid: string) {
    const { error } = await supabase
      .from("user_courses")
      .insert({ user_id: uid, course_id: cid, granted_by: user!.id });
    if (error) setError(error.message);
    else refresh();
  }

  async function revokeCourse(uid: string, cid: string) {
    const { error } = await supabase
      .from("user_courses")
      .delete()
      .eq("user_id", uid)
      .eq("course_id", cid);
    if (error) setError(error.message);
    else refresh();
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold mb-2">Courses Control</h1>
            <p className="text-white/60">
              Create courses, upload covers, set details and publish them for students.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncAllPaddle}
            disabled={bulkSyncing}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-black px-4 py-2.5 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 transition shadow-sm"
          >
            {bulkSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Syncing with Paddle…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Sync All with Paddle
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-start justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300/70 hover:text-red-200">
              <X size={16} />
            </button>
          </div>
        )}

        <CourseOptionsManager setError={setError} />

        {/* Add course */}
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={18} className="text-emerald-400" />
            <h2 className="font-semibold text-lg">Add New Course</h2>
          </div>
          {/* Type segmented control — choose where this course shows up */}
          <div className="mb-4 inline-flex rounded-lg border border-white/15 bg-black/30 p-1">
            <button
              type="button"
              onClick={() => setKind("questions")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
                kind === "questions" ? "bg-indigo-500 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Questions course
            </button>
            <button
              type="button"
              onClick={() => setKind("lectures")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
                kind === "lectures" ? "bg-emerald-500 text-black" : "text-white/60 hover:text-white"
              }`}
            >
              Lectures course
            </button>
          </div>
          <p className="text-xs text-white/50 mb-3">
            {kind === "questions"
              ? "Appears on the Courses page. Has subjects, mid/final question counts, and exam type."
              : "Appears on the new Lectures page. Just title, year, price, image — lecture videos come next."}
          </p>
          <form onSubmit={addCourse} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <select
              value={universityId}
              onChange={(e) => setUniversityId(e.target.value)}
              className="md:col-span-12 rounded-lg border border-amber-400/40 bg-black/40 px-3 py-3 text-sm outline-none focus:border-amber-400"
              required
            >
              <option value="">— Pick a university —</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>


            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Course title (e.g. Anatomy I)"
              className="md:col-span-4 rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
              required
            />
            {kind === "questions" && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="md:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/50"
              >
                {options.category.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="md:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/50"
            >
              {options.year.map((o) => (
                <option key={o.id} value={Number(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
            {kind === "questions" && (
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="md:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/50"
              >
                {options.exam_type.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}

            <div className="md:col-span-2 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-white/15 bg-black/40 pl-7 pr-3 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
                required
              />
            </div>
            <input
              value={paddlePriceId}
              onChange={(e) => setPaddlePriceId(e.target.value)}
              placeholder="Payment price ID (required for paid courses)"
              className="md:col-span-4 rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
            />
            <button
              type="submit"
              disabled={submitting}
              className="md:col-span-12 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm py-3 transition-colors"
            >
              {submitting ? "Adding…" : "Add Course"}
            </button>
          </form>
        </section>

        {/* All courses */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={18} className="text-amber-400" />
            <h2 className="font-semibold text-lg">All Courses ({courses.length})</h2>
          </div>
          <div className="mb-3 inline-flex rounded-lg border border-white/15 bg-black/30 p-1 text-[11px] font-bold uppercase tracking-wider">
            {(["all", "questions", "lectures"] as KindFilter[]).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  kindFilter === k
                    ? k === "lectures"
                      ? "bg-emerald-500 text-black"
                      : k === "questions"
                      ? "bg-indigo-500 text-white"
                      : "bg-white/15 text-white"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">University</span>
            <select
              value={uniFilter}
              onChange={(e) => setUniFilter(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs outline-none focus:border-white/40"
            >
              <option value="all">All</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="relative mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              placeholder="Search courses by title or year…"
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] pl-11 pr-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
            />
          </div>


          {filteredCourses.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/50">
              No courses yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCourses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setEditingCourse(c)}
                  className="group text-left rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-white/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 rounded-lg bg-white/5 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {c.image_url ? (
                        <CourseThumb value={c.image_url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-white/30">
                          <BookOpen size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold leading-snug truncate">{c.title}</div>
                        {c.published ? (
                          <Eye size={14} className="text-emerald-400 shrink-0" />
                        ) : (
                          <EyeOff size={14} className="text-white/30 shrink-0" />
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {(c.kind ?? "questions") === "lectures" ? (
                          <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 font-bold uppercase tracking-wider">
                            ▶ Lectures
                          </span>
                        ) : (
                          <span className="rounded-full bg-indigo-500/20 text-indigo-300 px-2 py-0.5 font-bold uppercase tracking-wider">
                            Questions
                          </span>
                        )}
                        {(c.kind ?? "questions") === "questions" && (
                          <>
                            <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 font-semibold uppercase tracking-wider">
                              {c.category}
                            </span>
                            <span className="rounded-full bg-purple-500/15 text-purple-300 px-2 py-0.5 font-medium">
                              {c.exam_type}
                            </span>
                          </>
                        )}
                        <span className="rounded-full bg-blue-500/15 text-blue-300 px-2 py-0.5 font-medium">
                          Y{c.year}
                        </span>
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 font-medium">
                          ${Number(c.price).toFixed(2)}
                        </span>
                        {c.paddle_price_id && c.paddle_price_id.startsWith("pri_") ? (
                          <span
                            className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 font-medium"
                            title={`Paddle Price ID: ${c.paddle_price_id}`}
                          >
                            ✓ Paddle Synced
                          </span>
                        ) : Number(c.price) > 0 ? (
                          <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 font-medium">
                            Not in Paddle
                          </span>
                        ) : null}
                        {c.university_id && (
                          <span className="rounded-full bg-white/10 text-white/80 px-2 py-0.5 font-medium">
                            {universities.find((u) => u.id === c.university_id)?.short_name ??
                              universities.find((u) => u.id === c.university_id)?.name ??
                              "Uni"}
                          </span>
                        )}
                        {!c.university_id && (
                          <span className="rounded-full bg-rose-500/15 text-rose-300 px-2 py-0.5 font-medium">
                            No university
                          </span>
                        )}
                      </div>


                    </div>
                    <Pencil size={14} className="text-white/40 group-hover:text-white shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Users + assignments */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UsersIcon size={18} className="text-blue-400" />
            <h2 className="font-semibold text-lg">User Access</h2>
          </div>
          <div className="relative mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users by name, username or email…"
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] pl-11 pr-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-white/50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] max-h-[480px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-sm text-white/50">No users found.</div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {filteredUsers.map((u) => {
                    const count = enrollmentsFor(u.id).length;
                    const active = selectedUser?.id === u.id;
                    return (
                      <li key={u.id}>
                        <button
                          onClick={() => setSelectedUser(u)}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                            active ? "bg-white/10" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {u.full_name || u.username}
                            </div>
                            <div className="text-xs text-white/50 truncate">@{u.username}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-white/10 text-white/80 px-2 py-0.5 text-xs">
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="lg:col-span-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 min-h-[480px]">
              {!selectedUser ? (
                <div className="h-full flex items-center justify-center text-sm text-white/50">
                  Select a user to manage their course access.
                </div>
              ) : (
                <>
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-white/40">
                        Managing access for
                      </div>
                      <div className="text-lg font-semibold">
                        {selectedUser.full_name || selectedUser.username}
                      </div>
                      <div className="text-xs text-white/50">{selectedUser.email}</div>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="text-white/40 hover:text-white/80"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
                    Courses ({enrollmentsFor(selectedUser.id).length} granted)
                  </div>
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {courses.length === 0 ? (
                      <div className="text-sm text-white/50">No courses to assign yet.</div>
                    ) : (
                      courses.map((c) => {
                        const has = enrollmentsFor(selectedUser.id).some(
                          (e) => e.course_id === c.id,
                        );
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                              has
                                ? "border-emerald-500/30 bg-emerald-500/5"
                                : "border-white/10 bg-black/30"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate flex items-center gap-2">
                                {has && <Check size={14} className="text-emerald-400 shrink-0" />}
                                {c.title}
                              </div>
                              <div className="text-xs text-white/50 mt-0.5">
                                Year {c.year} · ${Number(c.price).toFixed(2)}
                              </div>
                            </div>
                            {has ? (
                              <button
                                onClick={() => revokeCourse(selectedUser.id, c.id)}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-red-500 hover:bg-red-400 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                            ) : (
                              <button
                                onClick={() => grantCourse(selectedUser.id, c.id)}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 transition-colors"
                              >
                                <Plus size={13} /> Add
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="mt-12 text-center">
          <Link to="/" className="text-sm text-white/60 hover:text-white">
            ← Back to home
          </Link>
        </div>
      </main>

      {editingCourse && (
        <EditCourseModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSaved={() => {
            setEditingCourse(null);
            refresh();
          }}
          onDelete={() => deleteCourse(editingCourse.id)}
          setError={setError}
        />
      )}
    </div>
  );
}

function EditCourseModal({
  course,
  onClose,
  onSaved,
  onDelete,
  setError,
}: {
  course: Course;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  setError: (m: string | null) => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [price, setPrice] = useState(String(course.price));
  const [paddlePriceId, setPaddlePriceId] = useState(course.paddle_price_id ?? "");
  const [year, setYear] = useState(course.year);
  const options = useCourseOptions();
  const [category, setCategory] = useState<string>(course.category ?? "major");
  const [examType, setExamType] = useState(course.exam_type);
  const [subjects, setSubjects] = useState(String(course.subjects_count));
  const [qMid, setQMid] = useState(String(course.questions_count_mid));
  const [qFinal, setQFinal] = useState(String(course.questions_count_final));
  const [imageUrl, setImageUrl] = useState(course.image_url);
  const [published, setPublished] = useState(course.published);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingPaddle, setSyncingPaddle] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAutoGeneratePrice() {
    if (Number(price) <= 0) {
      setError("Please set a price greater than 0 first.");
      return;
    }
    setSyncingPaddle(true);
    setError(null);
    try {
      const res = await syncPaddleCoursePrice({
        data: {
          courseId: course.id,
          title: title.trim(),
          price: Number(price),
          environment: "live",
        },
      });
      if (res.paddlePriceId) {
        setPaddlePriceId(res.paddlePriceId);
        toast.success(`Paddle price generated: ${res.paddlePriceId}`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to generate Paddle price");
    } finally {
      setSyncingPaddle(false);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    const img = await compressImage(file, { maxEdge: 1600 });
    const path = `${course.id}/${Date.now()}.${img.ext}`;
    const { error: upErr } = await supabase.storage
      .from("course-images")
      .upload(path, img.file, { upsert: true, contentType: img.contentType });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    // Store the storage path (bucket is private — UI resolves a signed URL).
    setImageUrl(path);
    setUploading(false);
  }

  async function save(nextPublished?: boolean) {
    setSaving(true);
    setError(null);
    const finalPublished = nextPublished ?? published;
    let finalPaddlePriceId = paddlePriceId.trim() || null;

    const priceChanged = Number(price) !== Number(course.price);
    const titleChanged = title.trim() !== course.title.trim();
    if (Number(price) > 0 && (!finalPaddlePriceId || priceChanged || titleChanged)) {
      try {
        const res = await syncPaddleCoursePrice({
          data: {
            courseId: course.id,
            title: title.trim(),
            price: Number(price),
            environment: "live",
          },
        });
        if (res.paddlePriceId) {
          finalPaddlePriceId = res.paddlePriceId;
          setPaddlePriceId(finalPaddlePriceId || "");
        }
      } catch (err) {
        console.warn("Auto-sync on save failed:", err);
      }
    }

    const { error } = await supabase
      .from("courses")
      .update({
        title: title.trim(),
        price: Number(price) || 0,
        paddle_price_id: finalPaddlePriceId,
        year,
        category,
        exam_type: examType,
        subjects_count: Number(subjects) || 0,
        questions_count_mid: Number(qMid) || 0,
        questions_count_final: Number(qFinal) || 0,
        image_url: imageUrl,
        published: finalPublished,
      })
      .eq("id", course.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-2xl my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40">Editing course</div>
            <h3 className="text-lg font-bold">{course.title}</h3>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Image */}
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 mb-2 block">
              Cover image
            </label>
            <div className="flex items-center gap-4">
              <div className="h-24 w-32 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center border border-white/10">
                {imageUrl ? (
                  <CourseThumb value={imageUrl} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-white/30">No image</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-sm px-4 py-2 transition-colors"
                >
                  <Upload size={14} /> {uploading ? "Uploading…" : "Upload image"}
                </button>
                {imageUrl && (
                  <button
                    onClick={() => setImageUrl(null)}
                    className="text-xs text-red-400 hover:text-red-300 text-left"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
            </Field>
            <Field label="Price ($)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
            </Field>
            <Field label="Payment price ID">
              <div className="flex items-center gap-2">
                <input
                  value={paddlePriceId}
                  onChange={(e) => setPaddlePriceId(e.target.value)}
                  placeholder="Leave empty to auto-generate"
                  className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
                />
                <button
                  type="button"
                  onClick={handleAutoGeneratePrice}
                  disabled={syncingPaddle || Number(price) <= 0}
                  className="px-2.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40"
                  title="Generate or sync price in Paddle"
                >
                  {syncingPaddle ? "Syncing…" : "⚡ Auto-Generate"}
                </button>
              </div>
              {Number(price) > 0 && !paddlePriceId.trim() && (
                <p className="mt-1 text-[11px] text-emerald-400">
                  ⚡ Will be automatically generated in Paddle upon saving.
                </p>
              )}
            </Field>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              >
                {options.category.some((o) => o.value === category) ? null : (
                  <option value={category}>{category}</option>
                )}
                {options.category.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              >
                {options.year.some((o) => Number(o.value) === year) ? null : (
                  <option value={year}>Year {year}</option>
                )}
                {options.year.map((o) => (
                  <option key={o.id} value={Number(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Exam type / badge">
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              >
                {options.exam_type.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subjects">
              <input
                type="number"
                min="0"
                value={subjects}
                onChange={(e) => setSubjects(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
            </Field>
            <Field label="Mid questions">
              <input
                type="number"
                min="0"
                value={qMid}
                onChange={(e) => setQMid(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
            </Field>
            <Field label="Final questions">
              <input
                type="number"
                min="0"
                value={qFinal}
                onChange={(e) => setQFinal(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
              />
            </Field>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                {published ? (
                  <>
                    <Eye size={16} className="text-emerald-400" /> Published
                  </>
                ) : (
                  <>
                    <EyeOff size={16} className="text-white/50" /> Unpublished
                  </>
                )}
              </div>
              <div className="text-xs text-white/50 mt-0.5">
                {published
                  ? "Visible to everyone on the Courses page."
                  : "Hidden from students. Only you can see it here."}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 p-5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold px-4 py-2 transition-colors"
          >
            <Trash2 size={14} /> Delete course
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => save()}
              disabled={saving || uploading}
              className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
            {published ? (
              <button
                onClick={() => {
                  setPublished(false);
                  save(false);
                }}
                disabled={saving || uploading}
                className="inline-flex items-center gap-2 rounded-md bg-red-500 hover:bg-red-400 text-white text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-50"
              >
                <EyeOff size={14} /> Unpublish
              </button>
            ) : (
              <button
                onClick={() => {
                  setPublished(true);
                  save(true);
                }}
                disabled={saving || uploading}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-50"
              >
                <Eye size={14} /> Publish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-white/50 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
