import { useEffect, useState } from "react";

/**
 * Seasonal decoration layer. Sits behind the page content, never intercepts
 * clicks, and renders nothing for the default / colour-only themes.
 * The active theme is read from <html data-theme> so it reacts instantly when
 * an admin switches the theme.
 */
export function ThemeDecor() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.getAttribute("data-theme"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    // Pause decoration animations while the tab is in the background so an
    // idle tab costs no CPU or battery.
    const syncVisibility = () => root.classList.toggle("tab-hidden", document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      root.classList.remove("tab-hidden");
    };
  }, []);


  if (theme === "academy") return <AcademyDecor />;
  if (theme === "ramadan") return <RamadanDecor />;
  if (theme === "eid") return <EidDecor />;
  if (theme === "christmas") return <ChristmasDecor />;
  if (theme === "fireworks") return <FireworksDecor />;
  if (theme === "stars") return <StarsDecor />;
  if (theme === "golden-age") return <GoldenAgeDecor />;
  if (theme === "parchment") return <ParchmentDecor />;
  if (theme === "andalus") return <AndalusDecor />;
  if (theme === "desert-night") return <DesertNightDecor />;
  if (theme === "emerald-library") return <EmeraldLibraryDecor />;
  return null;
}

/* ── Heritage themes ─────────────────────────────────────────────────── */

/** Repeating eight-point Islamic star tile, drawn as a data-URI so it tiles cheaply. */
function starTile(stroke: string, opacity: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1.2">
      <rect x="10" y="10" width="100" height="100"/>
      <rect x="10" y="10" width="100" height="100" transform="rotate(45 60 60)"/>
      <circle cx="60" cy="60" r="34"/>
      <path d="M60 6 L60 114 M6 60 L114 60"/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const MOTES = Array.from({ length: 18 }).map((_, i) => {
  const rnd = (n: number) => ((Math.sin(i * 9.17 + n * 41.3) + 1) / 2);
  return {
    left: `${(rnd(1) * 100).toFixed(2)}%`,
    top: `${(15 + rnd(2) * 75).toFixed(2)}%`,
    size: 2 + Math.round(rnd(3) * 3),
    delay: `${(rnd(4) * 18).toFixed(2)}s`,
  };
});

function Astrolabe({ style, color }: { style: React.CSSProperties; color: string }) {
  return (
    <svg className="decor-astrolabe" style={style} viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="1.4">
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="76" />
        <circle cx="100" cy="100" r="48" />
        <circle cx="100" cy="100" r="20" />
        <path d="M4 100 H196 M100 4 V196 M30 30 L170 170 M170 30 L30 170" />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (Math.PI / 12) * i;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * 84}
              y1={100 + Math.sin(a) * 84}
              x2={100 + Math.cos(a) * 96}
              y2={100 + Math.sin(a) * 96}
            />
          );
        })}
      </g>
    </svg>
  );
}

function GoldenAgeDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="decor-tessellation hidden md:block"
        style={{ backgroundImage: starTile("#c9a227", 0.16), backgroundSize: "120px 120px" }}
      />
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: "60vh", background: "radial-gradient(70% 80% at 50% 0%, rgba(201,162,39,0.16), transparent 72%)" }}
      />
      <Astrolabe
        style={{ right: "-70px", top: "8vh", width: 320, height: 320, opacity: 0.18 }}
        color="#c9a227"
      />
      <Astrolabe
        style={{ left: "-90px", bottom: "6vh", width: 260, height: 260, opacity: 0.12 }}
        color="#7fd3d8"
      />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="decor-mote"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            background: "rgba(201,162,39,0.7)",
            boxShadow: "0 0 8px rgba(201,162,39,0.6)",
            animationDelay: m.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Fine eight-point khatam lattice — lighter and more manuscript-like than starTile. */
