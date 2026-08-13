import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Upload, Eye, EyeOff, Languages, BookOpen, Type, MessageSquareText, Shuffle, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { compressImage } from "@/lib/image-compress";

export const Route = createFileRoute("/admin/german/")({
  head: () => ({ meta: [{ title: "German Learning — Admin" }] }),
  component: AdminGermanPage,
});

type ContentType = "words" | "sentences" | "mixed" | "shadowing";
type Course = {
  id: string;
  title: string;
  image_path: string | null;
  published: boolean;
  position: number;
  content_type: ContentType;
};

const COURSE_TYPES: Record<ContentType, { label: string; note: string; icon: any; pill: string }> = {
  words: { label: "Words course", note: "Vocabulary banks + game + voice", icon: Type, pill: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40" },
  sentences: { label: "Sentences course", note: "Sentence banks + exam/session/study + voice", icon: MessageSquareText, pill: "bg-sky-500/15 text-sky-200 border-sky-400/40" },
  mixed: { label: "Choose type", note: "Open course and choose words or sentences", icon: Shuffle, pill: "bg-amber-500/15 text-amber-200 border-amber-400/40" },
  shadowing: { label: "Smart Review (Shadowing)", note: "Repeat-after-me practice with pronunciation scoring", icon: Languages, pill: "bg-blue-500/15 text-blue-200 border-blue-400/40" },
};

function AdminGermanPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newType, setNewType] = useState<ContentType>("words");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await (supabase.from as any)("german_courses")
      .select("id,title,image_path,published,position,content_type")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    const list = ((data ?? []) as Course[]).map((c) => ({ ...c, content_type: (c.content_type ?? "mixed") as ContentType }));
    setCourses(list);
    const entries = await Promise.all(
      list.map(async (c) => [c.id, (await resolveCourseImageUrl(c.image_path)) ?? ""] as const),
    );
    setCovers(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) guardRedirect(navigate);
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  async function createCourse() {
    setErr(null);
    if (!newTitle.trim()) {
      setErr("Title required");
      return;
    }
    setBusy(true);
    try {
      let image_path: string | null = null;
      if (newFile) {
        const img = await compressImage(newFile, { maxEdge: 1600 });
        const path = `german/${crypto.randomUUID()}-${img.file.name}`;
        const { error } = await supabase.storage
          .from("course-images")
          .upload(path, img.file, { upsert: false, contentType: img.contentType });
        if (error) throw error;
        image_path = path;
      }
      const { error } = await (supabase.from as any)("german_courses").insert({
        title: newTitle.trim(),
        image_path,
        position: courses.length,
        content_type: newType,
      });
      if (error) throw error;
      setCreating(false);
      setNewTitle("");
      setNewFile(null);
      setNewType("words");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(c: Course) {
    await (supabase.from as any)("german_courses").update({ published: !c.published }).eq("id", c.id);
    load();
  }

  async function removeCourse(c: Course) {
    if (!confirm(`Delete "${c.title}"? This removes all subjects, items and entries inside.`)) return;
    await (supabase.from as any)("german_courses").delete().eq("id", c.id);
    load();
  }

  if (loading || !isAdmin) return null;

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen pt-28 pb-20 px-6 md:px-12 bg-slate-950 text-slate-100">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300 flex items-center gap-2">
                <Languages size={14} /> Deutsch Lernen
              </div>
              <h1 className="text-3xl md:text-4xl font-black mt-2 bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
                German Learning · Courses
              </h1>
              <p className="text-white/60 text-sm mt-2 max-w-xl">
                Choose if each course is for words only or sentences only, then open it to add subjects and practice modes.
              </p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5 shadow-lg shadow-emerald-500/30"
            >
              <Plus size={16} /> New course
            </button>
          </div>

          {courses.length === 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
              <BookOpen size={32} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-white/70 text-sm">No German courses yet. Create your first one to get started.</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((c) => {
              const meta = COURSE_TYPES[c.content_type ?? "mixed"];
              const Icon = meta.icon;
              return (
                <div key={c.id} className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/[0.02] overflow-hidden hover:border-emerald-500/40 transition">
                  <Link to="/german/$courseId" params={{ courseId: c.id }} className="block aspect-video bg-slate-900 relative overflow-hidden cursor-pointer">
                    {covers[c.id] ? (
                      <img src={covers[c.id]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="w-full h-full grid place-items-center bg-gradient-to-br from-emerald-900/40 to-slate-900">
                        <Languages size={36} className="text-emerald-400/50" />
                      </div>
                    )}
                  </Link>
                  <div className="p-4">
                    <Link to="/german/$courseId" params={{ courseId: c.id }} className="font-bold text-base hover:text-emerald-300 transition">
                      {c.title}
                    </Link>
                    <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.pill}`}>
                      <Icon size={12} /> {meta.label}
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Link
                        to="/german/$courseId"
                        params={{ courseId: c.id }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/25"
                      >
                        Practice
                      </Link>
                      <Link
                        to="/admin/german/$courseId/manage"
                        params={{ courseId: c.id }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25"
                      >
                        <ListChecks size={12} /> Quizzes
                      </Link>
                      <Link
                        to="/admin/german/$courseId"
                        params={{ courseId: c.id }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-white/5 text-white/70 border border-white/10 hover:border-emerald-400/40"
                      >
                        Manage
                      </Link>
                      <button
                        onClick={() => togglePublish(c)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                          c.published ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-white/50 border border-white/10"
                        }`}
                      >
                        {c.published ? <Eye size={12} /> : <EyeOff size={12} />}
                        {c.published ? "Published" : "Draft"}
                      </button>
                      <button onClick={() => removeCourse(c)} className="ml-auto p-1.5 rounded-md text-white/40 hover:text-rose-400 hover:bg-rose-500/10" aria-label={`Delete ${c.title}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">New course</div>
              <div className="font-bold mt-0.5">Create a German course</div>
            </div>
            <div className="p-5 space-y-4">
              {err && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{err}</div>}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 block mb-1.5">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. German A1 — Foundations"
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 block mb-1.5">Course type</label>
                <div className="grid gap-2">
                  {(["words", "sentences", "shadowing"] as ContentType[]).map((t) => {
                    const meta = COURSE_TYPES[t];
                    const Icon = meta.icon;
                    const active = newType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewType(t)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${active ? meta.pill : "border-white/10 bg-white/5 text-white/70 hover:border-emerald-400/40"}`}
                      >
                        <Icon size={17} />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{meta.label}</span>
                          <span className="block text-[11px] text-white/50">{meta.note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 block mb-1.5">Cover image</label>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-white/20 bg-black/30 px-3 py-3 text-sm text-white/70 hover:border-emerald-400/50">
                  <Upload size={16} />
                  {newFile ? newFile.name : "Choose image…"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10 bg-black/30">
              <button
                onClick={() => {
                  setCreating(false);
                  setErr(null);
                }}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button onClick={createCourse} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}