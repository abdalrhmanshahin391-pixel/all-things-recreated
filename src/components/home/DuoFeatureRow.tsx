import type { ReactNode } from "react";
import { HeartPulse, Activity, Pill, Microscope } from "lucide-react";

type Variant = "subjects" | "notebook" | "streak";

type Props = {
  eyebrow?: string;
  title: string;
  body: string;
  variant: Variant;
  reverse?: boolean;
  accent?: "green" | "blue" | "orange";
};

/**
 * DuoFeatureRow — alternating text/visual row. Visuals are pure CSS,
 * no characters, no animations.
 */
export function DuoFeatureRow({ eyebrow, title, body, variant, reverse = false, accent = "green" }: Props) {
  const color =
    accent === "blue" ? "var(--secondary)" : accent === "orange" ? "#ff9600" : "var(--primary)";

  return (
    <section className="py-20 md:py-28">
      <div
        className={`mx-auto max-w-6xl px-4 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center ${
          reverse ? "lg:[direction:rtl]" : ""
        }`}
      >
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          <Visual variant={variant} color={color} />
        </div>
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          {eyebrow && (
            <p
              className="text-xs font-black uppercase tracking-[0.18em] mb-3"
              style={{ color }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className="font-display font-black text-foreground leading-[1.05] lowercase"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", color }}
          >
            {title}
          </h2>
          <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-md">
            {body}
          </p>
        </div>
      </div>
    </section>
  );
}

function Visual({ variant, color }: { variant: Variant; color: string }) {
  if (variant === "subjects") return <SubjectsCard color={color} />;
  if (variant === "notebook") return <NotebookCard color={color} />;
  return <StreakCard color={color} />;
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-md rounded-[2rem] p-6 md:p-8 bg-card"
      style={{
        border: "2px solid var(--border)",
        boxShadow: "0 6px 0 var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function SubjectsCard({ color }: { color: string }) {
  const tiles = [
    { label: "anatomy", c: "#58cc02", Icon: HeartPulse },
    { label: "physiology", c: "#1cb0f6", Icon: Activity },
    { label: "pharma", c: "#ff9600", Icon: Pill },
    { label: "pathology", c: "#ce82ff", Icon: Microscope },
  ];
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          year 2
        </span>
        <span
          className="text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md text-white"
          style={{ background: color }}
        >
          live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ label, c, Icon }) => (
          <div
            key={label}
            className="relative aspect-square rounded-2xl overflow-hidden text-white font-display font-black text-base lowercase"
            style={{ background: c, boxShadow: `0 4px 0 color-mix(in oklab, ${c} 60%, black)` }}
          >
            <Icon
              className="absolute inset-0 m-auto opacity-30"
              size={84}
              strokeWidth={2.2}
              color="white"
            />
            <span className="absolute top-3 left-3 right-3 leading-tight">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: "64%", background: color }} />
      </div>
    </CardShell>
  );
}


function NotebookCard({ color }: { color: string }) {
  return (
    <CardShell>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="h-10 w-10 rounded-xl grid place-items-center text-white font-black"
          style={{ background: color }}
        >
          Q
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">cardiology · mock 04</p>
          <p className="text-xs text-muted-foreground">reviewed by 3 seniors</p>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { w: "100%", bg: "#f1f5f9" },
          { w: "92%", bg: "#f1f5f9" },
          { w: "78%", bg: "#f1f5f9" },
        ].map((r, i) => (
          <div key={i} className="h-3 rounded-full" style={{ background: r.bg, width: r.w }} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-4 gap-2">
        {["a", "b", "c", "d"].map((l, i) => (
          <div
            key={l}
            className="h-12 rounded-xl border-2 grid place-items-center text-sm font-black uppercase"
            style={{
              borderColor: i === 1 ? color : "var(--border)",
              color: i === 1 ? "white" : "var(--muted-foreground)",
              background: i === 1 ? color : "white",
              boxShadow: i === 1 ? `0 3px 0 ${color}` : "0 3px 0 var(--border)",
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function StreakCard({ color }: { color: string }) {
  const days = ["m", "t", "w", "t", "f", "s", "s"];
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            this week
          </p>
          <p className="text-3xl font-display font-black text-foreground">5 day streak</p>
        </div>
        <div
          className="h-14 w-14 rounded-2xl grid place-items-center text-white font-display font-black text-2xl"
          style={{ background: color }}
        >
          5
        </div>
      </div>
      <div className="flex items-end gap-2">
        {days.map((d, i) => {
          const done = i < 5;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className="w-full rounded-lg"
                style={{
                  height: done ? `${24 + i * 8}px` : "12px",
                  background: done ? color : "#e5e7eb",
                }}
              />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{d}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span style={{ color }}>+120 xp today</span>
        <span className="text-muted-foreground">goal 200</span>
      </div>
    </CardShell>
  );
}