function khatamTile(stroke: string, opacity: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="0.9" stroke-linejoin="round">
      <path d="M48 8 L60 24 L80 24 L80 44 L88 48 L80 52 L80 72 L60 72 L48 88 L36 72 L16 72 L16 52 L8 48 L16 44 L16 24 L36 24 Z"/>
      <path d="M48 20 L68 48 L48 76 L28 48 Z"/>
      <circle cx="48" cy="48" r="7"/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function IlluminatedCorner({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg className={className} style={style} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <g stroke="#b08934" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M8 8 H120 M8 8 V120" />
        <path d="M18 18 H96 M18 18 V96" strokeOpacity="0.7" />
        <path d="M18 96 C56 96 96 56 96 18" strokeOpacity="0.75" />
        <path d="M30 74 C58 74 74 58 74 30" strokeOpacity="0.55" />
        <path d="M18 52 C40 52 52 40 52 18" strokeOpacity="0.5" />
        <path d="M96 18 C120 30 130 44 132 62" strokeOpacity="0.4" />
        <path d="M18 96 C30 120 44 130 62 132" strokeOpacity="0.4" />
      </g>
      <g fill="#8c2f1f" fillOpacity="0.45">
        <circle cx="18" cy="18" r="3.2" />
        <circle cx="74" cy="30" r="2.2" />
        <circle cx="30" cy="74" r="2.2" />
      </g>
      <g fill="#b08934" fillOpacity="0.35">
        <circle cx="52" cy="52" r="4" />
        <circle cx="96" cy="18" r="2.4" />
        <circle cx="18" cy="96" r="2.4" />
      </g>
    </svg>
  );
}

function ParchmentDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      {/* Aged vellum surface */}
      <div className="decor-vellum" />

      {/* Very faint khatam lattice, desktop only */}
      <div
        className="decor-tessellation hidden md:block"
        style={{ backgroundImage: khatamTile("#8c6b2f", 0.16), backgroundSize: "96px 96px", opacity: 0.5 }}
      />

      {/* Ruled manuscript margins */}
      <div className="decor-rules hidden md:block" />

      {/* Illuminated corners */}
      <IlluminatedCorner className="decor-corner hidden md:block" style={{ top: "1rem", left: "1rem" }} />
      <IlluminatedCorner
        className="decor-corner hidden md:block"
        style={{ bottom: "1rem", right: "1rem", transform: "rotate(180deg)" }}
      />

      {/* Pointed arch (mihrab) silhouette + desert dunes at the foot of the page */}
      <svg
        className="decor-arch"
        style={{ height: "38vh" }}
        viewBox="0 0 1200 400"
        preserveAspectRatio="none"
      >
        <path
          d="M600 40 C740 120 800 230 800 400 L400 400 C400 230 460 120 600 40 Z"
          fill="none"
          stroke="#8c2f1f"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        <path
          d="M600 90 C710 160 760 250 760 400 L440 400 C440 250 490 160 600 90 Z"
          fill="none"
          stroke="#b08934"
          strokeOpacity="0.3"
          strokeWidth="1.4"
        />
      </svg>

      <svg className="decor-dunes" style={{ height: "26vh" }} viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d="M0 210 C180 150 320 250 520 205 C700 165 860 235 1200 175 L1200 300 L0 300 Z" fill="#b08934" fillOpacity="0.14" />
        <path d="M0 250 C220 205 380 285 620 245 C830 210 1000 275 1200 235 L1200 300 L0 300 Z" fill="#8c6b2f" fillOpacity="0.16" />
      </svg>

      {/* Sparse ink motes drifting up the page */}
      {MOTES.slice(0, 10).map((m, i) => (
        <span
          key={i}
          className="decor-mote"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            background: "rgba(120,85,40,0.45)",
            animationDelay: m.delay,
          }}
        />
      ))}
    </div>
  );
}


function AndalusDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="decor-tessellation hidden md:block"
        style={{ backgroundImage: starTile("#1f8a93", 0.18), backgroundSize: "100px 100px" }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: "40vh", background: "radial-gradient(70% 100% at 50% 100%, rgba(193,85,46,0.14), transparent 72%)" }}
      />
    </div>
  );
}

function DesertNightDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="absolute left-[70%] rounded-full decor-glow"
        style={{
          top: "-10vh",
          width: "44vw",
          height: "44vw",
          background: "radial-gradient(circle, rgba(224,160,74,0.28) 0%, transparent 65%)",
        }}
      />
      <div
        className="decor-haze absolute inset-x-0 bottom-0"
        style={{
          height: "45vh",
          background:
            "radial-gradient(120% 90% at 20% 100%, rgba(224,160,74,0.14), transparent 70%), radial-gradient(120% 90% at 80% 100%, rgba(120,110,200,0.14), transparent 70%)",
        }}
      />
    </div>
  );
}

function EmeraldLibraryDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,0.45)" }}
      />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="decor-mote"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            background: "rgba(185,154,83,0.6)",
            boxShadow: "0 0 8px rgba(185,154,83,0.5)",
            animationDelay: m.delay,
          }}
        />
      ))}
    </div>
  );
}

/* ── Fireworks ───────────────────────────────────────────────────────── */

