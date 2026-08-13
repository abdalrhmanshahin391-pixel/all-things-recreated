import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

const BARS = [
  { h: 32, from: "color-mix(in oklab, var(--primary) 25%, var(--background))" },
  { h: 52, from: "color-mix(in oklab, var(--primary) 45%, var(--background))" },
  { h: 72, from: "color-mix(in oklab, var(--primary) 70%, var(--background))" },
  { h: 96, from: "var(--primary)" },
];

const LINES = [
  "Explanations on every answer, not just a score",
  "Progress saved per subject so you always know what is left",
  "Lecture notes and past papers beside the questions",
];

/** "Every question counts" — bar chart illustration + checklist, theme-driven. */
export function QuestionCountsSection() {
  return (
    <section className="bg-background py-14 md:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-8 lg:grid-cols-2 lg:gap-20">
        <div className="order-2 flex items-end justify-center gap-4 lg:order-1" aria-hidden="true">
          {BARS.map((b, i) => (
            <div
              key={i}
              className="w-14 rounded-t-xl md:w-24"
              style={{
                height: `${b.h * 2.2}px`,
                background: `linear-gradient(180deg, ${b.from}, color-mix(in oklab, ${b.from} 45%, var(--background)))`,
              }}
            />
          ))}
        </div>

        <div className="order-1 lg:order-2">
          <p className="font-display text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Real results
          </p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
            Every question counts.
          </h2>
          <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">
            Each question you answer builds on the last — closing gaps, sharpening recall and
            turning revision into steady, measurable progress before the exam.
          </p>
          <ul className="mt-6 space-y-3">
            {LINES.map((line) => (
              <li key={line} className="flex items-start gap-3 text-foreground">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[color:var(--primary-foreground)]"
                  style={{ background: "var(--primary)" }}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="text-sm md:text-base">{line}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/courses"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-display text-base font-black text-[color:var(--primary-foreground)]"
            style={{ background: "var(--primary)" }}
          >
            Start practising
          </Link>
        </div>
      </div>
    </section>
  );
}
