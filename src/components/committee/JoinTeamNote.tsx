import { Link } from "@tanstack/react-router";
import { ArrowRight, HeartHandshake } from "lucide-react";

/**
 * Recruitment panel shown on the Staff Team page, under the intro line.
 * Kept in normal flow (never absolutely positioned) so it can't overlap
 * the heading, and built from theme tokens so it stays readable on the
 * red committee theme and in dark mode.
 */
export function JoinTeamNote() {
  return (
    <section
      dir="ltr"
      className="mx-auto mt-10 w-full max-w-3xl rounded-2xl border border-primary/40 bg-primary/5 px-5 py-6 text-center sm:px-8"
    >
      <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
        <HeartHandshake size={14} /> Open to students everywhere
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Our staff team is not only for Jordanian students. If you have resources to
        share and you carry honesty and a real wish to help other students, you are
        welcome to join, wherever you study.
      </p>
      <Link
        to="/support"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90"
      >
        Contact us <ArrowRight size={15} />
      </Link>
    </section>
  );
}