const BURSTS = [
  { left: "12%", color: "#ff4d6d", height: "42vh", delay: "0s", spread: 100 },
  { left: "31%", color: "#ffd166", height: "54vh", delay: "1.4s", spread: 120 },
  { left: "52%", color: "#8ab6ff", height: "36vh", delay: "2.6s", spread: 90 },
  { left: "71%", color: "#c77dff", height: "50vh", delay: "0.7s", spread: 115 },
  { left: "88%", color: "#63e6be", height: "40vh", delay: "3.6s", spread: 95 },
];

function FireworksDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: "60vh", background: "radial-gradient(60% 80% at 50% 0%, rgba(255,77,109,0.12), transparent 70%)" }}
      />
      {BURSTS.map((b, i) => (
        <div
          key={i}
          className="decor-firework"
          style={
            {
              left: b.left,
              bottom: "6vh",
              animationDelay: b.delay,
              "--fw-color": b.color,
              "--fw-height": b.height,
            } as React.CSSProperties
          }
        >
          <span className="fw-shell" style={{ animationDelay: b.delay }} />
          {Array.from({ length: 14 }).map((_, p) => (
            <span
              key={p}
              className="fw-petal"
              style={
                {
                  animationDelay: b.delay,
                  "--fw-angle": `${(360 / 14) * p}deg`,
                  "--fw-spread": `${b.spread}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Stars ───────────────────────────────────────────────────────────── */

const STARFIELD = Array.from({ length: 70 }).map((_, i) => {
  const rnd = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) + 1) / 2);
  return {
    left: `${(rnd(1) * 100).toFixed(2)}%`,
    top: `${(rnd(2) * 100).toFixed(2)}%`,
    size: 1 + Math.round(rnd(3) * 2),
    delay: `${(rnd(4) * 4).toFixed(2)}s`,
  };
});

function StarsDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(138,182,255,0.14), transparent 70%)" }}
      />
      {STARFIELD.map((s, i) => (
        <span
          key={i}
          className="decor-star"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
        />
      ))}
      <span className="decor-shooting" style={{ top: "12vh", animationDelay: "1.5s" }} />
      <span className="decor-shooting" style={{ top: "38vh", animationDelay: "6s" }} />
    </div>
  );
}

/* ── Ramadan ─────────────────────────────────────────────────────────── */

const LANTERNS = [
  { left: "4%", cord: 70, size: 58, delay: "0s" },
  { left: "13%", cord: 150, size: 82, delay: "0.12s" },
  { left: "26%", cord: 40, size: 46, delay: "0.24s" },
  { left: "74%", cord: 46, size: 50, delay: "0.18s" },
  { left: "86%", cord: 140, size: 78, delay: "0.06s" },
  { left: "95%", cord: 84, size: 54, delay: "0.3s" },
];

const SPARKLES = [
  { left: "8%", top: "34%", size: 5, delay: "0s" },
  { left: "19%", top: "52%", size: 3, delay: "1.2s" },
  { left: "31%", top: "24%", size: 4, delay: "2.4s" },
  { left: "45%", top: "62%", size: 3, delay: "0.8s" },
  { left: "58%", top: "30%", size: 5, delay: "3.1s" },
  { left: "69%", top: "56%", size: 3, delay: "1.9s" },
  { left: "82%", top: "38%", size: 4, delay: "2.7s" },
  { left: "92%", top: "64%", size: 3, delay: "0.4s" },
];

function RamadanDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      {/* soft crescent glow behind the top of the page */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full decor-glow"
        style={{
          top: "-14vh",
          width: "70vw",
          height: "50vh",
          background: "radial-gradient(circle, rgba(216,161,58,0.22) 0%, transparent 68%)",
        }}
      />
      <CornerOrnament className="absolute left-0 top-0" />
      <CornerOrnament className="absolute right-0 top-0 -scale-x-100" />
      <CornerOrnament className="absolute left-0 bottom-0 -scale-y-100" />
      <CornerOrnament className="absolute right-0 bottom-0 -scale-100" />

      {LANTERNS.map((l, i) => (
        <div
          key={i}
          className="decor-lantern"
          style={{ left: l.left, animationDelay: `${l.delay}, calc(1.1s + ${l.delay})` }}
        >
          <Lantern cord={l.cord} size={l.size} />
        </div>
      ))}

      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="decor-sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

function Lantern({ cord, size }: { cord: number; size: number }) {
  const w = size;
  const h = size * 1.5;
  return (
    <svg width={w} height={cord + h} viewBox={`0 0 ${w} ${cord + h}`} fill="none">
      <line x1={w / 2} y1="0" x2={w / 2} y2={cord} stroke="#d8a13a" strokeWidth="1.4" opacity="0.8" />
      <g transform={`translate(0 ${cord})`} opacity="0.95">
        {/* crown */}
        <path
          d={`M${w / 2} 0 l${w * 0.06} ${h * 0.05} h${-w * 0.12} z`}
          fill="#e3b45c"
        />
        <rect x={w * 0.3} y={h * 0.05} width={w * 0.4} height={h * 0.07} rx={h * 0.03} fill="#d8a13a" />
        {/* body cage */}
        <ellipse cx={w / 2} cy={h * 0.5} rx={w * 0.45} ry={h * 0.33} fill="rgba(216,161,58,0.16)" />
        <ellipse
          cx={w / 2}
          cy={h * 0.5}
          rx={w * 0.45}
          ry={h * 0.33}
          stroke="#e3b45c"
          strokeWidth="2"
        />
        <ellipse cx={w / 2} cy={h * 0.5} rx={w * 0.2} ry={h * 0.33} stroke="#e3b45c" strokeWidth="1.4" />
        <line x1={w / 2} y1={h * 0.17} x2={w / 2} y2={h * 0.83} stroke="#e3b45c" strokeWidth="1.4" />
        {/* candle glow */}
        <circle cx={w / 2} cy={h * 0.55} r={w * 0.24} fill="rgba(255,214,130,0.35)" />
        <rect x={w * 0.42} y={h * 0.5} width={w * 0.16} height={h * 0.18} rx={2} fill="#fff6e0" />
        <ellipse cx={w / 2} cy={h * 0.48} rx={w * 0.05} ry={h * 0.05} fill="#ffd580" />
        {/* base */}
        <rect x={w * 0.26} y={h * 0.8} width={w * 0.48} height={h * 0.07} rx={h * 0.03} fill="#d8a13a" />
        <path d={`M${w * 0.44} ${h * 0.87} h${w * 0.12} l${-w * 0.06} ${h * 0.1} z`} fill="#e3b45c" />
      </g>
    </svg>
  );
}

function CornerOrnament({ className }: { className?: string }) {
  return (
    <svg className={className} width="180" height="180" viewBox="0 0 180 180" fill="none" opacity="0.22">
      <path
        d="M0 60 Q0 0 60 0 L120 0 Q90 12 78 42 Q66 72 36 84 Q6 96 0 120 Z"
        stroke="#d8a13a"
        strokeWidth="2"
        fill="none"
      />
      <path d="M0 40 Q0 0 40 0 L86 0" stroke="#d8a13a" strokeWidth="1.2" fill="none" />
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 5 }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={12 + c * 16} cy={12 + r * 16} r="2.4" fill="#d8a13a" opacity="0.5" />
        )),
      )}
    </svg>
  );
}

/* ── Eid ─────────────────────────────────────────────────────────────── */

const STARS = Array.from({ length: 26 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 70}%`,
  size: (i % 3) + 2,
  delay: `${(i % 8) * 0.5}s`,
}));

function EidDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 12%, rgba(212,175,55,0.16) 0%, transparent 55%)",
        }}
      />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="decor-star"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
        />
      ))}

      {/* Large golden crescent */}
      <svg
        className="absolute decor-glow"
        style={{ top: "4vh", right: "6vw", width: "min(38vw, 340px)" }}
        viewBox="0 0 200 200"
        fill="none"
      >
        <defs>
          <linearGradient id="eid-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6dfa0" />
            <stop offset="55%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8a6a1f" />
          </linearGradient>
        </defs>
        <path
          d="M130 12 A94 94 0 1 0 130 188 A76 76 0 1 1 130 12 Z"
          fill="url(#eid-gold)"
          opacity="0.85"
        />
      </svg>

      {/* Mosque silhouette anchored to the bottom */}
      <svg
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ width: "min(90vw, 900px)" }}
        viewBox="0 0 900 220"
        fill="none"
        opacity="0.2"
      >
        <g fill="#d4af37">
          <rect x="120" y="120" width="30" height="100" />
          <path d="M135 92 q16 14 15 28 h-30 q-1 -14 15 -28z" />
          <rect x="205" y="90" width="26" height="130" />
          <path d="M218 62 q14 14 13 28 h-26 q-1 -14 13 -28z" />
          <rect x="669" y="90" width="26" height="130" />
          <path d="M682 62 q14 14 13 28 h-26 q-1 -14 13 -28z" />
          <rect x="750" y="120" width="30" height="100" />
          <path d="M765 92 q16 14 15 28 h-30 q-1 -14 15 -28z" />
          <path d="M300 220 v-90 q150 -120 300 0 v90z" />
          <path d="M420 96 q30 -74 60 0 q-30 -22 -60 0z" />
          <rect x="80" y="200" width="740" height="20" rx="4" />
        </g>
        <path d="M430 220 v-58 a20 20 0 0 1 40 0 v58z" fill="#0f0c06" opacity="0.75" />
      </svg>
    </div>
  );
}

