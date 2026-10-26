import type { ReactNode } from "react";
import { QuestionDemo } from "@/components/home/QuestionDemo";
import { Layers, Check } from "lucide-react";

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
 * no characters, no animations. Navy, gold and white only.
 */
export function DuoFeatureRow({ eyebrow, title, body, variant, reverse = false }: Props) {
  return (
    <section className="py-20 md:py-28">
      <div
        className={`mx-auto max-w-6xl px-4 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center ${
          reverse ? "lg:[direction:rtl]" : ""
        }`}
      >
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          <Visual variant={variant} />
        </div>
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          {eyebrow && (
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--gold-ink)]">
              <span className="h-px w-8 bg-[color:var(--gold)]" />
              {eyebrow}
            </p>
          )}
          <h2
            className="font-display font-extrabold leading-[1.1] tracking-tight text-foreground first-letter:uppercase"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            {title}
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground first-letter:uppercase md:text-lg">{body}</p>
        </div>
      </div>
    </section>
  );
}

function Visual({ variant }: { variant: Variant }) {
  if (variant === "subjects") return <QuestionDemo />;
  if (variant === "notebook") return <NotebookCard />;
  return <StreakCard />;
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl"
        style={{ background: "color-mix(in oklab, var(--gold) 28%, white)" }}
      />
      <div className="relative rounded-3xl border border-border bg-[color:var(--cream)] p-6 shadow-[0_30px_60px_-32px_rgba(15,27,61,0.45)] md:p-8">
        {children}
      </div>
    </div>
  );
}

/** How a question reaches students: a short review trail instead of placeholder bars. */
const REVIEW_STEPS = [
  { title: "Written by a senior", note: "From the real midterm and final material" },
  { title: "Reviewed by 3 seniors", note: "Answer, wording and explanation checked" },
  { title: "Explained step by step", note: "Why the right answer is right, and why the others are not" },
  { title: "Published to students", note: "Cardiology · Mock 04" },
];

function NotebookCard() {
  return (
    <CardShell>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="on-dark-panel grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "var(--navy)", color: "var(--gold)" }}
          >
            <Layers size={20} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Cardiology · Mock 04</p>
            <p className="text-xs text-muted-foreground">Question review trail</p>
          </div>
        </div>
        <span className="rounded-full bg-[color:var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-primary">
          Verified
        </span>
      </div>

      <ol className="relative">
        <span
          aria-hidden="true"
          className="absolute bottom-3 left-[13px] top-3 w-px"
          style={{ background: "linear-gradient(to bottom, var(--primary), var(--gold))" }}
        />
        {REVIEW_STEPS.map((s, i) => {
          const last = i === REVIEW_STEPS.length - 1;
          return (
            <li key={s.title} className="group/step relative flex gap-4 py-2.5">
              <span
                className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-[color:var(--cream)] transition-transform duration-300 group-hover/step:scale-110"
                style={{
                  background: last ? "var(--gold)" : "var(--navy)",
                  color: last ? "var(--gold-foreground)" : "var(--on-navy)",
                }}
              >
                <Check size={14} strokeWidth={3} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold leading-tight text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </CardShell>
  );
}
function StreakCard() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <CardShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This week</p>
          <p className="font-display text-3xl font-extrabold text-foreground">5 day streak</p>
        </div>
        <div
          className="on-dark-panel grid h-14 w-14 place-items-center rounded-2xl font-display text-2xl font-extrabold"
          style={{ background: "var(--navy)", color: "var(--gold)" }}
        >
          5
        </div>
      </div>
      <div className="flex items-end gap-2">
        {days.map((d, i) => {
          const done = i < 5;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full rounded-lg"
                style={{ height: done ? `${24 + i * 8}px` : "12px", background: done ? "var(--primary)" : "var(--muted)" }}
              />
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{d}</span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
