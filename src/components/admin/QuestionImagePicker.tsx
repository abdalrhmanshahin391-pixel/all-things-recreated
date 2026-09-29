import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { uploadQuestionImage } from "@/lib/question-image";

/** Lets an admin attach one picture to a question (stored privately). */
export function QuestionImagePicker({
  path,
  onChange,
}: {
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      // The old picture is only deleted after the question is saved.
      const next = await uploadQuestionImage(file);
      onChange(next);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not upload that picture.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-white/50">Picture (optional)</span>
      {path && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <QuestionImage path={path} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/5 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          {path ? "Replace picture" : "Add picture"}
        </button>
        {path && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove picture
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}