/* ── Christmas ───────────────────────────────────────────────────────── */

const SNOW = Array.from({ length: 45 }, (_, i) => ({
  left: `${(i * 22.7) % 100}%`,
  size: ((i * 7) % 4) + 3,
  duration: `${8 + ((i * 3) % 9)}s`,
  delay: `${-((i * 1.7) % 12)}s`,
  drift: `${((i % 5) - 2) * 26}px`,
}));

function ChristmasDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      {SNOW.map((f, i) => (
        <span
          key={i}
          className="decor-snow"
          style={
            {
              left: f.left,
              width: f.size,
              height: f.size,
              animationDuration: f.duration,
              animationDelay: f.delay,
              "--snow-drift": f.drift,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="decor-sleigh" style={{ top: "8vh" }}>
        <SantaSleigh />
      </div>
    </div>
  );
}

function SantaSleigh() {
  return (
    <svg width="300" height="110" viewBox="0 0 300 110" fill="none">
      {[0, 68, 136].map((x, i) => (
        <g key={i} transform={`translate(${x} 34)`}>
          {/* reindeer */}
          <path d="M8 22 h34 v14 h-34z" fill="#8b5a2b" />
          <rect x="10" y="34" width="4" height="16" fill="#8b5a2b" />
          <rect x="22" y="34" width="4" height="16" fill="#7a4d24" />
          <rect x="36" y="34" width="4" height="16" fill="#8b5a2b" />
          <path d="M42 22 l12 -6 v14 l-12 4z" fill="#8b5a2b" />
          <path d="M50 16 l-4 -12 m4 12 l6 -12" stroke="#5c3a1a" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="55" cy="20" r="3" fill={i === 2 ? "#ff3b30" : "#5c3a1a"} />
          <line x1="0" y1="28" x2="8" y2="28" stroke="#b45309" strokeWidth="2" />
        </g>
      ))}
      {/* sleigh */}
      <g transform="translate(196 40)">
        <path d="M0 26 q0 -20 22 -20 h48 q-6 22 -22 26 h-40z" fill="#c62828" />
        <path d="M60 6 q14 -12 28 -6 q-12 6 -14 20z" fill="#a01d1d" />
        <path d="M-4 34 h82 q10 0 12 -10" stroke="#e3b45c" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="34" cy="0" r="8" fill="#2e7d32" />
        <circle cx="48" cy="-2" r="6" fill="#2e7d32" />
      </g>
    </svg>
  );
}

/* ── Academy ─────────────────────────────────────────────────────────── */

const CONFETTI = [
  { left: "6%", top: "18%", size: 34, color: "#0e7490", shape: "pentagon", delay: "0s" },
  { left: "18%", top: "62%", size: 20, color: "#f2994a", shape: "pentagon", delay: "2.4s" },
  { left: "78%", top: "22%", size: 26, color: "#f5c518", shape: "spark", delay: "1.2s" },
  { left: "88%", top: "68%", size: 18, color: "#ef6ea8", shape: "square", delay: "3.1s" },
  { left: "44%", top: "12%", size: 16, color: "#4cae7a", shape: "square", delay: "4.2s" },
  { left: "62%", top: "80%", size: 24, color: "#22b8cf", shape: "spark", delay: "0.8s" },
] as const;

function ConfettiShape({ shape, size, color }: { shape: string; size: number; color: string }) {
  if (shape === "spark") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12C8 10 11 7 12 0Z" />
      </svg>
    );
  }
  if (shape === "square") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <rect x="1" y="1" width="22" height="22" rx="3" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 1.5 22.5 9.2 18.5 21.5h-13L1.5 9.2Z" />
    </svg>
  );
}

function AcademyDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <div className="decor-runway" />
      <div className="hidden sm:block">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="decor-confetti"
            style={{ left: c.left, top: c.top, opacity: 0.5, animationDelay: c.delay }}
          >
            <ConfettiShape shape={c.shape} size={c.size} color={c.color} />
          </span>
        ))}
        <span className="decor-orbit" style={{ left: "70%", top: "40%", opacity: 0.35 }}>
          <svg width="180" height="70" viewBox="0 0 180 70" fill="none">
            <ellipse cx="90" cy="35" rx="86" ry="30" stroke="#8fd3e8" strokeWidth="3" />
          </svg>
        </span>
      </div>
    </div>
  );
}
