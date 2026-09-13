import { useState } from "react";
import { KeyRound, Trash2, Loader2, ListOrdered, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Props = {
  totalQuestions: number;
  answeredQuestions: number;
  onApplyKey: (text: string) => Promise<{ totalParsed: number; appliedCount: number }>;
  onClearAnswers: () => Promise<void>;
  disabled?: boolean;
};

export function AnswerKeyCard({
  totalQuestions,
  answeredQuestions,
  onApplyKey,
  onClearAnswers,
  disabled,
}: Props) {
  const [open, setOpen] = useState(answeredQuestions > 0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleApply() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Please paste or type the answer key first.");
      return;
    }
    setBusy(true);
    try {
      const res = await onApplyKey(trimmed);
      toast.success(`Applied ${res.appliedCount} answer(s) from ${res.totalParsed} parsed item(s)`);
      setText("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply answer key");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("Are you sure you want to clear all provided answers for this job?")) return;
    setBusy(true);
    try {
      await onClearAnswers();
      toast.success("Cleared all provided answers");
    } catch (e: any) {
      toast.error(e?.message || "Failed to clear answers");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <KeyRound size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-black">Answer Key / مفتاح الإجابات</p>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                {answeredQuestions} / {totalQuestions} answered
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional: Provide known answers. Gemini will strictly use them and generate explanations.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={open}
          aria-label="Toggle answer key input"
          disabled={disabled || busy}
          onClick={() => setOpen(!open)}
          className={`h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            open ? "bg-emerald-600" : "bg-muted"
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
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListOrdered size={13} />
              Paste numbered list (<code className="text-[11px] font-mono">1. A</code>), pairs (<code className="text-[11px] font-mono">1:A 2:C</code>), or stream (<code className="text-[11px] font-mono">A B C D</code>)
            </span>
            {answeredQuestions > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled || busy}
                className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
              >
                <Trash2 size={12} /> Clear all answers
              </button>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || busy}
            rows={4}
            placeholder={`1. A\n2. C\n3. B\n4. D\n...or paste: 1:A, 2:B, 3:C, 4:D\n...or just letters: A B C D A B C`}
            className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              You can also click letters (A–E) directly on any question card below.
            </p>
            <button
              type="button"
              onClick={handleApply}
              disabled={disabled || busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Apply Answer Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
