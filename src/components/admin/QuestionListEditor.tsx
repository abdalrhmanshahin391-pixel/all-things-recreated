import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { QuestionImagePicker } from "@/components/admin/QuestionImagePicker";
import { AMG_MODELS, amgRewriteSubjectExplanations } from "@/lib/aqua-mcq-gen.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id?: string; label: string; text: string; is_correct: boolean; sort_order: number };
type Question = {
  id: string;
  stem: string;
  explanation: string | null;
  sort_order: number;
  image_url: string | null;
  answer_mode: "single" | "multiple";
  options: Option[];
};

const LETTERS = "ABCDEFGHIJ".split("");

export function QuestionListEditor({ subjectId }: { subjectId: string }) {
  const [rows, setRows] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  // Keep typing responsive: filtering the (possibly large) list happens at a
  // lower priority than the keystroke itself.
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const rewriteExplanations = useServerFn(amgRewriteSubjectExplanations);
  const [provider, setProvider] = useState<"google" | "openai">("google");
  const [model, setModel] = useState<string>(AMG_MODELS.google[1].id);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number; message: string; error: string | null } | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    if (!subjectId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase.from as any)("questions")
      .select("id, stem, explanation, sort_order, image_url, answer_mode, question_options(id, label, text, is_correct, sort_order)")
      .eq("subject_id", subjectId)
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list: Question[] = (data ?? []).map((q: any) => ({
      id: q.id,
      stem: q.stem ?? "",
      explanation: q.explanation ?? null,
      sort_order: q.sort_order ?? 0,
      image_url: q.image_url ?? null,
      answer_mode: q.answer_mode === "multiple" ? "multiple" : "single",
      options: [...(q.question_options ?? [])]
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((o: any, i: number) => ({
          id: o.id,
          label: o.label ?? LETTERS[i] ?? String(i + 1),
          text: o.text ?? "",
          is_correct: !!o.is_correct,
          sort_order: o.sort_order ?? i,
        })),
    }));
    setRows(list);
    setSelected(new Set());
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.stem.toLowerCase().includes(q) ||
        (r.explanation ?? "").toLowerCase().includes(q) ||
        r.options.some((o) => o.text.toLowerCase().includes(q)),
    );
  }, [rows, deferredQuery]);

  // Position lookup: doing rows.findIndex() inside the render loop made the
  // list quadratic, which is what made typing feel laggy on big subjects.
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [rows]);

  async function deleteQuestions(ids: string[]) {
    if (ids.length === 0) return;
    const ok = window.confirm(
      ids.length === 1 ? "Delete this question?" : `Delete ${ids.length} questions?`,
    );
    if (!ok) return;
    setBusy(true);
    const { error: optErr } = await (supabase.from as any)("question_options").delete().in("question_id", ids);
    if (optErr) {
      setBusy(false);
      toast.error(optErr.message);
      return;
    }
    const { error } = await (supabase.from as any)("questions").delete().in("id", ids);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(ids.length === 1 ? "Question deleted." : `${ids.length} questions deleted.`);
    void load();
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    setBusy(true);
    await (supabase.from as any)("questions").update({ sort_order: b.sort_order }).eq("id", a.id);
    await (supabase.from as any)("questions").update({ sort_order: a.sort_order }).eq("id", b.id);
    setBusy(false);
    void load();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function rewriteAll() {
    setConfirmOpen(false);
    stopRef.current = false;
    setRewriting(true);
    setProgress({ done: 0, failed: 0, total: 0, message: "Starting…", error: null });
    try {
      let done = 0;
      let failed = 0;
      let total = 0;
      for (;;) {
        const result: any = await rewriteExplanations({ data: { subjectId, provider, model, onlyEmpty, limit: 4 } });
        done += result.rewritten ?? 0;
        failed += result.failures?.length ?? 0;
        if (typeof result.total === "number" && !total) total = result.total;
        const lastError = result.failures?.length ? String(result.failures[0]) : null;
        setProgress({
          done,
          failed,
          total,
          message: total ? `Rewriting… ${done} of ${total} done` : `Rewriting… ${done} done`,
          error: lastError,
        });
        if (!result.rewritten && !result.failures?.length) {
          setProgress({
            done,
            failed,
            total,
            message: done ? `Finished. ${done} explanation(s) rewritten.` : onlyEmpty
              ? "Every question in this subject already has an explanation."
              : "All explanations in this subject already use the new format.",
            error: lastError,
          });
          break;
        }
        if (!result.remaining) {
          setProgress({ done, failed, total, message: `Finished. ${done} rewritten${failed ? `, ${failed} failed` : ""}.`, error: lastError });
          break;
        }
        if (stopRef.current) {
          setProgress({ done, failed, total, message: `Stopped. ${done} rewritten${failed ? `, ${failed} failed` : ""}.`, error: lastError });
          break;
        }
      }
      if (done) toast.success(`Rewrote ${done} explanation(s).`);
      await load();
    } catch (e: any) {
      const message = e?.message || "Could not rewrite explanations";
      setProgress((prev) => ({ ...(prev ?? { done: 0, failed: 0, total: 0 }), message: "Stopped because of an error.", error: message }));
      toast.error(message);
    }
    finally { setRewriting(false); stopRef.current = false; }
  }

  if (!subjectId) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-lg text-white">Questions in this subject</h2>
          <p className="text-xs text-white/50 mt-0.5">
            {loading ? "Loading…" : `${rows.length} question${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => deleteQuestions([...selected])}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/50 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete selected ({selected.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, options, explanations…"
          className="w-full rounded-lg border border-white/15 bg-black/40 pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-400"
        />
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4 md:grid-cols-[1fr_1fr_auto]">
        <Select value={provider} onValueChange={(value: "google" | "openai") => {
          setProvider(value); setModel(AMG_MODELS[value][0].id);
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="google">Google AI Studio</SelectItem><SelectItem value="openai">OpenAI</SelectItem></SelectContent>
        </Select>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{AMG_MODELS[provider].map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => { setProgress(null); setConfirmOpen(true); }} disabled={rewriting || !rows.length}>{rewriting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Rewrite explanations</Button>
        <label className="flex items-center gap-2 text-xs text-white/70 md:col-span-3">
          <input type="checkbox" checked={onlyEmpty} onChange={(event) => setOnlyEmpty(event.target.checked)} className="accent-amber-400" />
          Only questions without an explanation
        </label>

        {confirmOpen && !rewriting && (
          <div className="md:col-span-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-white/80">
            <p className="font-bold text-white">Replace {onlyEmpty ? "missing" : "old"} explanations in this subject?</p>
            <p className="mt-1 text-xs text-white/60">
              Model: {AMG_MODELS[provider].find((m) => m.id === model)?.label ?? model} ({provider === "google" ? "Google AI Studio" : "OpenAI"}).
              Questions, options and answers will not change.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void rewriteAll()}><Sparkles className="mr-2 h-4 w-4" />Start rewriting</Button>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {(rewriting || progress) && (
          <div className="md:col-span-3 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {rewriting && <Loader2 className="h-4 w-4 animate-spin text-amber-300" />}
                {progress?.message ?? "Starting…"}
              </span>
              {rewriting
                ? <Button variant="outline" onClick={() => { stopRef.current = true; }}>Stop</Button>
                : <Button variant="outline" onClick={() => setProgress(null)}>Hide</Button>}
            </div>
            {progress?.failed ? <p className="mt-2 text-xs text-amber-300">{progress.failed} question(s) failed.</p> : null}
            {progress?.error ? <p className="mt-1 text-xs text-rose-300 break-words">{progress.error}</p> : null}
          </div>
        )}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-6 text-center text-sm text-white/50">
          {rows.length === 0 ? "No questions in this subject yet." : "No questions match your search."}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((q) => {
          const index = indexById.get(q.id) ?? 0;
          return (
            <div key={q.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggle(q.id)}
                  className="mt-1 accent-amber-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white/40">#{index + 1}</div>
                  <div className="text-sm text-white whitespace-pre-wrap break-words">{q.stem}</div>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o) => (
                      <li
                        key={o.id ?? o.label}
                        className={`text-xs flex items-start gap-2 ${o.is_correct ? "text-emerald-300" : "text-white/60"}`}
                      >
                        <span className="font-bold">{o.label}.</span>
                        <span className="break-words">{o.text}</span>
                        {o.is_correct && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-[11px] text-white/35">
                    {q.explanation?.trim() ? "Has explanation" : "No explanation"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(q)}
                    title="Edit question"
                    className="p-1.5 rounded-md text-white/60 hover:text-amber-300 hover:bg-white/10"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteQuestions([q.id])}
                    disabled={busy}
                    title="Delete question"
                    className="p-1.5 rounded-md text-white/60 hover:text-rose-400 hover:bg-white/10 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0 || !!query.trim()}
                    title="Move up"
                    className="p-1.5 rounded-md text-white/60 hover:text-sky-300 hover:bg-white/10 disabled:opacity-25"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={busy || index === rows.length - 1 || !!query.trim()}
                    title="Move down"
                    className="p-1.5 rounded-md text-white/60 hover:text-sky-300 hover:bg-white/10 disabled:opacity-25"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditQuestionDialog
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function EditQuestionDialog({
  question,
  onClose,
  onSaved,
}: {
  question: Question;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stem, setStem] = useState(question.stem);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [options, setOptions] = useState<Option[]>(
    question.options.length
      ? question.options
      : [
          { label: "A", text: "", is_correct: true, sort_order: 0 },
          { label: "B", text: "", is_correct: false, sort_order: 1 },
        ],
  );
  const [multi, setMulti] = useState(question.answer_mode === "multiple");
  const [imagePath, setImagePath] = useState<string | null>(question.image_url);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  async function save() {
    setErr(null);
    if (!stem.trim() && !imagePath) {
      setErr("Write the question text or add a picture.");
      return;
    }
    const clean = options.filter((o) => o.text.trim());
    if (clean.length < 2) {
      setErr("Keep at least two answer choices.");
      return;
    }
    const correctCount = clean.filter((o) => o.is_correct).length;
    if (correctCount < 1) {
      setErr("Mark at least one choice as correct.");
      return;
    }
    if (multi && correctCount < 2) {
      setErr("Mark at least two correct choices, or turn off “More than one answer”.");
      return;
    }
    setSaving(true);
    try {
      const { error: qErr } = await (supabase.from as any)("questions")
        .update({
          stem: stem.trim(),
          explanation: explanation.trim() || null,
          answer_mode: multi ? "multiple" : "single",
          image_url: imagePath,
        })
        .eq("id", question.id);
      if (qErr) throw qErr;

      const { error: delErr } = await (supabase.from as any)("question_options")
        .delete()
        .eq("question_id", question.id);
      if (delErr) throw delErr;

      const rows = clean.map((o, i) => ({
        question_id: question.id,
        label: LETTERS[i] ?? String(i + 1),
        text: o.text.trim(),
        is_correct: !!o.is_correct,
        sort_order: i,
      }));
      const { error: insErr } = await (supabase.from as any)("question_options").insert(rows);
      if (insErr) throw insErr;

      toast.success("Question updated.");
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save the question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-900 text-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="font-bold">Edit question</div>
          <button type="button" onClick={onClose} className="p-1 text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {err}
            </div>
          )}

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Question</span>
            <textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              className="min-h-28 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
            />
          </label>

          <QuestionImagePicker path={imagePath} onChange={setImagePath} />


          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">
                {multi ? "Choices · tick every correct one" : "Choices · pick the correct one"}
              </span>
              <label className="inline-flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={multi}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setMulti(on);
                    if (!on) {
                      setOptions((curr) => {
                        const first = curr.findIndex((x) => x.is_correct);
                        return curr.map((x, j) => ({ ...x, is_correct: j === (first === -1 ? 0 : first) }));
                      });
                    }
                  }}
                  className="accent-emerald-400"
                />
                More than one answer
              </label>
            </div>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setOptions((curr) =>
                      multi
                        ? curr.map((x, j) => (j === i ? { ...x, is_correct: !x.is_correct } : x))
                        : curr.map((x, j) => ({ ...x, is_correct: j === i })),
                    )
                  }
                  title="Mark as correct"
                  className={`grid place-items-center h-9 w-9 shrink-0 rounded-md border text-xs font-bold transition ${
                    o.is_correct
                      ? "border-emerald-400 bg-emerald-400 text-black"
                      : "border-white/15 bg-black/40 text-white/50 hover:border-emerald-400/50"
                  }`}
                >
                  {LETTERS[i] ?? i + 1}
                </button>
                <input
                  value={o.text}
                  onChange={(e) =>
                    setOptions((curr) => curr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  placeholder={`Choice ${LETTERS[i] ?? i + 1}`}
                  className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setOptions((curr) => curr.filter((_, j) => j !== i))}
                  disabled={options.length <= 2}
                  title="Remove choice"
                  className="p-1.5 rounded-md text-white/50 hover:text-rose-400 hover:bg-white/10 disabled:opacity-25"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {options.length < LETTERS.length && (
              <button
                type="button"
                onClick={() =>
                  setOptions((curr) => [
                    ...curr,
                    { label: LETTERS[curr.length], text: "", is_correct: false, sort_order: curr.length },
                  ])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/5"
              >
                <Plus className="w-3.5 h-3.5" /> Add choice
              </button>
            )}
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Explanation</span>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="min-h-24 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white/60 hover:text-white hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
