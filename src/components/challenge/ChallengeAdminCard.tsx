import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  adminGetChallengeServerFn,
  adminRemoveChallengeParticipantServerFn,
  adminResetChallengeServerFn,
  adminSaveChallengeServerFn,
  type ChallengeAdminData,
} from "@/lib/challenge.functions";
import { formatDuration } from "@/lib/challenge";

/** Admin-only settings for a course's challenge mode, shown on the course page. */
export function ChallengeAdminCard({ courseId }: { courseId: string }) {
  const getFn = useServerFn(adminGetChallengeServerFn);
  const saveFn = useServerFn(adminSaveChallengeServerFn);
  const resetFn = useServerFn(adminResetChallengeServerFn);
  const removeFn = useServerFn(adminRemoveChallengeParticipantServerFn);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChallengeAdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [seconds, setSeconds] = useState(30);
  // Shown inside the card until the next action, so a failure can never go unnoticed.
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getFn({ data: { courseId } });
      setData(d);
      setEnabled(d.enabled);
      setSubjectIds(d.subjectIds);
      setCount(d.requestedCount);
      setSeconds(d.secondsPerQuestion);
    } catch (e: any) {
      const text = e?.message || "Could not load the challenge settings";
      setNotice({ kind: "error", text });
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }, [courseId, getFn]);

  useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  const pool = (data?.subjects ?? []).filter((s) => subjectIds.includes(s.id)).reduce((n, s) => n + s.count, 0);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const r = await saveFn({ data: { courseId, enabled, subjectIds, count, secondsPerQuestion: seconds } });
      const text = r.frozen
        ? `Saved. The questions are frozen because students already played. The challenge is now ${enabled ? "ON" : "OFF"}.`
        : `Saved. ${r.selected} question(s) selected. The challenge is now ${enabled ? "ON: students see it next to the question groups" : "OFF"}.`;
      await load();
      setNotice({ kind: "ok", text });
      toast.success(text);
    } catch (e: any) {
      const text = e?.message || "Could not save";
      setNotice({ kind: "error", text });
      toast.error(text);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("Delete ALL challenge results for this course? Students who played or ignored it will be able to decide again.")) return;
    try {
      await resetFn({ data: { courseId } });
      toast.success("Challenge results cleared");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not reset");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the challenge? They will be able to join again.`)) return;
    try {
      await removeFn({ data: { courseId, participantId: id } });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <Trophy size={18} className="text-amber-600" />
        <span className="flex-1 text-sm font-bold">Challenge mode <span className="text-muted-foreground font-medium">(admin)</span></span>
        {data && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${data.enabled ? "border-emerald-500/40 text-emerald-600" : "border-border text-muted-foreground"}`}>{data.enabled ? "On" : "Off"}</span>}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4 text-sm">
          {notice && (
            <div className={`rounded-xl border p-3 text-xs font-semibold ${notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
              {notice.text}
            </div>
          )}
          {loading && !data ? (
            <div className="grid place-items-center py-6"><Loader2 className="animate-spin text-primary" /></div>
          ) : !data ? (
            <button onClick={() => { setNotice(null); void load(); }} className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted">Try again</button>
          ) : (
            <>
              {data.locked && (
                <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  Students have already played, so the question set and timer are frozen to keep the ranking fair. You can still turn it on or off. Use "Reset results" to start over.
                </div>
              )}

              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Challenge mode is on for this course
              </label>

              <div className={data.locked ? "pointer-events-none opacity-50" : ""}>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Questions come from these subjects</div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {data.subjects.length === 0 && <p className="p-2 text-xs text-muted-foreground">This course has no subjects yet.</p>}
                  {data.subjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={subjectIds.includes(s.id)}
                        onChange={(e) => setSubjectIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                      />
                      <span className="flex-1 truncate">{s.section ? `${s.section} › ` : ""}{s.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{s.count} Q</span>
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">How many questions (0 = all {pool || ""})</span>
                    <input type="number" min={0} value={count} onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seconds per question</span>
                    <input type="number" min={5} max={600} value={seconds} onChange={(e) => setSeconds(Number(e.target.value) || 30)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saving picks the questions at random once, then everyone gets the same ones in the same order. Currently selected: <b>{data.selectedQuestions}</b>.
                  Points: 500 for a correct answer plus up to 500 more for speed (the faster, the more). Wrong or missed = 0.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving && <Loader2 size={13} className="animate-spin" />} Save
                </button>
                <button onClick={() => void reset()} className="rounded-xl border border-destructive/40 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10">
                  Reset results
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Results · {data.stats.finished} finished · {data.stats.active} playing · {data.stats.declined} ignored
                </div>
                {data.participants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nobody has played yet.</p>
                ) : (
                  <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {data.participants.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                        <span className="w-6 tabular-nums text-muted-foreground">{p.status === "finished" ? i + 1 : "…"}</span>
                        <span className="flex-1 truncate font-semibold">{p.displayName}{p.status === "active" ? " (playing)" : ""}</span>
                        <span className="tabular-nums">{p.score} pts · {p.correct}/{p.total} · {formatDuration(p.timeMs)}</span>
                        <button onClick={() => void remove(p.id, p.displayName)} className="text-muted-foreground hover:text-destructive" title="Remove (for example an inappropriate name)">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
