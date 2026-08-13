import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import anatomyImg from "@/assets/academy-anatomy.jpg";
import labImg from "@/assets/academy-lab.jpg";
import studyImg from "@/assets/academy-study.jpg";

const CARDS = [
  { img: studyImg, title: "Question Bank", note: "Exam-style MCQs with explanations", to: "/courses" as const },
  { img: labImg, title: "Lecture Notes", note: "Summaries you can actually revise from", to: "/committee" as const },
  { img: anatomyImg, title: "Past Papers", note: "Real papers, organised by year", to: "/committee" as const },
];

/**
 * Deep panel with three illustrated tiles. Colours are derived from the theme
 * tokens so every skin (aqua, heritage, academy) gets its own version.
 */
export function ExamPrepPanel() {
  const panel = "color-mix(in oklab, var(--foreground) 93%, var(--primary))";
  const tile = "color-mix(in oklab, var(--foreground) 80%, var(--primary))";
  const onPanel = "color-mix(in oklab, var(--background) 94%, var(--foreground))";
  const onPanelMuted = "color-mix(in oklab, var(--background) 72%, var(--foreground))";

  return (
    <section className="bg-background py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div
          className="grid gap-10 rounded-3xl p-8 md:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
          style={{ background: panel, boxShadow: "0 24px 60px -30px rgba(0,0,0,0.55)" }}
        >
          <div>
            <h2
              className="font-display text-3xl font-black leading-tight md:text-4xl"
              style={{ color: onPanel }}
            >
              Prepare for your exams with confidence
            </h2>
            <p className="mt-4 max-w-md leading-relaxed" style={{ color: onPanelMuted }}>
              Everything one cohort needs in a single place: practice questions written to match
              your curriculum, lecture material collected by your committee, and past papers you
              can revise from the night before.
            </p>
            <Link
              to="/courses"
              className="mt-8 inline-flex items-center gap-2 font-display text-base font-black underline-offset-4 hover:underline"
              style={{ color: onPanel }}
            >
              Explore courses and question banks <ArrowRight size={18} />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {CARDS.map((c) => (
              <Link
                key={c.title}
                to={c.to}
                className="rounded-2xl p-3 transition-transform hover:-translate-y-1"
                style={{ background: tile }}
              >
                <img
                  src={c.img}
                  alt={c.title}
                  width={800}
                  height={600}
                  loading="lazy"
                  className="h-32 w-full rounded-xl object-cover"
                />
                <div className="mt-3 font-display text-base font-black" style={{ color: onPanel }}>
                  {c.title}
                </div>
                <div className="text-sm" style={{ color: onPanelMuted }}>
                  {c.note}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
