import { useEffect, useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type EditingQuestion = {
  id?: string;
  prompt: string;
  explanation: string | null;
  options: { id?: string; body: string; is_correct: boolean }[];
  published?: boolean;
};

export function QuizQuestionModal({
  quizId,
  initial,
  position,
  onClose,
  onSaved,
}: {
  quizId: string;
  initial: EditingQuestion | null;
  position: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [opts, setOpts] = useState<{ id?: string; body: string; is_correct: boolean }[]>([
    { body: "", is_correct: true },
    { body: "", is_correct: false },
    { body: "", is_correct: false },
    { body: "", is_correct: false },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setPrompt(initial.prompt);
      setExplanation(initial.explanation ?? "");
      const padded = [...initial.options];
      while (padded.length < 4) padded.push({ body: "", is_correct: false });
      setOpts(padded.slice(0, 4));
    } else {
      setPrompt("");
      setExplanation("");
      setOpts([
        { body: "", is_correct: true },
        { body: "", is_correct: false },
        { body: "", is_correct: false },
        { body: "", is_correct: false },
      ]);
    }
  }, [initial]);

  function setCorrect(idx: number) {
    setOpts((curr) => curr.map((o, i) => ({ ...o, is_correct: i === idx })));
  }

  async function save(publish: boolean) {
    setErr(null);
    if (!prompt.trim()) { setErr("Question text is required."); return; }
    if (opts.some((o) => !o.body.trim())) { setErr("All four choices (A–D) must be filled."); return; }
    if (!opts.some((o) => o.is_correct)) { setErr("Mark one choice as the correct answer."); return; }
    setBusy(true);
    try {
      let questionId = initial?.id;
      if (questionId) {
        const { error } = await (supabase.from as any)("lecture_quiz_questions")
          .update({ prompt: prompt.trim(), explanation: explanation.trim() || null, published: publish })
          .eq("id", questionId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from as any)("lecture_quiz_questions")
          .insert({
            quiz_id: quizId,
            prompt: prompt.trim(),
            explanation: explanation.trim() || null,
            position,
            published: publish,
          })
          .select("id")
          .maybeSingle();
        if (error || !data) throw error ?? new Error("Insert failed");
        questionId = data.id;
      }

      await (supabase.from as any)("lecture_quiz_options").delete().eq("question_id", questionId);
      const rows = opts.map((o, i) => ({
        question_id: questionId,
        position: i,
        body: o.body.trim(),
        is_correct: !!o.is_correct,
      }));
      const { error: optErr } = await (supabase.from as any)("lecture_quiz_options").insert(rows);
      if (optErr) throw optErr;
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card text-foreground shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {initial?.id ? "Edit question" : "New question"}
            </div>
            <div className="text-foreground font-semibold text-sm mt-0.5">Quiz question editor</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {err}
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1.5">
              Question
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Which artery is most commonly involved in inferior wall MI?"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1.5">
              Choices · pick the correct one
            </label>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrect(i)}
                    className={`grid place-items-center h-9 w-9 rounded-md border text-xs font-semibold shrink-0 transition ${
                      o.is_correct
                        ? "bg-accent border-accent text-accent-foreground"
                        : "bg-background border-border text-muted-foreground hover:border-accent/50"
                    }`}
                    title="Mark as correct"
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                  <input
                    value={o.body}
                    onChange={(e) =>
                      setOpts((curr) => curr.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))
                    }
                    placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  {o.is_correct && <CheckCircle2 size={14} className="text-accent shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1.5">
              Explanation (optional)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Shown after the student answers."
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-muted/40">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-semibold border border-border text-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save draft"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
