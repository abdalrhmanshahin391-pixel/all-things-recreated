import { Link } from "@tanstack/react-router";
import { Clock, ListChecks, Trophy } from "lucide-react";
import type { ChallengeStatus } from "@/lib/challenge";
import { challengeIsVisible } from "@/components/challenge/useChallengeStatus";

/** Small tag shown next to a question group that is part of the course challenge. */
export function ChallengeTag() {
  return (
    <span
      title="This group is part of the challenge · هذه المجموعة جزء من التحدي"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600"
    >
      <Trophy size={10} /> Challenge · تحدي
    </span>
  );
}

/**
 * The challenge card shown at the top of the course's question groups once the challenge is on.
 * Students get the button that fits where they are (join / resume / results). Admins see a preview of
 * what students see.
 */
export function ChallengeBanner({ courseId, status }: { courseId: string; status: ChallengeStatus | null }) {
  if (!challengeIsVisible(status)) return null;

  const copy = {
    none: { en: "Join the challenge", ar: "شارك في التحدي", cta: "Join · شارك" },
    active: { en: "Your challenge is in progress — the question you left is skipped", ar: "تحدّيك جارٍ — السؤال الذي غادرته يُتخطّى", cta: "Resume · متابعة" },
    finished: { en: "Challenge finished — see your rank", ar: "انتهى التحدي — شاهد ترتيبك", cta: "Results · النتائج" },
    preview: { en: "Challenge is ON — this is what students see", ar: "التحدي مفعّل — هذا ما يراه الطلاب", cta: "Join · شارك" },
  }[status.state as "none" | "active" | "finished" | "preview"];

  const button = "shrink-0 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600";
  const cta =
    status.state === "preview" ? (
      <span className={`${button} opacity-60 cursor-not-allowed`} title="Admins can't play, so the ranking stays fair">{copy.cta}</span>
    ) : status.state === "none" ? (
      <Link to="/courses/$courseId/run" params={{ courseId }} search={{ mode: "study" } as any} className={button}>
        {copy.cta}
      </Link>
    ) : (
      <Link to="/courses/$courseId/challenge" params={{ courseId }} className={button}>
        {copy.cta}
      </Link>
    );

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
          <Trophy size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Challenge · تحدي</div>
          <div className="text-lg font-black leading-tight">{copy.en}</div>
          <div dir="rtl" className="text-sm text-muted-foreground">{copy.ar}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {status.total} questions · سؤال</span>
            <span className="inline-flex items-center gap-1"><Clock size={12} /> {status.secondsPerQuestion}s each · لكل سؤال</span>
            {status.state === "none" && <span>one attempt only · محاولة واحدة فقط</span>}
          </div>
        </div>
        {cta}
      </div>
    </div>
  );
}
