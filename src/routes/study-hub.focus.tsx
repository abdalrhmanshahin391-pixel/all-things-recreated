import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StudyToolShell } from "@/components/study/StudyToolShell";

export const Route = createFileRoute("/study-hub/focus")({
  head: () => ({
    meta: [
      { title: "Study with me — Study Hub | AquaQBank Academy" },
      {
        name: "description",
        content:
          "A focus timer with proven study systems: Pomodoro, 50/10, 60/15 and deep work, with automatic breaks and a session log.",
      },
      { property: "og:title", content: "Study with me — Study Hub | AquaQBank Academy" },
      {
        property: "og:description",
        content: "Focus timer with automatic breaks and suggested study systems.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FocusPage,
});

type Preset = {
  id: string;
  name: string;
  hint: string;
  focus: number;
  short: number;
  long: number;
  rounds: number;
};

const PRESETS: Preset[] = [
  { id: "pomodoro", name: "Pomodoro", hint: "25 min focus · 5 min break", focus: 25, short: 5, long: 20, rounds: 4 },
  { id: "classic", name: "Classic hour", hint: "60 min focus · 15 min break", focus: 60, short: 15, long: 30, rounds: 3 },
  { id: "fifty", name: "50 / 10", hint: "50 min focus · 10 min break", focus: 50, short: 10, long: 25, rounds: 3 },
  { id: "deep", name: "Deep work", hint: "90 min focus · 20 min break", focus: 90, short: 20, long: 30, rounds: 2 },
];

type Phase = "focus" | "short" | "long";

function FocusPage() {
  return (
    <StudyToolShell
      title="Study with me"
      subtitle="Pick a study system, start the timer and let it handle your breaks. Finished focus blocks are saved to your log."
    >
      <FocusTimer />
    </StudyToolShell>
  );
}

function FocusTimer() {
  const qc = useQueryClient();
  const [presetId, setPresetId] = useState("pomodoro");
  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!, [presetId]);

  const [phase, setPhase] = useState<Phase>("focus");
  const [round, setRound] = useState(1);
  const [left, setLeft] = useState(preset.focus * 60);
  const [running, setRunning] = useState(false);
  const advanceRef = useRef<() => void>(() => {});

  const total =
    (phase === "focus" ? preset.focus : phase === "short" ? preset.short : preset.long) * 60;

  const { data: sessions = [] } = useQuery({
    queryKey: ["study-focus-sessions"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("study_focus_sessions")
        .select("id,mode,minutes,ended_at")
        .order("ended_at", { ascending: false })
        .limit(20);
      return (data ?? []) as { id: string; mode: string; minutes: number; ended_at: string }[];
    },
  });

  const logSession = useCallback(
    async (minutes: number) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await (supabase.from as any)("study_focus_sessions").insert({
        user_id: u.user.id,
        mode: preset.id,
        minutes,
        ended_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["study-focus-sessions"] });
    },
    [preset.id, qc],
  );

  const advance = useCallback(() => {
    if (phase === "focus") {
      void logSession(preset.focus);
      const isLong = round % preset.rounds === 0;
      setPhase(isLong ? "long" : "short");
      setLeft((isLong ? preset.long : preset.short) * 60);
    } else {
      setRound((r) => (phase === "long" ? 1 : r + 1));
      setPhase("focus");
      setLeft(preset.focus * 60);
    }
  }, [phase, round, preset, logSession]);

  advanceRef.current = advance;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v > 1) return v - 1;
        advanceRef.current();
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const reset = () => {
    setRunning(false);
    setPhase("focus");
    setRound(1);
    setLeft(preset.focus * 60);
  };

  useEffect(() => {
    setRunning(false);
    setPhase("focus");
    setRound(1);
    setLeft(preset.focus * 60);
  }, [preset]);

  const pct = total ? ((total - left) / total) * 100 : 0;
  const todayMinutes = sessions
    .filter((s) => new Date(s.ended_at).toDateString() === new Date().toDateString())
    .reduce((n, s) => n + s.minutes, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={`rounded-2xl border-2 p-4 text-left transition-transform hover:-translate-y-0.5 ${
              p.id === presetId ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="text-sm font-black text-foreground">{p.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{p.hint}</div>
          </button>
        ))}
      </div>

      <div className="rounded-3xl border-2 border-border bg-card p-8 text-center">
        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          {phase === "focus" ? `Focus · round ${round}` : phase === "short" ? "Short break" : "Long break"}
        </div>
        <div className="mt-3 font-black tabular-nums text-foreground" style={{ fontSize: "clamp(3rem,12vw,5.5rem)", lineHeight: 1 }}>
          {fmt(left)}
        </div>
        <div className="mx-auto mt-6 h-2.5 max-w-md overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%`, background: "var(--primary)" }}
          />
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground"
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={() => advanceRef.current()}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-border px-4 py-3 text-sm font-black text-foreground hover:bg-muted"
          >
            <SkipForward size={16} /> Skip
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-border px-4 py-3 text-sm font-black text-foreground hover:bg-muted"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-foreground">Today</div>
          <div className="text-sm font-black" style={{ color: "var(--primary)" }}>
            {todayMinutes} min focused
          </div>
        </div>
        {sessions.length > 0 && (
          <ul className="mt-4 space-y-2">
            {sessions.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">
                  {PRESETS.find((p) => p.id === s.mode)?.name ?? s.mode}
                </span>
                <span className="text-muted-foreground">
                  {s.minutes} min · {new Date(s.ended_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
