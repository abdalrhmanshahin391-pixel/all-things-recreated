import { useCallback, useEffect, useState } from "react";
import { FileText, Link2, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type CourseMaterial = {
  id: string;
  course_id: string;
  title: string;
  kind: string;
  url: string | null;
  storage_path: string | null;
  position: number;
};

/** Files and links that belong to the whole lecture course. */
export function CourseMaterialsCard({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<CourseMaterial[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from as any)("lecture_course_materials")
      .select("id,course_id,title,kind,url,storage_path,position")
      .eq("course_id", courseId)
      .order("position");
    if (error) setErr(error.message);
    else setRows((data as CourseMaterial[]) ?? []);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    let storagePath: string | null = null;
    if (file) {
      const key = `course/${courseId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("lecture-pdfs")
        .upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setBusy(false);
        setErr(upErr.message);
        return;
      }
      storagePath = key;
    }
    const { error } = await (supabase.from as any)("lecture_course_materials").insert({
      course_id: courseId,
      title: title.trim(),
      kind: storagePath ? "pdf" : "link",
      url: url.trim() || null,
      storage_path: storagePath,
      position: rows.length,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setTitle("");
      setUrl("");
      setFile(null);
      load();
    }
  }

  async function remove(row: CourseMaterial) {
    if (!confirm(`Remove "${row.title}"?`)) return;
    if (row.storage_path) await supabase.storage.from("lecture-pdfs").remove([row.storage_path]);
    const { error } = await (supabase.from as any)("lecture_course_materials").delete().eq("id", row.id);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="text-primary" size={18} />
        <h2 className="font-semibold text-sm text-foreground">Course material</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Files and links for the whole course — students see these above the topics.
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Full course handbook)"
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link (optional)"
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <label className="rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-sm cursor-pointer hover:border-accent flex items-center gap-2">
          <Upload size={14} />
          <span className="truncate">{file ? file.name : "Or upload a PDF…"}</span>
          <input
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,.ppt,.pptx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
      </div>
      <button
        onClick={add}
        disabled={busy || !title.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add material
      </button>

      <div className="mt-5 space-y-1.5">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No course-wide material yet.</div>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                {r.storage_path ? (
                  <FileText size={14} className="text-primary shrink-0" />
                ) : (
                  <Link2 size={14} className="text-primary shrink-0" />
                )}
                <span className="text-sm text-foreground truncate">{r.title}</span>
              </div>
              <button
                onClick={() => remove(r)}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
