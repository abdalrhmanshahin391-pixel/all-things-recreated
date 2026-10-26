import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenCheck, FileText, Archive } from "lucide-react";
import anatomyImg from "@/assets/academy-anatomy.jpg";
import labImg from "@/assets/academy-lab.jpg";
import studyImg from "@/assets/academy-study.jpg";

const CARDS = [
  { img: studyImg, Icon: BookOpenCheck, title: "Question Bank", note: "Exam-style MCQs with explanations", to: "/courses" as const },
  { img: labImg, Icon: FileText, title: "Lecture Notes", note: "Summaries you can actually revise from", to: "/committee" as const },
  { img: anatomyImg, Icon: Archive, title: "Past Papers", note: "Real papers, organised by year", to: "/committee" as const },
];

/**
 * Navy panel with three illustrated tiles. Colours come from the theme tokens,
 * so the panel follows whichever skin is active.
 */
export function ExamPrepPanel() {
  return (
    <section className="bg-background py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div
          className="on-dark-panel relative grid gap-10 overflow-hidden rounded-3xl p-8 md:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
          style={{
            background: "linear-gradient(150deg, var(--navy-deep) 0%, var(--navy) 100%)",
            boxShadow: "0 30px 70px -36px rgba(15,27,61,0.75)",
          }}
        >
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)] to-transparent" />
          <div>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
              Prepare for your exams with confidence
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-white/75">
              Everything one cohort needs in a single place: practice questions written to match
              your curriculum, lecture material collected by your committee, and past papers you
              can revise from the night before.
            </p>
            <Link to="/courses" className="btn-chunky btn-chunky--gold mt-8">
              Explore courses <ArrowRight size={18} strokeWidth={2.4} />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {CARDS.map((c) => (
              <Link
                key={c.title}
                to={c.to}
                className="group rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-sm transition-all hover:-translate-y-1 hover:bg-white/[0.1]"
              >
                <div className="relative">
                  <img
                    src={c.img}
                    alt={c.title}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="h-32 w-full rounded-xl object-cover saturate-[0.55]"
                  />
                  <span aria-hidden="true" className="absolute inset-0 rounded-xl bg-[color:var(--primary)]/35 mix-blend-multiply" />
                  <span className="absolute -bottom-4 left-3 grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--gold)] text-[color:var(--gold-foreground)] shadow-md">
                    <c.Icon size={18} strokeWidth={2} />
                  </span>
                </div>
                <div className="mt-6 font-display text-base font-bold text-white">{c.title}</div>
                <div className="text-sm text-white/70">{c.note}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
