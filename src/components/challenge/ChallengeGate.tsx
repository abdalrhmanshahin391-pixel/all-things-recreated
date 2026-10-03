import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert, Timer, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  declineChallengeServerFn,
  getChallengeStatusServerFn,
  joinChallengeServerFn,
} from "@/lib/challenge.functions";
import { CHALLENGE_COPY, validateDisplayName, type ChallengeStatus } from "@/lib/challenge";

/**
 * Sits in front of the course question runner. When the course has a challenge and the student has not
 * decided yet, the questions stay hidden until they either join (one attempt) or choose Ignore (final).
 * It never blocks the normal questions if anything goes wrong.
 */
export function ChallengeGate({ courseId, children }: { courseId: string; children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const statusFn = useServerFn(getChallengeStatusServerFn);
  const declineFn = useServerFn(declineChallengeServerFn);
  const joinFn = useServerFn(joinChallengeServerFn);

  const [status, setStatus] = useState<ChallengeStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<"intro" | "name" | "confirm">("intro");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || isAdmin) {
      setStatus(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await statusFn({ data: { courseId } });
        if (!cancelled) setStatus(s);
      } catch (e) {
        console.warn("[challenge] status check failed, showing the normal questions:", e);
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isAdmin, courseId, statusFn]);

  useEffect(() => {
    if (status?.state === "active") {
      navigate({ to: "/courses/$courseId/challenge", params: { courseId }, replace: true });
    }
  }, [status?.state, courseId, navigate]);

  if (authLoading || checking || status?.state === "active") {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (status?.state !== "none") return <>{children}</>;

  const copy = CHALLENGE_COPY;
  const en = copy.intro.en(status.total, status.secondsPerQuestion);
  const ar = copy.intro.ar(status.total, status.secondsPerQuestion);

  async function ignore() {
    setBusy(true);
    setError(null);
    try {
      await declineFn({ data: { courseId } });
      setStatus({ ...status!, state: "declined" });
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
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
      navigate({ to: "/courses/$courseId/challenge", params: { courseId }, replace: true });
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
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
    </div>
  );
}
