import { useState, useEffect } from "react";
import { Brain, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  instructions: string | null;
  onSave: (instructions: string | null) => Promise<void>;
  disabled?: boolean;
};

const SUGGESTIONS = [
  "If a question only has 2 options (e.g. True/False or Yes/No), keep only those 2 options and do not invent extra options.",
  "Follow the questionnaire / syllabus topics outline strictly when classifying and explaining.",
  "Focus explanations strictly on clinical guidelines and diagnostic criteria.",
  "Do not invent new options if options are missing; answer based only on what is printed.",
];

export function AiInstructionsCard({ instructions, onSave, disabled }: Props) {
  const [open, setOpen] = useState(Boolean(instructions?.trim()));
  const [text, setText] = useState(instructions ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(instructions ?? "");
    if (instructions?.trim()) setOpen(true);
  }, [instructions]);

  async function handleSave() {
    setSaving(true);
    try {
      const trimmed = text.trim() || null;
      await onSave(trimmed);
      toast.success(trimmed ? "AI instructions saved" : "AI instructions cleared");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save instructions");
    } finally {
      setSaving(false);
    }
  }

  function appendSuggestion(s: string) {
    setText((prev) => {
      const current = prev.trim();
      if (!current) return s;
      if (current.includes(s)) return current;
      return current + "\n" + s;
    });
  }

  const isChanged = (text.trim() || null) !== (instructions?.trim() || null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Brain size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-black">AI Instructions & Notes / توجيهات وملاحظات للذكاء الاصطناعي</p>
              {instructions?.trim() && (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Optional: Give Gemini strict directives before solving (e.g. keep 2 options, PDF focus, or sorting rules).
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={open}
          aria-label="Toggle AI instructions input"
          disabled={disabled || saving}
          onClick={() => setOpen(!open)}
          className={`h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            open ? "bg-violet-600" : "bg-muted"
          }`}
        >
          <span
            className={`block size-6 rounded-full bg-background shadow transition-transform ${
              open ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {open && (
        <div className="pt-2 border-t border-border/60 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground self-center mr-1">Quick prompts:</span>
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => appendSuggestion(s)}
                disabled={disabled || saving}
                className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-40"
                title="Click to add to instructions"
              >
                + {s.slice(0, 42)}...
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || saving}
            rows={4}
            placeholder="e.g.: If a question only has 2 options, keep only those 2 options. Follow clinical guidelines strictly..."
            className="w-full rounded-xl border border-border bg-background p-3 text-xs font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Gemini will receive these instructions with top priority when solving every question.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || saving || !isChanged}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save Instructions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
