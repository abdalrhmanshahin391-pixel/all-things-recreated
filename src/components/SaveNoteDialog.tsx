import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SaveNotePayload = {
  courseId: string;
  subjectId: string | null;
  questionId: string | null;
  snippetHtml: string;
  snippetText: string;
};

type Props = {
  open: boolean;
  payload: SaveNotePayload | null;
  editingId?: string | null;
  initialNote?: string;
  initialSnippetHtml?: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function SaveNoteDialog({
  open,
  payload,
  editingId,
  initialNote = "",
  initialSnippetHtml,
  userId,
  onClose,
  onSaved,
}: Props) {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote(initialNote);
      setError(null);
    }
  }, [open, initialNote]);

  if (!open) return null;

  const snippetHtml = DOMPurify.sanitize(
    initialSnippetHtml ?? payload?.snippetHtml ?? "",
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const { error: err } = await (supabase.from as any)("notes")
          .update({ user_note: note })
          .eq("id", editingId);
        if (err) throw err;
      } else {
        if (!payload) throw new Error("Missing snippet.");
        const { error: err } = await (supabase.from as any)("notes").insert({
          user_id: userId,
          course_id: payload.courseId,
          subject_id: payload.subjectId,
          question_id: payload.questionId,
          snippet_html: DOMPurify.sanitize(payload.snippetHtml),
          snippet_text: payload.snippetText,
          user_note: note,
        });
        if (err) throw err;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "#ffffff", color: "#0a0a0a" }}
      >
        <div
          className="px-6 py-5 flex items-start justify-between gap-4"
          style={{ background: "#1e293b", color: "#ffffff" }}
        >
          <div>
            <div className="flex items-center gap-2 text-lg font-bold">
              <Save className="w-5 h-5" style={{ color: "#fbbf24" }} />
              {editingId ? "Edit Note" : "Save to My Notes"}
            </div>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.72)" }}>
              {editingId
                ? "Update your personal note for this snippet."
                : "Attach a personal note to this snippet for later review."}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="p-6 space-y-5 max-h-[70vh] overflow-y-auto"
          style={{ background: "#ffffff", color: "#0a0a0a" }}
        >
          <div>
            <div
              className="text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: "#52525b" }}
            >
              Selected snippet
            </div>
            <div
              className="rounded-xl p-5 max-h-80 overflow-y-auto text-sm leading-relaxed"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                border: "1px solid #e4e4e7",
              }}
            >
              <div
                style={{ color: "#0a0a0a" }}
                className="[&_*]:!text-[#0a0a0a] [&_strong]:!font-bold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-300 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-zinc-900 [&_th]:!text-white"
                dangerouslySetInnerHTML={{ __html: snippetHtml }}
              />
            </div>
          </div>

          <div>
            <div
              className="text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: "#52525b" }}
            >
              Your note
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write your thoughts, clinical pearls, or reminders here..."
              className="w-full min-h-28 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-400"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                border: "1px solid #d4d4d8",
              }}
            />
          </div>

          {error && (
            <div
              className="rounded-lg text-sm px-3 py-2"
              style={{
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ background: "#ffffff", borderTop: "1px solid #e4e4e7" }}
        >
          <button
            onClick={onClose}
            type="button"
            className="px-5 py-2.5 rounded-full text-sm font-semibold"
            style={{
              background: "#ffffff",
              color: "#0a0a0a",
              border: "1px solid #d4d4d8",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            className="px-6 py-2.5 rounded-full text-sm font-bold disabled:opacity-50"
            style={{ background: "#fbbf24", color: "#0a0a0a" }}
          >
            {saving ? "Saving…" : editingId ? "Save Changes" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
