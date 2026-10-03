import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getChallengeStatusServerFn } from "@/lib/challenge.functions";
import type { ChallengeStatus } from "@/lib/challenge";

/** A small card on the course page that points students to their challenge (or its results). */
export function ChallengeBanner({ courseId }: { courseId: string }) {
  const { user, isAdmin, loading } = useAuth();
  const statusFn = useServerFn(getChallengeStatusServerFn);
  const [status, setStatus] = useState<ChallengeStatus | null>(null);

  useEffect(() => {
    if (loading || !user || isAdmin) return;
    let cancelled = false;
    statusFn({ data: { courseId } })
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null));
    return () => {
      cancelled = true;
    };
  }, [loading, user, isAdmin, courseId, statusFn]);

  if (!status || !["none", "active", "finished"].includes(status.state)) return null;

  const text =
    status.state === "finished"
      ? { en: "See your challenge results and the leaderboard", ar: "شاهد نتيجتك ولوحة الترتيب", cta: "Results · النتائج" }
      : status.state === "active"
        ? { en: "Your challenge is in progress — the timer is running", ar: "تحدّيك جارٍ — العدّاد يعمل", cta: "Resume · متابعة" }
        : { en: "A challenge is open for this course (one attempt)", ar: "يوجد تحدٍّ مفتوح لهذا الكورس (محاولة واحدة)", cta: "Open · افتح" };

  const link =
    status.state === "none" ? (
      <Link to="/courses/$courseId/run" params={{ courseId }} search={{ mode: "study" } as any} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600">
        {text.cta}
      </Link>
    ) : (
      <Link to="/courses/$courseId/challenge" params={{ courseId }} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600">
        {text.cta}
      </Link>
    );

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
        <Trophy size={20} />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold">{text.en}</div>
        <div dir="rtl" className="text-muted-foreground">{text.ar}</div>
      </div>
      {link}
    </div>
  );
}
