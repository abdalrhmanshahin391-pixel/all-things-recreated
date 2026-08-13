import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Clock,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Gamepad2,
  Languages,
  BookOpen,
  Timer,
  Mic,
  Volume2,
  Sparkles,
  Brain,
} from "lucide-react";

type Mode = "study" | "session" | "exam" | "game" | "voice";
type Range = "3d" | "1m" | "1y" | "all";
type Kind = "words" | "sentences";

export const Route = createFileRoute("/german/$courseId/run")({
  validateSearch: (s: Record<string, unknown>) => ({
    item: typeof s.item === "string" ? s.item : "",
    subject: typeof s.subject === "string" ? s.subject : "",
    mode: ((["study", "session", "exam", "game", "voice"].includes(String(s.mode))
      ? s.mode
      : "study") as Mode),
    range: ((["3d", "1m", "1y", "all"].includes(String(s.range)) ? s.range : "all") as Range),
    timed: Number(s.timed) === 1 ? 1 : 0,
    duration: Math.max(0, Math.min(120, Number(s.duration) || 0)),
    smart: Number(s.smart) === 1 ? 1 : 0,
  }),
  head: () => ({ meta: [{ title: "German practice" }] }),
  component: RunPage,
});

type Entry = {
  id: string;
  item_id: string;
  kind: Kind;
  prompt: string; // German
  correct: string; // English
  notes: string | null;
  created_at: string;
};

type Question = Entry & { choices: string[] };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(entries: Entry[]): Question[] {
  return entries.map((e) => {
    const pool = entries.filter((x) => x.id !== e.id && x.correct.trim() && x.correct !== e.correct);
    const distractors = shuffle(pool).slice(0, 3).map((x) => x.correct);
    while (distractors.length < 3) distractors.push("—");
    return { ...e, choices: shuffle([e.correct, ...distractors]) };
  });
}

function rangeStart(r: Range): Date | null {
  const now = new Date();
  if (r === "3d") return new Date(now.getTime() - 3 * 86400_000);
  if (r === "1m") return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (r === "1y") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return null;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}

// Small Web Audio chime for correct answers
function playChime(ok = true) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    if (ok) {
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
    }
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

function speak(text: string) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {}
}

function RunPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const { item, subject, mode, range, timed, duration, smart } = search;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subjectInfo, setSubjectInfo] = useState<{ title: string; content_type: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load entries either from a single item OR from all items in a subject, filtered by range
  useEffect(() => {
    (async () => {
      setLoading(true);
      setEntries([]);
      const start = rangeStart(range);

      let itemIds: string[] = [];
      if (item) {
        itemIds = [item];
        const { data: it } = await (supabase.from as any)("german_items")
          .select("title,kind,subject_id")
          .eq("id", item)
          .maybeSingle();
        if (it) setSubjectInfo({ title: it.title, content_type: it.kind });
      } else if (subject) {
        const { data: subj } = await (supabase.from as any)("german_subjects")
          .select("title,content_type").eq("id", subject).maybeSingle();
        if (subj) setSubjectInfo(subj as any);
        const { data: its } = await (supabase.from as any)("german_items")
          .select("id").eq("subject_id", subject);
        itemIds = (its ?? []).map((x: any) => x.id);
      }

      if (itemIds.length === 0) {
        setLoading(false);
        return;
      }

      const all: Entry[] = [];
      // Words
      let wq = (supabase.from as any)("german_word_entries")
        .select("id,item_id,german,english,example,created_at")
        .in("item_id", itemIds);
      if (start) wq = wq.gte("created_at", start.toISOString());
      const { data: words } = await wq;
      (words ?? []).forEach((r: any) => {
        if (!r.german || !r.english) return;
        all.push({
          id: r.id,
          item_id: r.item_id,
          kind: "words",
          prompt: r.german,
          correct: r.english,
          notes: r.example ?? null,
          created_at: r.created_at,
        });
      });
      // Sentences
      let sq = (supabase.from as any)("german_sentence_entries")
        .select("id,item_id,german,english,notes,created_at")
        .in("item_id", itemIds);
      if (start) sq = sq.gte("created_at", start.toISOString());
      const { data: sents } = await sq;
      (sents ?? []).forEach((r: any) => {
        if (!r.german || !r.english) return;
        all.push({
          id: r.id,
          item_id: r.item_id,
          kind: "sentences",
          prompt: r.german,
          correct: r.english,
          notes: r.notes ?? null,
          created_at: r.created_at,
        });
      });

      // Study Smart: reorder by user mistake rate (most-missed first, untried interleaved)
      let ordered = all;
      if (smart && user?.id && all.length > 0) {
        const entryIds = all.map((e) => e.id);
        const { data: atts } = await (supabase.from as any)("german_attempts")
          .select("entry_id,is_correct")
          .eq("user_id", user.id)
          .in("entry_id", entryIds);
        const stats = new Map<string, { wrong: number; total: number }>();
        (atts ?? []).forEach((a: any) => {
          const s = stats.get(a.entry_id) ?? { wrong: 0, total: 0 };
          s.total += 1;
          if (!a.is_correct) s.wrong += 1;
          stats.set(a.entry_id, s);
        });
        ordered = all
          .map((e) => {
            const s = stats.get(e.id);
            // Score: higher = needs more practice. Untried gets neutral 0.5.
            const score = s ? (s.wrong + 1) / (s.total + 1) : 0.5;
            return { e, score, total: s?.total ?? 0 };
          })
          .sort((a, b) => b.score - a.score || a.total - b.total)
          .map((x) => x.e);
      }
      setEntries(ordered);
      setLoading(false);
    })();
  }, [item, subject, range, smart, user?.id]);

  const wordEntries = useMemo(() => entries.filter((e) => e.kind === "words"), [entries]);
  const sentenceEntries = useMemo(() => entries.filter((e) => e.kind === "sentences"), [entries]);
  // For quiz modes, use whichever pool the subject has more of (or both)
  const quizPool = useMemo(() => {
    if (subjectInfo?.content_type === "words") return wordEntries;
    if (subjectInfo?.content_type === "sentences") return sentenceEntries;
    return entries;
  }, [entries, wordEntries, sentenceEntries, subjectInfo]);

  function switchMode(m: Mode, extra: Record<string, any> = {}) {
    navigate({
      to: "/german/$courseId/run",
      params: { courseId },
      search: { ...search, mode: m, ...extra },
    });
  }
  function switchRange(r: Range) {
    navigate({
      to: "/german/$courseId/run",
      params: { courseId },
      search: { ...search, range: r },
    });
  }

  if (loading) {
    return (
      <>
        <SiteHeader />
        <div className="min-h-screen pt-28 grid place-items-center bg-slate-950 text-white">
          <div className="text-sm text-white/60">Loading…</div>
        </div>
      </>
    );
  }

  const hasContent = entries.length > 0;
  const showGame = subjectInfo?.content_type !== "sentences" && wordEntries.length >= 4;

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen pt-24 pb-16 bg-slate-950 text-white">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <button
              onClick={() => navigate({ to: "/admin/german/$courseId", params: { courseId } })}
              className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-emerald-300"
            >
              <ArrowLeft size={14} /> Back to course
            </button>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300 inline-flex items-center gap-2">
              <Languages size={14} /> {subjectInfo?.title ?? "Practice"}
            </div>
          </div>

          {/* Mode chips */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 mb-3 flex flex-wrap items-center gap-2">
            {([
              { m: "study", label: "Study", icon: BookOpen },
              { m: "session", label: "Session", icon: Trophy },
              { m: "exam", label: "Exam", icon: Timer },
              ...(showGame ? [{ m: "game" as Mode, label: "Game", icon: Gamepad2 }] : []),
              { m: "voice", label: "Voice", icon: Mic },
            ] as { m: Mode; label: string; icon: any }[]).map(({ m, label, icon: Icon }) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => switchMode(m, m === "exam" ? { timed: 1, duration: 10 } : {})}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold border transition ${
                    active
                      ? "bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/30"
                      : "bg-white/5 text-white/70 border-white/10 hover:border-emerald-400/40 hover:text-emerald-200"
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>

          {/* Range chips */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Time range</span>
            {(["3d", "1m", "1y", "all"] as Range[]).map((r) => {
              const label = r === "3d" ? "Last 3 days" : r === "1m" ? "Last month" : r === "1y" ? "Last year" : "All time";
              const active = range === r;
              return (
                <button
                  key={r}
                  onClick={() => switchRange(r)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition ${
                    active
                      ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/50"
                      : "bg-white/5 text-white/60 border-white/10 hover:border-emerald-400/30"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <span className="ml-auto text-[11px] text-white/50">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"} in range
            </span>
            <button
              onClick={() => navigate({
                to: "/german/$courseId/run",
                params: { courseId },
                search: { ...search, smart: smart ? 0 : 1 },
              })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border transition ${
                smart
                  ? "bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/30"
                  : "bg-white/5 text-white/70 border-white/10 hover:border-emerald-400/40"
              }`}
              title="Show items you fail most, more often"
            >
              <Brain size={13} /> Study Smart {smart ? "· ON" : ""}
            </button>
          </div>

          {!hasContent ? (
            <EmptyState />
          ) : mode === "game" ? (
            <GameMode entries={wordEntries.length ? wordEntries : entries} userId={user?.id ?? null} />
          ) : mode === "voice" ? (
            <VoiceMode entries={entries} subjectId={subject || null} userId={user?.id ?? null} />
          ) : (
            <QuizMode
              key={`${mode}-${range}-${smart}-${entries.length}`}
              mode={mode}
              entries={quizPool}
              timed={!!timed}
              duration={duration || 10}
              userId={user?.id ?? null}
            />
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
      <Sparkles className="mx-auto text-emerald-400 mb-3" size={28} />
      <p className="text-white/70 text-sm">
        No words or sentences in this range yet. Try widening the time range, or add more items in the admin editor.
      </p>
    </div>
  );
}

/* ============================ Quiz (study/session/exam) ============================ */

function QuizMode({
  mode,
  entries,
  timed,
  duration,
  userId,
}: {
  mode: Mode;
  entries: Entry[];
  timed: boolean;
  duration: number;
  userId: string | null;
}) {
  const questions = useMemo(() => buildQuestions(shuffle(entries)), [entries]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(mode === "exam" && timed ? duration * 60 : 0);

  useEffect(() => {
    if (mode !== "exam" || !timed) return;
    if (finished) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setFinished(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mode, timed, finished]);

  if (questions.length === 0) return <EmptyState />;

  if (finished) {
    const correct = questions.filter((q) => answers[q.id] === q.correct).length;
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-slate-900 p-8 text-center">
        <Trophy size={40} className="mx-auto text-emerald-300 mb-3" />
        <div className="text-3xl font-black text-emerald-300">
          {correct} / {questions.length}
        </div>
        <p className="text-white/60 text-sm mt-2">
          {mode === "exam" ? "Exam finished" : mode === "session" ? "Session finished" : "Done"}
        </p>
        <button
          onClick={() => {
            setAnswers({});
            setSubmitted({});
            setCurrent(0);
            setFinished(false);
            setSecondsLeft(mode === "exam" && timed ? duration * 60 : 0);
          }}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5"
        >
          <RotateCcw size={14} /> Retry
        </button>
      </div>
    );
  }

  const q = questions[current];
  const picked = answers[q.id];
  const isSubmitted = !!submitted[q.id];
  const reveal = mode === "study" ? !!picked : isSubmitted;

  function choose(c: string) {
    if (mode === "exam") {
      setAnswers((a) => ({ ...a, [q.id]: c }));
      return;
    }
    if (mode === "study" || mode === "session") {
      if (picked) return;
      setAnswers((a) => ({ ...a, [q.id]: c }));
      setSubmitted((s) => ({ ...s, [q.id]: true }));
      if (c === q.correct) playChime(true);
      if (userId) {
        try {
          (supabase.from as any)("german_attempts").insert({
            user_id: userId,
            item_id: q.item_id,
            entry_id: q.id,
            is_correct: c === q.correct,
            mode,
          });
        } catch {}
      }
    }
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 text-xs text-white/60">
        <span>
          Q{current + 1} / {questions.length}
        </span>
        {mode === "exam" && timed && (
          <span className="inline-flex items-center gap-1.5 font-mono text-emerald-300">
            <Clock size={12} /> {fmtTime(secondsLeft)}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">
          {q.kind === "words" ? "Translate the word" : "Translate the sentence"}
        </div>
        <div className="text-2xl md:text-3xl font-black mb-5">{q.prompt}</div>

        <div className="grid sm:grid-cols-2 gap-2">
          {q.choices.map((c, i) => {
            const isPicked = picked === c;
            const isCorrect = c === q.correct;
            const showCorrect = reveal && isCorrect;
            const showWrong = reveal && isPicked && !isCorrect;
            return (
              <button
                key={i}
                onClick={() => choose(c)}
                className={`text-left rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  showCorrect
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-100"
                    : showWrong
                    ? "bg-rose-500/15 border-rose-400/60 text-rose-100"
                    : isPicked
                    ? "bg-emerald-500/10 border-emerald-400/40 text-white"
                    : "bg-white/5 border-white/10 hover:border-emerald-400/40 text-white/85"
                }`}
              >
                <span className="inline-block w-6 text-emerald-300/70">{String.fromCharCode(65 + i)}.</span>
                {c}
                {showCorrect && <CheckCircle2 size={14} className="inline ml-2 text-emerald-300" />}
                {showWrong && <XCircle size={14} className="inline ml-2 text-rose-300" />}
              </button>
            );
          })}
        </div>

        {reveal && q.notes && (
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100/80">
            <span className="font-bold text-emerald-300">Note:</span> {q.notes}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-4">
        <button
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          className="rounded-full px-4 py-2 text-xs font-bold bg-white/5 text-white/70 border border-white/10 hover:border-emerald-400/40 disabled:opacity-30"
        >
          Previous
        </button>
        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent((c) => c + 1)}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black"
          >
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={() => setFinished(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black"
          >
            Finish <Trophy size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================ Game (drag/tap) ============================ */

function GameMode({ entries, userId }: { entries: Entry[]; userId: string | null }) {
  const [pool, setPool] = useState<Entry[]>(() => shuffle(entries));
  const [tiles, setTiles] = useState<{ center: Entry; choices: Entry[] } | null>(null);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setPool(shuffle(entries));
  }, [entries]);

  useEffect(() => {
    if (pool.length === 0) {
      setTiles(null);
      return;
    }
    const center = pool[0];
    const distractors = shuffle(entries.filter((e) => e.id !== center.id)).slice(0, 3);
    while (distractors.length < 3) distractors.push(center);
    const choices = shuffle([center, ...distractors]);
    setTiles({ center, choices });
    setPicked(null);
  }, [pool, entries]);

  const dragRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function pickTile(i: number) {
    if (!tiles) return;
    const correct = tiles.choices[i].id === tiles.center.id;
    setPicked(i);
    if (userId) {
      try {
        (supabase.from as any)("german_attempts").insert({
          user_id: userId,
          item_id: tiles.center.item_id,
          entry_id: tiles.center.id,
          is_correct: correct,
          mode: "game",
        });
      } catch {}
    }
    if (correct) {
      setFlash("ok");
      playChime(true);
      setScore((s) => s + 1);
      setTimeout(() => {
        setFlash(null);
        setPool((p) => p.slice(1));
      }, 550);
    } else {
      setFlash("bad");
      playChime(false);
      setTimeout(() => {
        setFlash(null);
        setPicked(null);
      }, 600);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    startRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  }
  function onPointerUp() {
    if (!startRef.current || !drag || !tiles) {
      startRef.current = null;
      setDrag(null);
      return;
    }
    const { x, y } = drag;
    const THRESH = 50;
    let idx = -1;
    if (Math.abs(x) < THRESH && Math.abs(y) < THRESH) {
      // small move — ignore
    } else if (Math.abs(y) > Math.abs(x)) {
      idx = y < 0 ? 0 : 2; // up / down
    } else {
      idx = x < 0 ? 1 : 3; // left / right
    }
    startRef.current = null;
    setDrag(null);
    if (idx >= 0) pickTile(idx);
  }

  if (!tiles) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-slate-900 p-8 text-center">
        <Trophy size={40} className="mx-auto text-emerald-300 mb-3" />
        <div className="text-3xl font-black text-emerald-300">{score} correct</div>
        <p className="text-white/60 text-sm mt-2">Game complete</p>
        <button
          onClick={() => {
            setScore(0);
            setPool(shuffle(entries));
          }}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5"
        >
          <RotateCcw size={14} /> Play again
        </button>
      </div>
    );
  }

  // Position: 0=up, 1=left, 2=down, 3=right
  const positions = [
    "col-start-2 row-start-1",
    "col-start-1 row-start-2",
    "col-start-2 row-start-3",
    "col-start-3 row-start-2",
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-xs text-white/60">
        <span>Score: <span className="text-emerald-300 font-bold">{score}</span></span>
        <span>{pool.length} left</span>
      </div>
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 md:p-8">
        <p className="text-center text-[11px] uppercase tracking-widest text-emerald-300/80 mb-4">
          Drag the German word toward the correct meaning · or tap a tile
        </p>
        <div className="grid grid-cols-3 grid-rows-3 gap-3 md:gap-5 max-w-xl mx-auto select-none touch-none">
          {tiles.choices.map((c, i) => {
            const isCenterDup = false;
            const wasPicked = picked === i;
            const correct = c.id === tiles.center.id;
            return (
              <button
                key={`${c.id}-${i}`}
                onClick={() => pickTile(i)}
                className={`${positions[i]} rounded-2xl border px-3 py-5 text-sm md:text-base font-bold min-h-[80px] flex items-center justify-center text-center transition ${
                  wasPicked && correct
                    ? "bg-emerald-500/30 border-emerald-400 text-emerald-50"
                    : wasPicked && !correct
                    ? "bg-rose-500/25 border-rose-400 text-rose-50 animate-pulse"
                    : "bg-white/5 border-white/10 hover:border-emerald-400/40 text-white"
                }`}
                disabled={isCenterDup}
              >
                {c.correct}
              </button>
            );
          })}
          {/* Center */}
          <div
            ref={dragRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
            className={`col-start-2 row-start-2 cursor-grab active:cursor-grabbing rounded-2xl border-2 px-3 py-6 min-h-[100px] flex items-center justify-center text-center text-lg md:text-2xl font-black shadow-2xl transition-colors ${
              flash === "ok"
                ? "bg-emerald-400 text-black border-emerald-300 shadow-emerald-400/50"
                : flash === "bad"
                ? "bg-rose-500/30 border-rose-400 text-rose-50"
                : "bg-gradient-to-br from-emerald-500/30 to-emerald-700/20 border-emerald-400/60 text-white shadow-emerald-500/30"
            }`}
          >
            {tiles.center.prompt}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ Voice (pronunciation) ============================ */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i] as number[]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

type WordMatch = { word: string; status: "ok" | "close" | "miss" };

function diffWords(target: string, transcript: string): { matches: WordMatch[]; score: number } {
  const tWords = normalize(target).split(" ").filter(Boolean);
  const hSet = new Set(normalize(transcript).split(" ").filter(Boolean));
  const matches: WordMatch[] = tWords.map((w) => {
    if (hSet.has(w)) return { word: w, status: "ok" };
    let close = false;
    for (const h of hSet) {
      if (lev(w, h) <= Math.max(1, Math.floor(w.length / 5))) {
        close = true;
        break;
      }
    }
    return { word: w, status: close ? "close" : "miss" };
  });
  const okCount = matches.filter((m) => m.status === "ok").length + 0.5 * matches.filter((m) => m.status === "close").length;
  const score = tWords.length ? Math.round((okCount / tWords.length) * 100) : 0;
  return { matches, score };
}

function VoiceMode({
  entries,
  subjectId,
  userId,
}: {
  entries: Entry[];
  subjectId: string | null;
  userId: string | null;
}) {
  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<{ matches: WordMatch[]; score: number; original: string } | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const entry = entries[idx];

  function start() {
    if (!entry) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "de-DE";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    setTranscript("");
    setResult(null);
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript ?? "";
      setTranscript(text);
      const d = diffWords(entry.prompt, text);
      const full = { ...d, original: text };
      setResult(full);
      if (d.score >= 80) playChime(true);
      // Save attempt
      if (userId) {
        try {
          (supabase.from as any)("german_voice_attempts").insert({
            user_id: userId,
            subject_id: subjectId,
            entry_id: entry.id,
            target_text: entry.prompt,
            transcript: text,
            score: d.score,
            mode: "voice",
          });
        } catch {}
      }
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }
  function stop() {
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
  }
  function next() {
    setIdx((i) => (i + 1) % entries.length);
    setTranscript("");
    setResult(null);
  }

  if (entries.length === 0) return <EmptyState />;
  if (supported === false) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <Mic size={32} className="mx-auto text-amber-300 mb-3" />
        <p className="text-white/80 font-bold mb-1">Voice mode needs Chrome or Edge</p>
        <p className="text-white/60 text-sm">
          Safari and iOS don't yet support live German speech recognition in the browser. Open this page in Chrome or Edge on desktop / Android.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-slate-900 p-6 md:p-10">
      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2 text-center">
        Pronunciation · say it in German
      </div>
      <div className="text-2xl md:text-4xl font-black text-center mb-2 text-white">{entry.prompt}</div>
      {entry.notes && <div className="text-center text-xs text-white/50 mb-4 italic">{entry.notes}</div>}

      <div className="flex items-center justify-center gap-3 mb-6 mt-4">
        <button
          onClick={() => speak(entry.prompt)}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:border-emerald-400/50 text-white"
        >
          <Volume2 size={14} /> Listen
        </button>
        <button
          onClick={listening ? stop : start}
          className={`relative inline-flex items-center justify-center h-20 w-20 rounded-full font-bold text-black transition shadow-2xl ${
            listening
              ? "bg-rose-400 shadow-rose-500/40"
              : "bg-emerald-400 hover:bg-emerald-300 shadow-emerald-500/40"
          }`}
        >
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-400/60 animate-ping" />
              <span className="absolute inset-[-8px] rounded-full border-2 border-rose-300/50 animate-pulse" />
            </>
          )}
          <Mic size={32} className="relative z-10" />
        </button>
        <button
          onClick={next}
          disabled={entries.length < 2}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:border-emerald-400/50 text-white disabled:opacity-30"
        >
          Next <ArrowRight size={14} />
        </button>
      </div>

      <p className="text-center text-[11px] text-white/50 mb-4">
        {listening ? "Listening… speak now" : "Tap the mic, then say the phrase aloud"}
      </p>

      {result && (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-white/60">You said: <span className="text-white">{result.original}</span></div>
            <div
              className={`text-lg font-black ${
                result.score >= 80 ? "text-emerald-300" : result.score >= 50 ? "text-amber-300" : "text-rose-300"
              }`}
            >
              {result.score}%
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.matches.map((m, i) => (
              <span
                key={i}
                className={`px-2 py-1 rounded-md text-sm font-bold ${
                  m.status === "ok"
                    ? "bg-emerald-500/25 text-emerald-100 border border-emerald-400/40"
                    : m.status === "close"
                    ? "bg-amber-500/20 text-amber-100 border border-amber-400/40"
                    : "bg-rose-500/20 text-rose-100 border border-rose-400/40"
                }`}
              >
                {m.word}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => speak(entry.prompt)}
              className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1"
            >
              <Volume2 size={12} /> Hear it again
            </button>
            <button
              onClick={start}
              className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1"
            >
              <RotateCcw size={12} /> Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
