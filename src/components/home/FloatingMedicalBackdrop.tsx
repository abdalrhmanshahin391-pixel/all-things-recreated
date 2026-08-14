import {
  Stethoscope,
  HeartPulse,
  Pill,
  Syringe,
  Microscope,
  Brain,
  Dna,
  Activity,
  Cross,
  Bandage,
  FlaskConical,
  Thermometer,
} from "lucide-react";

type Glyph = {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  color: string;
  bg: string;
  size: number;
  delay: string;
  duration: string;
  rotate: number;
};

const GLYPHS: Glyph[] = [
  { Icon: Stethoscope, top: "8%", left: "4%", color: "var(--primary)", bg: "var(--primary-soft)", size: 56, delay: "0s", duration: "5.5s", rotate: -8 },
  { Icon: HeartPulse, top: "18%", left: "22%", color: "#e11d48", bg: "#ffe4e6", size: 44, delay: "0.6s", duration: "6.2s", rotate: 6 },
  { Icon: Pill, top: "62%", left: "6%", color: "#f97316", bg: "#ffedd5", size: 48, delay: "0.3s", duration: "5.8s", rotate: 12 },
  { Icon: Microscope, bottom: "10%", left: "20%", color: "#7c3aed", bg: "#ede9fe", size: 52, delay: "1.2s", duration: "6.6s", rotate: -4 },
  { Icon: Syringe, top: "10%", right: "6%", color: "#0ea5e9", bg: "#e0f2fe", size: 50, delay: "0.4s", duration: "5.4s", rotate: 10 },
  { Icon: Brain, top: "30%", right: "20%", color: "#db2777", bg: "#fce7f3", size: 46, delay: "1.4s", duration: "6.0s", rotate: -10 },
  { Icon: Dna, bottom: "20%", right: "8%", color: "#0891b2", bg: "#cffafe", size: 50, delay: "0.8s", duration: "5.6s", rotate: 8 },
  { Icon: Activity, bottom: "6%", right: "26%", color: "var(--primary)", bg: "var(--primary-soft)", size: 42, delay: "1.0s", duration: "6.4s", rotate: -6 },
  { Icon: Cross, top: "48%", left: "44%", color: "var(--primary)", bg: "var(--primary-soft)", size: 38, delay: "1.6s", duration: "6.8s", rotate: 0 },
  { Icon: Bandage, top: "70%", right: "40%", color: "#f59e0b", bg: "#fef3c7", size: 40, delay: "0.2s", duration: "5.2s", rotate: 14 },
  { Icon: FlaskConical, top: "4%", left: "52%", color: "#0ea5e9", bg: "#e0f2fe", size: 42, delay: "1.8s", duration: "6.0s", rotate: -12 },
  { Icon: Thermometer, bottom: "30%", left: "52%", color: "#dc2626", bg: "#fee2e2", size: 40, delay: "2.0s", duration: "5.8s", rotate: 4 },
];

/**
 * FloatingMedicalBackdrop — soft pastel rounded squares with medical Lucide
 * icons floating gently in place. Pure CSS, no JS animation loop.
 * Hidden on small screens to avoid visual noise on mobile.
 */
export function FloatingMedicalBackdrop({
  density = "hero",
  tone = "pastel",
}: {
  density?: "hero" | "page";
  /** "gold" keeps every glyph on the brand gold/slate palette (auth screens). */
  tone?: "pastel" | "gold";
}) {
  const items = density === "page" ? GLYPHS.slice(0, 8) : GLYPHS;
  const gold = tone === "gold";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden hidden md:block"
      style={{ opacity: gold ? 0.9 : density === "page" ? 0.55 : 1 }}
    >
      {items.map((g, i) => {
        const { Icon } = g;
        return (
          <div
            key={i}
            className="medglyph-float absolute rounded-2xl grid place-items-center"
            style={{
              top: g.top,
              left: g.left,
              right: g.right,
              bottom: g.bottom,
              width: g.size,
              height: g.size,
              background: gold
                ? i % 3 === 0
                  ? "color-mix(in oklab, var(--primary) 22%, transparent)"
                  : "color-mix(in oklab, var(--foreground) 7%, transparent)"
                : g.bg,
              color: gold
                ? i % 3 === 0
                  ? "var(--primary)"
                  : "color-mix(in oklab, var(--foreground) 55%, transparent)"
                : g.color,
              border: gold ? "1px solid color-mix(in oklab, var(--primary) 22%, transparent)" : undefined,
              transform: `rotate(${g.rotate}deg)`,
              boxShadow: gold ? "none" : "0 4px 0 rgba(15,23,42,0.06)",
              animationDelay: g.delay,
              animationDuration: g.duration,
            }}
          >
            <Icon size={Math.round(g.size * 0.55)} strokeWidth={2.2} />
          </div>
        );
      })}
    </div>
  );
}
