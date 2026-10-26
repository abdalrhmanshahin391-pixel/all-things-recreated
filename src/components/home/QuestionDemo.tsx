import { useRef, useState } from "react";
import { Check, X, Lightbulb } from "lucide-react";

/**
 * Interactive question card for the home page. Move the mouse over an answer and it reacts:
 * the card tilts toward the pointer, a soft light follows it, the answer lifts and fills, and the right
 * answer opens its explanation (wrong ones tell you to try again). Taps work the same on touch screens.
 * The question and the explanation are the real Anatomy content that students see in a session.
 */
const OPTIONS: { key: string; text: string; correct?: boolean }[] = [
  { key: "A", text: "Blood supply entering at the posterior border" },
  { key: "B", text: "Nerve entrapment in the sulcus malleolaris" },
  { key: "C", text: "Thick muscular fascia over the lateral surface" },
  { key: "D", text: "Absence of muscle covering the medial surface and anterior border", correct: true },
];

const EXPLANATION =
  "The anterior border and medial surface of the tibia have no muscle over them, so a direct blow reaches the periosteum, which is rich in nerves.";

export function QuestionDemo() {
  const [active, setActive] = useState<string | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 30 });
  const resetTimer = useRef<number | null>(null);

  const choice = OPTIONS.find((o) => o.key === active) ?? null;
  const revealed = !!choice?.correct;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 7, y: (px - 0.5) * 9, mx: px * 100, my: py * 100 });
  };
  const onLeave = () => {
    setTilt({ x: 0, y: 0, mx: 50, my: 30 });
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setActive(null), 900);
  };
  const onEnter = () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  };

  return (
    <div className="relative mx-auto w-full max-w-md" style={{ perspective: "1000px" }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl"
        style={{ background: "color-mix(in oklab, var(--gold) 28%, white)" }}
      />
      <div
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onMouseEnter={onEnter}
        className="relative overflow-hidden rounded-3xl border border-border bg-[color:var(--cream)] p-5 shadow-[0_30px_60px_-32px_rgba(19,41,75,0.5)] transition-[transform,box-shadow] duration-300 ease-out md:p-7"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* soft light that follows the pointer */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(260px circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.75), transparent 60%)`,
            opacity: active || tilt.x !== 0 || tilt.y !== 0 ? 1 : 0,
          }}
        />

        <div className="relative">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Anatomy · Question 1
            </span>
            <span className="rounded-full bg-[color:var(--gold)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold-foreground)]">
              Try it
            </span>
          </div>

          <p className="text-[15px] font-semibold leading-snug text-foreground">
            A soccer player is struck on the front of his lower leg and feels severe, sharp pain over the shin.
            Which feature best explains it?
          </p>

          <div className="mt-4 space-y-2">
            {OPTIONS.map((o) => {
              const on = active === o.key;
              const good = on && "correct" in o && o.correct;
              const bad = on && !good;
              return (
                <button
                  key={o.key}
                  type="button"
                  onMouseEnter={() => setActive(o.key)}
                  onFocus={() => setActive(o.key)}
                  onClick={() => setActive(o.key)}
                  className="group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug transition-all duration-300 ease-out"
                  style={{
                    background: good ? "var(--navy)" : bad ? "var(--card)" : "var(--card)",
                    color: good ? "var(--on-navy)" : "var(--foreground)",
                    borderColor: good ? "var(--navy)" : bad ? "color-mix(in oklab, var(--destructive) 55%, transparent)" : on ? "var(--primary)" : "var(--border)",
                    transform: on ? "translateX(6px) scale(1.015)" : "none",
                    boxShadow: on ? "0 14px 28px -18px rgba(19,41,75,0.55)" : "none",
                  }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-300"
                    style={{
                      background: good ? "var(--gold)" : bad ? "color-mix(in oklab, var(--destructive) 14%, white)" : "var(--primary-soft)",
                      color: good ? "var(--gold-foreground)" : bad ? "var(--destructive)" : "var(--primary)",
                    }}
                  >
                    {good ? (
                      <Check size={14} strokeWidth={3} />
                    ) : bad ? (
                      <X size={14} strokeWidth={3} />
                    ) : (
                      o.key
                    )}
                  </span>
                  <span className="flex-1">{o.text}</span>
                  {good && (
                    <span className="rounded-full bg-[color:var(--gold)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold-foreground)]">
                      Correct
                    </span>
                  )}
                  {bad && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--destructive)]">
                      Try again
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* explanation slides in on the right answer; its space is reserved so nothing around it moves */}
          <div className="mt-3 h-[84px]">
            <div
              className="flex gap-3 rounded-xl border border-[color:var(--gold)]/50 bg-white/70 p-3 transition-all duration-500 ease-out"
              style={{
                opacity: revealed ? 1 : 0,
                transform: revealed ? "translateY(0)" : "translateY(10px)",
              }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{ background: "var(--navy)", color: "var(--gold)" }}
              >
                <Lightbulb size={16} strokeWidth={2} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{EXPLANATION}</p>
            </div>
          </div>

          <p
            className="mt-4 text-center text-[11px] font-medium text-muted-foreground transition-opacity duration-300"
            style={{ opacity: active ? 0 : 1 }}
          >
            Move your mouse over an answer
          </p>
        </div>
      </div>
    </div>
  );
}
