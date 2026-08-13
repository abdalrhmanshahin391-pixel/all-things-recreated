import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowLeft, RotateCcw, Trophy, Flame, Volume2 } from "lucide-react";
import { playCorrect, playWrong } from "@/lib/german-match-audio";
import { speak } from "@/lib/german-shadowing";

type Search = { kind?: "words" | "sentences"; subjects?: string };

export const Route = createFileRoute("/german/$courseId/match")({
  head: () => ({ meta: [{ title: "Match · 30s" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    kind: s.kind === "sentences" ? "sentences" : "words",
    subjects: typeof s.subjects === "string" ? s.subjects : "all",
  }),
  component: MatchGame,
});

type Pair = { id: string; german: string; english: string };
type Slot = { key: string; pair: Pair; state: "idle" | "correct" | "wrong"; enter: boolean };

const VISIBLE = 5;
const DURATION = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function MatchGame() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Pair[]>([]);
  const poolIdx = useRef(0);
  const [left, setLeft] = useState<Slot[]>([]);
  const [right, setRight] = useState<Slot[]>([]);
  const [pickedLeft, setPickedLeft] = useState<string | null>(null);
  const [pickedRight, setPickedRight] = useState<string | null>(null);

  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showStreak, setShowStreak] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [phase, setPhase] = useState<"loading" | "play" | "over" | "empty">("loading");
  const [missed, setMissed] = useState<Pair[]>([]);
  const timerRef = useRef<number | null>(null);

  // load pool
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      // resolve subject ids
      let subjectIds: string[] = [];
      if (search.subjects && search.subjects !== "all") {
        subjectIds = search.subjects.split(",").filter(Boolean);
      } else {
        const { data } = await (supabase.from as any)("german_subjects")
          .select("id").eq("course_id", courseId);
        subjectIds = (data ?? []).map((r: any) => r.id);
      }
      if (!subjectIds.length) { if (!cancel) { setPhase("empty"); setLoading(false); } return; }

      const { data: items } = await (supabase.from as any)("german_items")
        .select("id").in("subject_id", subjectIds);
      const itemIds = (items ?? []).map((i: any) => i.id);
      if (!itemIds.length) { if (!cancel) { setPhase("empty"); setLoading(false); } return; }

      const table = search.kind === "sentences" ? "german_sentence_entries" : "german_word_entries";
      const { data: ents } = await (supabase.from as any)(table)
        .select("id,german,english").in("item_id", itemIds);
      const usable: Pair[] = ((ents ?? []) as any[])
        .filter((e) => e.german && e.english)
        .map((e) => ({ id: e.id, german: e.german, english: e.english }));
      if (cancel) return;
      if (usable.length < 4) { setPhase("empty"); setLoading(false); return; }
      const shuffled = shuffle(usable);
      setPool(shuffled);
      poolIdx.current = 0;
      const first = shuffled.slice(0, Math.min(VISIBLE, shuffled.length));
      poolIdx.current = first.length;
      const mkSlot = (p: Pair, i: number): Slot => ({ key: `${p.id}-${i}`, pair: p, state: "idle", enter: false });
      const ls = first.map(mkSlot);
      const rs = shuffle(first).map(mkSlot);
      setLeft(ls);
      setRight(rs);
      setPhase("play");
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [courseId, search.kind, search.subjects]);

  // timer
  useEffect(() => {
    if (phase !== "play") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timerRef.current!);
          setPhase("over");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [phase]);

  function nextPair(): Pair | null {
    if (poolIdx.current >= pool.length) return null;
    const p = pool[poolIdx.current++];
    return p;
  }

  function attempt(lid: string, rid: string) {
    if (phase !== "play") return;
    setAttempts((a) => a + 1);
    const lSlot = left.find((s) => s.pair.id === lid);
    const rSlot = right.find((s) => s.pair.id === rid);
    if (!lSlot || !rSlot) return;
    if (lSlot.pair.id === rSlot.pair.id) {
      // correct
      playCorrect();
      setLeft((cur) => cur.map((s) => (s.pair.id === lid ? { ...s, state: "correct" } : s)));
      setRight((cur) => cur.map((s) => (s.pair.id === rid ? { ...s, state: "correct" } : s)));
      setScore((x) => x + 1);
      setStreak((x) => {
        const ns = x + 1;
        if (ns >= 3 && ns % 3 === 0) {
          setShowStreak(true);
          window.setTimeout(() => setShowStreak(false), 900);
        }
        return ns;
      });
      setPickedLeft(null);
      setPickedRight(null);
      window.setTimeout(() => replaceMatched(lid), 380);
    } else {
      playWrong();
      // Track both pairs as missed (dedupe by id)
      setMissed((cur) => {
        const have = new Set(cur.map((p) => p.id));
        const add: Pair[] = [];
        if (!have.has(lSlot.pair.id)) add.push(lSlot.pair);
        if (!have.has(rSlot.pair.id) && rSlot.pair.id !== lSlot.pair.id) add.push(rSlot.pair);
        return add.length ? [...cur, ...add] : cur;
      });
      setLeft((cur) => cur.map((s) => (s.pair.id === lid ? { ...s, state: "wrong" } : s)));
      setRight((cur) => cur.map((s) => (s.pair.id === rid ? { ...s, state: "wrong" } : s)));
      setStreak(0);
      window.setTimeout(() => {
        setLeft((cur) => cur.map((s) => (s.pair.id === lid ? { ...s, state: "idle" } : s)));
        setRight((cur) => cur.map((s) => (s.pair.id === rid ? { ...s, state: "idle" } : s)));
        setPickedLeft(null);
        setPickedRight(null);
      }, 420);
    }
  }

  function replaceMatched(matchedId: string) {
    const nextL = nextPair();
    const nextR = nextL ? nextL : null; // same pair pulled, but right column inserts independently
    // We pull one new pair for both columns from a single advance.
    setLeft((cur) => {
      const idx = cur.findIndex((s) => s.pair.id === matchedId);
      if (idx < 0) return cur.filter((s) => s.pair.id !== matchedId);
      const copy = cur.slice();
      if (nextL) copy[idx] = { key: `${nextL.id}-L-${Date.now()}`, pair: nextL, state: "idle", enter: true };
      else copy.splice(idx, 1);
      return copy;
    });
    setRight((cur) => {
      const idx = cur.findIndex((s) => s.pair.id === matchedId);
      if (idx < 0) return cur.filter((s) => s.pair.id !== matchedId);
      const copy = cur.slice();
      if (nextR) copy[idx] = { key: `${nextR.id}-R-${Date.now()}`, pair: nextR, state: "idle", enter: true };
      else copy.splice(idx, 1);
      // independently re-shuffle right column slightly so new card location feels unpredictable
      return shuffle(copy);
    });
    // clear "enter" flag after animation
    window.setTimeout(() => {
      setLeft((cur) => cur.map((s) => ({ ...s, enter: false })));
      setRight((cur) => cur.map((s) => ({ ...s, enter: false })));
    }, 260);

    // if board empty, end game
    window.setTimeout(() => {
      setLeft((cur) => {
        setRight((rc) => {
          if (cur.length === 0 && rc.length === 0) setPhase("over");
          return rc;
        });
        return cur;
      });
    }, 0);
  }

  function clickLeft(id: string) {
    if (phase !== "play") return;
    if (left.find((s) => s.pair.id === id)?.state !== "idle") return;
    setPickedLeft(id);
    if (pickedRight) attempt(id, pickedRight);
  }
  function clickRight(id: string) {
    if (phase !== "play") return;
    if (right.find((s) => s.pair.id === id)?.state !== "idle") return;
    setPickedRight(id);
    if (pickedLeft) attempt(pickedLeft, id);
  }

  function playAgain() {
    setScore(0);
    setAttempts(0);
    setStreak(0);
    setMissed([]);
    setPickedLeft(null);
    setPickedRight(null);
    setTimeLeft(DURATION);
    const shuffled = shuffle(pool);
    setPool(shuffled);
    poolIdx.current = 0;
    const first = shuffled.slice(0, Math.min(VISIBLE, shuffled.length));
    poolIdx.current = first.length;
    const mkSlot = (p: Pair, i: number): Slot => ({ key: `${p.id}-${i}-r`, pair: p, state: "idle", enter: false });
    setLeft(first.map(mkSlot));
    setRight(shuffle(first).map(mkSlot));
    setPhase("play");
  }

  const accuracy = attempts ? Math.round((score / attempts) * 100) : 0;
  const pct = (timeLeft / DURATION) * 100;
  const timeColor = timeLeft <= 5 ? "bg-red-500" : timeLeft <= 10 ? "bg-amber-400" : "bg-yellow-400";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FB]"><SiteHeader variant="light" />
        <div className="pt-32 text-center text-slate-500">Loading…</div>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="min-h-screen bg-[#F5F7FB]"><SiteHeader variant="light" />
        <main className="mx-auto max-w-md px-6 pt-28 text-center">
          <div className="text-6xl mb-3">🎯</div>
          <h2 className="text-xl font-bold mb-2">Not enough cards</h2>
          <p className="text-slate-500 text-sm mb-6">Need at least 4 entries to play. Pick another subject or add more.</p>
          <Link to="/german/$courseId/review" params={{ courseId }} className="inline-flex h-11 px-5 items-center rounded-full bg-blue-600 text-white font-bold">Back</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-10">
        {/* game header */}
        <div className="flex items-center gap-3 mb-3">
          <Link to="/german/$courseId/review" params={{ courseId }} className="w-9 h-9 grid place-items-center rounded-full bg-white shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${timeColor} transition-[width] duration-1000 ease-linear`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-400 text-amber-950 font-extrabold text-sm">
            <Trophy className="w-4 h-4" /> {score}
          </div>
        </div>

        {/* streak flash */}
        <div className="h-6 relative">
          {showStreak && (
            <div className="absolute right-0 -top-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold animate-[fadeup_900ms_ease-out_forwards]">
              <Flame className="w-3 h-3" /> x{streak}
            </div>
          )}
        </div>

        {/* board */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="space-y-3">
            {left.map((s) => (
              <Card
                key={s.key}
                text={s.pair.german}
                state={s.state}
                enter={s.enter}
                active={pickedLeft === s.pair.id}
                onClick={() => clickLeft(s.pair.id)}
              />
            ))}
          </div>
          <div className="space-y-3">
            {right.map((s) => (
              <Card
                key={s.key}
                text={s.pair.english}
                state={s.state}
                enter={s.enter}
                active={pickedRight === s.pair.id}
                onClick={() => clickRight(s.pair.id)}
              />
            ))}
          </div>
        </div>
      </main>

      {/* result */}
      {phase === "over" && (
        <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center px-4">
          {score >= 10 && <Confetti />}
          <div className="bg-white rounded-3xl p-6 max-w-md w-full text-center shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="text-5xl mb-2">{score >= 10 ? "🏆" : score >= 5 ? "🎉" : "👏"}</div>
            <h2 className="text-2xl font-extrabold mb-1">{score >= 10 ? "Amazing!" : "Time!"}</h2>
            <p className="text-slate-500 mb-5">You matched <b>{score}</b> pairs · {accuracy}% accuracy</p>

            <div className="text-left mb-5">
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">Review mistakes</div>
              {missed.length === 0 ? (
                <div className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-2 text-center">No mistakes — perfect run!</div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {missed.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate" dir="auto">{p.german}</div>
                        <div className="text-xs text-slate-500 truncate">{p.english}</div>
                      </div>
                      <button onClick={() => speak(p.german)} className="w-8 h-8 grid place-items-center rounded-full text-blue-600 hover:bg-blue-100" aria-label="Play">
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={playAgain} className="flex-1 h-11 rounded-full bg-blue-600 text-white font-bold inline-flex items-center justify-center gap-2 hover:bg-blue-700">
                <RotateCcw className="w-4 h-4" /> Play again
              </button>
              <button
                onClick={() => navigate({ to: "/german/$courseId/review", params: { courseId } })}
                className="flex-1 h-11 rounded-full bg-slate-100 text-slate-800 font-bold hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>

        </div>
      )}

      <style>{`
        @keyframes fadeup {
          0% { opacity: 0; transform: translateY(8px); }
          25% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes confetti {
          0% { transform: translateY(-20px) rotate(0); opacity: 1; }
          100% { transform: translateY(80vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function Card({ text, state, enter, active, onClick }: { text: string; state: "idle" | "correct" | "wrong"; enter: boolean; active: boolean; onClick: () => void }) {
  const base = "w-full min-h-[70px] rounded-2xl px-4 py-3 text-base md:text-lg font-bold shadow-sm border transition-colors duration-150 grid place-items-center text-center";
  let cls = "bg-white border-slate-100 text-slate-900 hover:border-blue-300";
  if (active) cls = "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200";
  if (state === "correct") cls = "bg-emerald-500 border-emerald-500 text-white";
  if (state === "wrong") cls = "bg-red-100 border-red-400 text-red-700";
  const anim = state === "wrong"
    ? { animation: "shake 0.42s" }
    : enter
      ? { animation: "slideUp 0.26s ease-out" }
      : undefined;
  return (
    <button onClick={onClick} disabled={state !== "idle"} className={`${base} ${cls}`} style={anim as any}>
      <span dir="auto">{text}</span>
    </button>
  );
}

function Confetti() {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const bits = Array.from({ length: 24 });
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {bits.map((_, i) => (
        <span
          key={i}
          className="absolute top-0 w-2 h-3 rounded-sm"
          style={{
            left: `${(i * 4.16) % 100}%`,
            background: colors[i % colors.length],
            animation: `confetti ${1.2 + Math.random() * 1.2}s ${Math.random() * 0.5}s ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}
