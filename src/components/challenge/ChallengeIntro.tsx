import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert, Timer, Trophy } from "lucide-react";
import { declineChallengeServerFn, joinChallengeServerFn } from "@/lib/challenge.functions";
import { CHALLENGE_COPY, validateDisplayName } from "@/lib/challenge";

/**
 * The explanation (Arabic and English) shown before a student's one attempt at the challenge, with the
 * choice to join (and pick a leaderboard name) or ignore it for good.
 */
export function ChallengeIntro({
  courseId,
  total,
  secondsPerQuestion,
  onJoined,
  onDeclined,
}: {
  courseId: string;
  total: number;
  secondsPerQuestion: number;
  onJoined: () => void;
  onDeclined: () => void;
}) {
  const declineFn = useServerFn(declineChallengeServerFn);
  const joinFn = useServerFn(joinChallengeServerFn);
  const [step, setStep] = useState<"intro" | "name" | "confirm">("intro");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = CHALLENGE_COPY;
  const en = copy.intro.en(total, secondsPerQuestion);
  const ar = copy.intro.ar(total, secondsPerQuestion);

  async function ignore() {
    setBusy(true);
    setError(null);
    try {
      await declineFn({ data: { courseId } });
      onDeclined();
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  async function start() {
    const checked = validateDisplayName(name);
    if (!checked.ok) {
      setError(`${checked.en} / ${checked.ar}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinFn({ data: { courseId, displayName: checked.name } });
      onJoined();
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-amber-500/15 to-transparent flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
          <Trophy size={22} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-black">{copy.title.en}</h1>
          <span dir="rtl" className="text-xl font-black">{copy.title.ar}</span>
        </div>
      </div>

      {step === "intro" && (
        <div className="p-6 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <ul className="space-y-2 text-sm leading-relaxed">
              {en.map((line) => (
                <li key={line} className="flex gap-2"><Timer size={14} className="mt-1 shrink-0 text-amber-600" />{line}</li>
              ))}
            </ul>
            <ul dir="rtl" className="space-y-2 text-sm leading-relaxed">
              {ar.map((line) => (
                <li key={line} className="flex gap-2"><Timer size={14} className="mt-1 shrink-0 text-amber-600" />{line}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm grid gap-2 md:grid-cols-2">
            <p className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />{copy.warning.en}</p>
            <p dir="rtl" className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />{copy.warning.ar}</p>
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={() => { setError(null); setStep("confirm"); }}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
            >
              {copy.ignore.en} · <span dir="rtl">{copy.ignore.ar}</span>
            </button>
            <button
              onClick={() => { setError(null); setStep("name"); }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
            >
              {copy.join.en} · <span dir="rtl">{copy.join.ar}</span>
            </button>
          </div>
        </div>
      )}

      {step === "name" && (
        <div className="p-6 space-y-4">
          <h2 className="font-bold">
            {copy.chooseName.en} · <span dir="rtl">{copy.chooseName.ar}</span>
          </h2>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Dr. Fox / مثال: الطبيب الصغير"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) void start(); }}
          />
          <p className="text-xs text-muted-foreground">
            2–20 characters · 2–20 حرفًا. Shown on the leaderboard instead of your real name · يظهر في لوحة الترتيب بدل اسمك الحقيقي.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3 justify-end">
            <button onClick={() => { setError(null); setStep("intro"); }} disabled={busy} className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">
              Back · رجوع
            </button>
            <button onClick={() => void start()} disabled={busy} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {copy.start.en} · <span dir="rtl">{copy.start.ar}</span>
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm grid gap-2 md:grid-cols-2">
            <p>{copy.confirmIgnore.en}</p>
            <p dir="rtl">{copy.confirmIgnore.ar}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3 justify-end">
            <button onClick={() => { setError(null); setStep("intro"); }} disabled={busy} className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">
              Cancel · إلغاء
            </button>
            <button onClick={() => void ignore()} disabled={busy} className="px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {copy.ignore.en} · <span dir="rtl">{copy.ignore.ar}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
