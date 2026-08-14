import { useEffect, useState } from "react";
import { BookOpen, Check, Loader2, Trash2 } from "lucide-react";

type Props = {
  /** the book currently saved on the job (null when off) */
  saved: string | null;
  onSave: (book: string | null) => Promise<void> | void;
  disabled?: boolean;
};

/**
 * Optional "answer according to a textbook" control. When off, nothing is sent
 * to Gemini and the tool behaves exactly as before.
 */
export function ReferenceBookCard({ saved, onSave, disabled }: Props) {
  const [on, setOn] = useState(Boolean(saved));
  const [text, setText] = useState(saved ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(Boolean(saved));
    setText(saved ?? "");
  }, [saved]);

  async function save() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try { await onSave(value); } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try { await onSave(null); setText(""); setOn(false); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <BookOpen size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">Use a reference textbook</p>
          <p className="text-xs text-muted-foreground">
            Optional — answers and explanations will follow the book you name.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Use a reference textbook"
          disabled={disabled || busy}
          onClick={() => {
            const next = !on;
            setOn(next);
            if (!next && saved) void clear();
          }}
          className={`ml-auto h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`block size-6 rounded-full bg-background shadow transition-transform ${on ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>

      {on && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Robbins & Cotran Pathologic Basis of Disease"
              disabled={disabled || busy}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={disabled || busy || !text.trim() || text.trim() === saved}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Save book
            </button>
          </div>

          {saved ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Check size={14} /> Answers will follow: {saved}
              <button
                type="button"
                onClick={() => void clear()}
                disabled={disabled || busy}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 font-bold text-destructive-foreground disabled:opacity-40"
              >
                <Trash2 size={13} /> Remove book
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Type the book, then press <strong>Save book</strong> to switch it on.</p>
          )}
        </div>
      )}
    </div>
  );
}
