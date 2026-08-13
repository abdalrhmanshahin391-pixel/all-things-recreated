import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Mic, Volume2, Rabbit, Ear } from "lucide-react";
import {
  scoreUtterance,
  speak,
  stopSpeaking,
  recognizeOnce,
  hasSpeechRecognition,
  type RecognitionHandle,
  type ShadowScore,
} from "@/lib/german-shadowing";
import { playAlmost, playCorrect, playWrong } from "@/lib/german-match-audio";

export type ShadowItem = {
  id: string;
  prompt: string;
  translation?: string | null;
};

const MAX_ITEMS = 10;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ShadowingPlayer({
  items: rawItems,
  lang = "en-US",
  maxItems = MAX_ITEMS,
  onFinish,
}: {
  items: ShadowItem[];
  lang?: string;
  maxItems?: number;
  onFinish: (results: Array<{ id: string; score: ShadowScore }>) => void;
}) {
  // Lock to up to 10 random items
  const items = useMemo(() => shuffle(rawItems).slice(0, maxItems), [rawItems, maxItems]);
  const total = items.length;

  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, ShadowScore>>({});
  const [busy, setBusy] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [curScore, setCurScore] = useState<ShadowScore | null>(null);
  const recRef = useRef<RecognitionHandle | null>(null);
  const supported = hasSpeechRecognition();
  const cur = items[idx];
  const completed = Object.keys(scores).length;

  useEffect(() => () => { recRef.current?.stop(); stopSpeaking(); }, []);

  // Auto-play prompt when card changes
  useEffect(() => {
    if (!cur) return;
    setLastHeard("");
    setCurScore(scores[cur.id] ?? null);
    const t = setTimeout(() => speak(cur.prompt, { rate: 0.94, lang }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function finishNow() {
    stopSpeaking();
    recRef.current?.stop();
    const final = items.map((it) => ({
      id: it.id,
      score: scores[it.id] ?? { score: 0, band: "try" as const, transcript: "" },
    }));
    onFinish(final);
  }

  function goNext() {
    stopSpeaking();
    recRef.current?.stop();
    setBusy(false);
    if (idx + 1 >= total) { finishNow(); return; }
    setIdx(idx + 1);
  }
  function goPrev() {
    stopSpeaking();
    recRef.current?.stop();
    setBusy(false);
    if (idx <= 0) return;
    setIdx(idx - 1);
  }

  function startListen() {
    if (!cur) return;
    stopSpeaking();
    if (busy) { recRef.current?.stop(); setBusy(false); return; }
    setBusy(true);
    setLastHeard("");
    recRef.current = recognizeOnce({
      lang,
      onResult: (t) => {
        setLastHeard(t);
        const sc = scoreUtterance(cur.prompt, t);
        setCurScore(sc);
        setScores((p) => {
          const old = p[cur.id];
          if (!old || sc.score > old.score) return { ...p, [cur.id]: sc };
          return p;
        });
        if (sc.band === "great") playCorrect();
        else if (sc.band === "good") playAlmost();
        else playWrong();
      },
      onError: (e) => setLastHeard(`(${e})`),
      onEnd: () => setBusy(false),
    });
  }

  if (!cur) return null;

  const progress = (completed / Math.max(1, total)) * 100;
  const bandColor =
    curScore?.band === "great"
      ? "text-emerald-300"
      : curScore?.band === "good"
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-600 px-3 md:px-6 pt-5 pb-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-5 max-w-3xl mx-auto">
        <button onClick={() => onFinish([])} className="w-9 h-9 grid place-items-center rounded-full text-white hover:bg-white/15" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-white text-sm font-bold tabular-nums px-2">
          {completed}/{total}
        </div>
        <button onClick={finishNow} className="px-3 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
          Finish
        </button>
      </div>

      {/* Card */}
      <div className="max-w-3xl mx-auto rounded-3xl bg-slate-900 shadow-2xl overflow-hidden">
        <div className="bg-slate-200/90 px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white grid place-items-center text-base">🧑‍🏫</div>
          <span className="font-extrabold text-blue-600">Repeat after me</span>
        </div>

        <div className="px-6 md:px-8 pt-7 pb-5">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight border-b border-dashed border-white/20 pb-2 inline-block" dir="auto">
            {cur.prompt}
          </h1>
          {cur.translation && <p className="mt-3 text-white/60 text-base">{cur.translation}</p>}

          <div className="mt-6 flex items-center gap-3">
            <IconBtn label="Save"><Bookmark className="w-4 h-4" /></IconBtn>
            <IconBtn label="Slow" onClick={() => speak(cur.prompt, { rate: 0.72, lang })}><Rabbit className="w-4 h-4" /></IconBtn>
            <IconBtn label="Play" onClick={() => speak(cur.prompt, { rate: 0.94, lang })}><Volume2 className="w-4 h-4" /></IconBtn>
            <IconBtn label="Listen" onClick={() => lastHeard && speak(lastHeard, { lang })}><Ear className="w-4 h-4" /></IconBtn>
          </div>

          {curScore && (
            <div className="mt-6 flex items-baseline gap-3">
              <div className={`text-5xl font-black ${bandColor}`}>{curScore.score}%</div>
              <div className={`text-sm font-bold ${bandColor}`}>
                {curScore.band === "great" ? "Excellent!" : curScore.band === "good" ? "Good — try once more" : "Keep practising"}
              </div>
            </div>
          )}
          {lastHeard && (
            <div className="mt-2 text-xs text-white/50">You said: <span className="font-semibold text-white/80">{lastHeard}</span></div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 md:px-10 py-6 border-t border-white/10">
          <button
            onClick={goPrev}
            disabled={idx === 0}
            className="w-12 h-12 grid place-items-center rounded-full border border-white/20 text-white/70 hover:border-white/50 disabled:opacity-30"
            aria-label="Previous"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={startListen}
            disabled={!supported}
            className={`w-16 h-16 grid place-items-center rounded-full text-white shadow-xl transition ${
              busy ? "bg-rose-500 hover:bg-rose-600 animate-pulse" : "bg-blue-500 hover:bg-blue-400"
            } disabled:opacity-50`}
            aria-label={busy ? "Stop" : "Record"}
            title={supported ? "" : "Speech recognition not supported in this browser"}
          >
            <Mic className="w-7 h-7" />
          </button>
          <button
            onClick={goNext}
            className="w-12 h-12 grid place-items-center rounded-full border border-white/20 text-white/70 hover:border-white/50"
            aria-label={idx + 1 >= total ? "Finish" : "Next"}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        {!supported && (
          <div className="px-6 pb-4 text-center text-xs text-rose-300">
            Microphone scoring isn't available in this browser. Try Chrome or Safari.
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-11 h-11 grid place-items-center rounded-full bg-white text-blue-600 hover:bg-blue-50 transition shadow"
    >
      {children}
    </button>
  );
}
