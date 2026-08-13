import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RotateCcw, Timer, Trophy, Volume2 } from "lucide-react";
import { playCorrect, playWrong } from "@/lib/german-match-audio";
import { speak } from "@/lib/german-shadowing";
import { generateEnglishDistractors } from "@/lib/german-tap.functions";

type Search = { kind?: "words" | "sentences"; subjects?: string };

export const Route = createFileRoute("/german/$courseId/tap")({
  head: () => ({ meta: [{ title: "Tap Translation · 30s" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    kind: s.kind === "sentences" ? "sentences" : "words",
    subjects: typeof s.subjects === "string" ? s.subjects : "all",
  }),
  component: TapGame,
});

type Pair = { id: string; german: string; english: string };
const DURATION = 30;

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function TapGame() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<"loading" | "play" | "over" | "empty">("loading");
  const [pool, setPool] = useState<Pair[]>([]);
  const [distractors, setDistractors] = useState<string[]>([]);
  const [current, setCurrent] = useState<Pair | null>(null);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [popKey, setPopKey] = useState(0);
  const [missed, setMissed] = useState<Pair[]>([]);
  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef<Pair[]>([]);

  // Load data
  useEffect(() => {
    let cancel = false;
    (async () => {
      let subjectIds: string[] = [];
      if (search.subjects && search.subjects !== "all") {
        subjectIds = search.subjects.split(",").filter(Boolean);
      } else {
        const { data } = await (supabase.from as any)("german_subjects")
          .select("id").eq("course_id", courseId);
        subjectIds = (data ?? []).map((r: any) => r.id);
      }
      if (!subjectIds.length) { if (!cancel) setPhase("empty"); return; }

      // For distractors, pull ALL entries in the course of the same kind so we always have a wide bank
      const { data: allSubs } = await (supabase.from as any)("german_subjects")
        .select("id").eq("course_id", courseId);
      const allSubIds = (allSubs ?? []).map((r: any) => r.id);

      const { data: items } = await (supabase.from as any)("german_items")
        .select("id,subject_id").in("subject_id", allSubIds);
      const allItemIds = (items ?? []).map((i: any) => i.id);
      const pickedItemIds = (items ?? [])
        .filter((i: any) => subjectIds.includes(i.subject_id))
        .map((i: any) => i.id);
      if (!pickedItemIds.length) { if (!cancel) setPhase("empty"); return; }

      const table = search.kind === "sentences" ? "german_sentence_entries" : "german_word_entries";
      const { data: pickedEnts } = await (supabase.from as any)(table)
        .select("id,german,english").in("item_id", pickedItemIds);
      const usable: Pair[] = ((pickedEnts ?? []) as any[])
        .filter((e) => e.german && e.english)
        .map((e) => ({ id: e.id, german: e.german, english: e.english }));
      if (cancel) return;
      if (usable.length < 2) { setPhase("empty"); return; }

      // distractor bank from rest of course
      const { data: allEnts } = await (supabase.from as any)(table)
        .select("english").in("item_id", allItemIds);
      const bank: string[] = Array.from(
        new Set(
          ((allEnts ?? []) as any[])
            .map((e) => String(e.english ?? "").trim())
            .filter(Boolean),
        ),
      );

      let distract = bank;
      if (distract.length < Math.max(20, usable.length + 5)) {
        try {
          const res = await generateEnglishDistractors({
            data: { pairs: usable.slice(0, 40).map((p) => ({ german: p.german, english: p.english })), count: 30 },
          });
          distract = Array.from(new Set([...distract, ...res.distractors]));
        } catch {
          // fall back silently to whatever bank we have
        }
      }

      if (cancel) return;
      setPool(shuffle(usable));
      setDistractors(distract);
      remainingRef.current = shuffle(usable);
      setPhase("play");
      setTimeLeft(DURATION);
      pickNext(remainingRef.current, distract, usable);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, search.kind, search.subjects]);

  function pickNext(remaining: Pair[], bank: string[], allPool: Pair[]) {
    let list = remaining;
    if (list.length === 0) {
      list = shuffle(allPool);
      remainingRef.current = list;
    }
    const next = list[0];
    remainingRef.current = list.slice(1);

    // wrong option: prefer bank entries that are not the current correct answer or other pool english
    const correctEn = next.english.trim().toLowerCase();
    const candidates = bank.filter((b) => b.trim().toLowerCase() !== correctEn);
    let wrong = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : allPool.find((p) => p.id !== next.id)?.english ?? "—";

    const opts = shuffle([
      { text: next.english, correct: true },
      { text: wrong, correct: false },
    ]);
    setCurrent(next);
    setOptions(opts);
    setPicked(null);
    setReveal(false);
  }

  // timer
  useEffect(() => {
    if (phase !== "play") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          setPhase("over");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [phase]);

  function handlePick(i: number) {
    if (phase !== "play" || picked !== null || !current) return;
    setPicked(i);
    setReveal(true);
    setAttempts((a) => a + 1);
    const isCorrect = options[i].correct;
    if (isCorrect) {
      playCorrect();
      setScore((s) => s + 1);
      setPopKey((k) => k + 1);
      window.setTimeout(() => pickNext(remainingRef.current, distractors, pool), 520);
    } else {
      playWrong();
      setMissed((cur) => (cur.some((p) => p.id === current.id) ? cur : [...cur, current]));
      // keep card in pool so it can return
      remainingRef.current = shuffle([...remainingRef.current, current]);
      window.setTimeout(() => pickNext(remainingRef.current, distractors, pool), 850);
    }
  }

  function playAgain() {
    setScore(0);
    setAttempts(0);
    setMissed([]);
    setTimeLeft(DURATION);
    remainingRef.current = shuffle(pool);
    setPhase("play");
    pickNext(remainingRef.current, distractors, pool);
  }


  const pct = (timeLeft / DURATION) * 100;
  const barColor = timeLeft <= 5 ? "bg-red-500" : timeLeft <= 10 ? "bg-amber-500" : "bg-orange-400";
  const accuracy = attempts ? Math.round((score / attempts) * 100) : 0;

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-white grid place-items-center text-slate-500">Loading…</div>
    );
  }
  if (phase === "empty") {
    return (
      <div className="min-h-screen bg-white grid place-items-center px-6 text-center">
        <div>
          <div className="text-6xl mb-3">🎯</div>
          <h2 className="text-xl font-bold mb-2">Not enough cards</h2>
          <p className="text-slate-500 text-sm mb-6">Add at least 2 entries in this subject to play.</p>
          <Link to="/german/$courseId/review" params={{ courseId }} className="inline-flex h-11 px-5 items-center rounded-full bg-blue-600 text-white font-bold">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <Link to="/german/$courseId/review" params={{ courseId }} className="w-10 h-10 grid place-items-center text-blue-500">
          <ArrowLeft className="w-7 h-7" strokeWidth={3} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center justify-center gap-2 text-slate-700 font-semibold">
            <Timer className="w-5 h-5" /> <span>{timeLeft}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full ${barColor} transition-[width] duration-1000 ease-linear`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm">
          <Trophy className="w-4 h-4" /> {score}
        </div>
      </div>

      {/* Mascots */}
      <div className="mt-4 flex items-center justify-around px-6">
        <div className="w-24 h-24 rounded-full bg-red-100 grid place-items-center text-5xl shadow-inner">🧑‍💼</div>
        <div className="w-24 h-24 rounded-full bg-red-100 grid place-items-center text-5xl shadow-inner">🥷</div>
      </div>

      {/* Word + +1 pop */}
      <div className="flex-1 grid place-items-center px-6 relative">
        <div className="text-center">
          <div className="text-4xl md:text-5xl font-extrabold text-sky-500" dir="auto">{current?.german}</div>
          <div key={popKey} className="h-8 mt-3 text-emerald-500 font-extrabold text-2xl animate-[popup_520ms_ease-out_forwards] opacity-0">+1</div>
        </div>
      </div>

      {/* Options */}
      <div className="px-4 pb-8 space-y-3">
        {options.map((o, i) => {
          const isPicked = picked === i;
          const showCorrect = reveal && o.correct;
          const showWrong = reveal && isPicked && !o.correct;
          let cls = "bg-slate-100 text-slate-800";
          if (showCorrect) cls = "bg-emerald-300 text-emerald-950";
          else if (showWrong) cls = "bg-red-300 text-red-950";
          const anim = showWrong ? { animation: "shake 0.42s" } : undefined;
          return (
            <button
              key={i}
              onClick={() => handlePick(i)}
              disabled={picked !== null}
              className={`w-full min-h-[56px] rounded-2xl px-4 py-3 text-lg font-bold transition-colors ${cls}`}
              style={anim as any}
            >
              <span dir="auto">{o.text}</span>
            </button>
          );
        })}
      </div>

      {phase === "over" && (
        <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center px-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full text-center shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="text-5xl mb-2">{score >= 10 ? "🏆" : score >= 5 ? "🎉" : "👏"}</div>
            <h2 className="text-2xl font-extrabold mb-1">Time!</h2>
            <p className="text-slate-500 mb-5">You got <b>{score}</b> right · {accuracy}% accuracy</p>

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
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes popup {
          0% { opacity: 0; transform: translateY(8px) scale(0.9); }
          25% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-16px) scale(1); }
        }
      `}</style>
    </div>
  );
}
