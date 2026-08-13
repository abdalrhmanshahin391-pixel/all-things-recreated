import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { BookMarked, Search, FileText, Pencil, Trash2, BookOpen } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SaveNoteDialog } from "@/components/SaveNoteDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/notes")({
  head: () => ({ meta: [{ title: "My Notes — AquaQBank" }] }),
  component: NotesPage,
});

type NoteRow = {
  id: string;
  course_id: string;
  subject_id: string | null;
  question_id: string | null;
  snippet_html: string;
  snippet_text: string;
  user_note: string;
  created_at: string;
  courses: { id: string; title: string } | null;
  subjects: { id: string; name: string } | null;
};

function NotesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [editing, setEditing] = useState<NoteRow | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  async function loadNotes() {
    if (!user) return;
    setLoadingNotes(true);
    const { data } = await (supabase.from as any)("notes")
      .select(
        "id,course_id,subject_id,question_id,snippet_html,snippet_text,user_note,created_at,courses(id,title),subjects(id,name)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotes((data ?? []) as NoteRow[]);
    setLoadingNotes(false);
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const courses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notes) {
      if (n.courses) seen.set(n.courses.id, n.courses.title);
    }
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (courseFilter !== "all" && n.course_id !== courseFilter) return false;
      if (!q) return true;
      return (
        n.snippet_text.toLowerCase().includes(q) ||
        n.user_note.toLowerCase().includes(q) ||
        (n.subjects?.name ?? "").toLowerCase().includes(q) ||
        (n.courses?.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [notes, search, courseFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { title: string; notes: NoteRow[] }>();
    for (const n of filtered) {
      const key = n.subjects?.id ?? "_other";
      const title = n.subjects?.name ?? "Other";
      const g = groups.get(key) ?? { title, notes: [] };
      g.notes.push(n);
      groups.set(key, g);
    }
    return Array.from(groups.values());
  }, [filtered]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this note?")) return;
    await (supabase.from as any)("notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  if (loading || !user) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />

      {/* Top hero — matches home page language */}
      <section className="pt-28 pb-12 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-8">
            <div className="flex items-start gap-5 flex-1 min-w-0">
              <div className="grid place-items-center h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
                <BookMarked className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] tracking-[0.35em] text-indigo-600 uppercase font-bold mb-2">
                  Your Library
                </p>
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
                  My Saved{" "}
                  <span className="bg-gradient-to-br from-indigo-500 to-pink-500 bg-clip-text text-transparent">
                    Notes
                  </span>
                </h1>
                <p className="text-slate-600 mt-2 max-w-md text-sm md:text-base">
                  Your personal collection of clinical pearls and study snippets.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your notes..."
                  className="w-full pl-11 pr-4 py-3 rounded-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
                />
              </div>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="px-4 py-3 rounded-full bg-white border border-slate-200 text-slate-900 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
              >
                <option value="all">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>


      <main className="mx-auto max-w-5xl px-6 py-12 space-y-12">
        {loadingNotes ? (
          <div className="text-center text-zinc-500">Loading your notes…</div>
        ) : grouped.length === 0 ? (
          <div className="text-center text-zinc-500 py-20">
            <BookMarked className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
            <p className="font-semibold text-lg">No notes yet</p>
            <p className="text-sm mt-2">
              Open a question's explanation, click the scissor icon, highlight any text and click
              Capture to save your first note.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.title}>
              <div className="flex items-center gap-3 mb-4 border-b border-zinc-200 pb-3">
                <BookOpen className="w-7 h-7 text-amber-500" />
                <h2 className="font-serif text-3xl font-bold">{group.title}</h2>
                <span className="text-zinc-400 text-sm">
                  ({group.notes.length} {group.notes.length === 1 ? "note" : "notes"})
                </span>
              </div>
              <div className="space-y-4">
                {group.notes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    onEdit={() => setEditing(n)}
                    onDelete={() => handleDelete(n.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {editing && (
        <SaveNoteDialog
          open={true}
          payload={null}
          editingId={editing.id}
          initialNote={editing.user_note}
          initialSnippetHtml={editing.snippet_html}
          userId={user.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadNotes();
          }}
        />
      )}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: NoteRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const date = new Date(note.created_at).toLocaleDateString("en-GB");
  const html = useMemo(() => DOMPurify.sanitize(note.snippet_html), [note.snippet_html]);
  return (
    <article className="bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start">
      <div className="flex-1 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5" />
            {note.courses?.title ?? "Course"}
            {note.subjects?.name ? (
              <>
                <span className="opacity-50">•</span>
                {note.subjects.name}
              </>
            ) : null}
          </span>
          <span className="text-xs text-zinc-500">📅 {date}</span>
        </div>

        <div className="text-xs font-bold tracking-widest text-amber-600 uppercase mb-3 inline-flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Captured explanation
        </div>

        <div
          className="border-l-4 border-amber-300 rounded-r-lg p-4"
          style={{ background: "#ffffff" }}
        >
          <div
            className="text-sm leading-relaxed max-w-none [&_*]:!text-[#0a0a0a] [&_strong]:!font-bold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-300 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-zinc-900 [&_th]:!text-white"
            style={{ color: "#0a0a0a", background: "#ffffff" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {note.user_note && (
            <div className="mt-4 pt-4 border-t border-zinc-200">
              <div className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-1.5">
                Your note
              </div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{note.user_note}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 border-l border-zinc-100">
        <button
          onClick={onEdit}
          title="Edit note"
          className="p-2 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
        >
          <Pencil className="w-5 h-5" />
        </button>
        <button
          onClick={onDelete}
          title="Delete note"
          className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </article>
  );
}
