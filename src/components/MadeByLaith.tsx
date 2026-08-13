import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A small "Made by Laith" credit that casts itself onto the page like a spell:
 * a wand sweeps in, traces a glowing arc, scatters sparks, and the signature
 * appears in its trail. Decorative only — never affects layout around it.
 */
export function MadeByLaith({ className = "" }: { className?: string }) {
  const [cast, setCast] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    timer.current = setTimeout(() => setCast(1), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reduced]);

  // Stable spark geometry so re-casts feel like the same enchantment.
  const sparks = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        x: 6 + Math.random() * 170,
        y: -10 + Math.random() * 26,
        s: 1.5 + Math.random() * 2.5,
        d: 0.45 + Math.random() * 0.7,
        delay: 0.25 + Math.random() * 0.5,
      })),
    [],
  );

  const active = !reduced && cast > 0;

  return (
    <div
      className={`select-none ${className}`}
      onMouseEnter={() => !reduced && setCast((c) => c + 1)}
      title="Made by Laith Shahin"
    >
      <span className="sr-only">Made by Laith Shahin</span>
      <div key={cast} aria-hidden className="relative inline-block pt-3 pb-1 pr-3">
        {/* the traced arc */}
        <svg
          viewBox="0 0 220 42"
          className="absolute -top-1 left-0 h-[46px] w-[220px] overflow-visible pointer-events-none"
        >
          <path
            d="M4 30 C 34 4, 140 4, 198 22"
            fill="none"
            stroke="url(#laith-spark)"
            strokeWidth="1.6"
            strokeLinecap="round"
            className={active ? "laith-arc" : "opacity-0"}
          />
          <defs>
            <linearGradient id="laith-spark" x1="0" x2="1">
              <stop offset="0%" stopColor="hsl(45 95% 60%)" stopOpacity="0" />
              <stop offset="45%" stopColor="hsl(45 95% 62%)" />
              <stop offset="100%" stopColor="hsl(38 92% 55%)" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>

        {/* the wand */}
        <svg
          viewBox="0 0 46 12"
          className={`absolute -top-2 left-0 h-[13px] w-[50px] pointer-events-none ${
            active ? "laith-wand" : "opacity-0"
          }`}
        >
          <line
            x1="2"
            y1="10"
            x2="42"
            y2="3"
            stroke="hsl(28 35% 26%)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <line
            x1="2"
            y1="10"
            x2="14"
            y2="8"
            stroke="hsl(28 30% 16%)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="43" cy="2.6" r="2.4" fill="hsl(48 100% 72%)" opacity="0.9" />
        </svg>

        {/* sparks */}
        {active &&
          sparks.map((s) => (
            <span
              key={s.id}
              className="laith-spark absolute rounded-full"
              style={{
                left: `${s.x}px`,
                top: `${s.y}px`,
                width: `${s.s}px`,
                height: `${s.s}px`,
                background: "hsl(46 100% 68%)",
                boxShadow: "0 0 6px hsl(45 100% 62%)",
                animationDuration: `${s.d}s`,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}

        {/* the signature */}
        <span className="relative flex items-baseline gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Made by
          </span>
          <span
            className={`text-[17px] leading-none text-foreground ${active ? "laith-name" : ""}`}
            style={{
              fontFamily: "'Cinzel Decorative', 'Aref Ruqaa', serif",
              fontWeight: 700,
              textShadow: "0 0 14px hsl(45 100% 62% / 0.45)",
            }}
          >
            Laith Shahin
          </span>
        </span>
      </div>

      <style>{`
        @keyframes laith-arc-draw {
          0% { stroke-dashoffset: 300; opacity: 0; }
          12% { opacity: 1; }
          70% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        .laith-arc {
          stroke-dasharray: 300;
          animation: laith-arc-draw 1.5s ease-out forwards;
        }
        @keyframes laith-wand-cast {
          0% { transform: translate(-28px, 10px) rotate(-24deg); opacity: 0; }
          15% { opacity: 1; }
          60% { transform: translate(110px, -4px) rotate(-4deg); opacity: 1; }
          100% { transform: translate(165px, -14px) rotate(14deg); opacity: 0; }
        }
        .laith-wand { animation: laith-wand-cast 1.5s cubic-bezier(.4,.1,.25,1) forwards; }
        @keyframes laith-spark-float {
          0% { transform: translate(0,0) scale(0); opacity: 0; }
          25% { opacity: 1; transform: scale(1); }
          100% { transform: translate(0, 16px) scale(0.2); opacity: 0; }
        }
        .laith-spark { animation-name: laith-spark-float; animation-timing-function: ease-out; animation-fill-mode: forwards; }
        @keyframes laith-name-reveal {
          0%, 35% { opacity: 0; filter: blur(6px); transform: translateY(3px); }
          70% { opacity: 1; filter: blur(0); transform: translateY(0); }
          100% { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        .laith-name { animation: laith-name-reveal 1.6s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .laith-arc, .laith-wand, .laith-spark, .laith-name { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
