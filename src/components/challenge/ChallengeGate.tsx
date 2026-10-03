import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChallengeStatusState } from "@/components/challenge/useChallengeStatus";
import { decideGate } from "@/lib/challenge";

/** Subjects left out of this session because they belong to a challenge the student has not finished or ignored. */
const ExcludedSubjectsContext = createContext<string[]>([]);
export const useExcludedSubjects = () => useContext(ExcludedSubjectsContext);

/**
 * Sits in front of the course question runner and decides, from the groups the student picked, what happens:
 *  - normal groups only: solved normally, the challenge is not involved
 *  - the challenge group alone: the challenge page (join / ignore, or resume)
 *  - the challenge group mixed with others: not allowed until the challenge is finished or ignored
 *  - "all questions": everything except the challenge group, with a one-time notice
 * Once the student finished or ignored the challenge, its group is a normal group. If anything goes wrong
 * the normal questions are never blocked.
 */
export function ChallengeGate({ courseId, subjects, children }: { courseId: string; subjects: string; children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { status, loaded } = useChallengeStatusState(courseId);
  const decision = useMemo(() => decideGate(status, subjects), [status, subjects]);
  const excluded = useMemo(() => (decision.kind === "all" ? decision.excluded : []), [decision]);

  const noticeKey = `aqua-challenge-all-notice:${user?.id ?? "guest"}:${courseId}`;
  const [noticeSeen, setNoticeSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (decision.kind !== "all") return;
    try {
      setNoticeSeen(localStorage.getItem(noticeKey) === "1");
    } catch {
      setNoticeSeen(false);
    }
  }, [decision.kind, noticeKey]);

  useEffect(() => {
    if (decision.kind === "challenge") {
      navigate({ to: "/courses/$courseId/challenge", params: { courseId }, replace: true });
    }
  }, [decision.kind, courseId, navigate]);

  const spinner = (
    <div className="min-h-screen grid place-items-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  if (!loaded || decision.kind === "challenge") return spinner;

  const dialog = (body: ReactNode) => (
    <div className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-amber-500/15 to-transparent flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/20 text-amber-600"><Trophy size={20} /></div>
          <h1 className="text-lg font-black">Challenge · تحدي</h1>
        </div>
        <div className="p-6 space-y-4">{body}</div>
      </div>
    </div>
  );

  if (decision.kind === "mixed") {
    return dialog(
      <>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm grid gap-2 md:grid-cols-2">
          <p className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />The challenge group can't be combined with other groups. Take the challenge (or ignore it) first, or pick the other groups without it.</p>
          <p dir="rtl" className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />لا يمكن دمج مجموعة التحدي مع مجموعات أخرى. أكمل التحدي (أو تجاهله) أولاً، أو اختر المجموعات الأخرى بدونها.</p>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <button onClick={() => navigate({ to: "/courses/$courseId", params: { courseId } })} className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            Back to the course · رجوع للكورس
          </button>
          <button onClick={() => navigate({ to: "/courses/$courseId/challenge", params: { courseId } })} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90">
            Go to the challenge · اذهب للتحدي
          </button>
        </div>
      </>,
    );
  }

  if (decision.kind === "all") {
    if (noticeSeen === null) return spinner;
    if (!noticeSeen) {
      return dialog(
        <>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm grid gap-2 md:grid-cols-2">
            <p className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />All the questions will be added except the challenge questions. Complete the challenge first (or ignore it); after that its questions are added like the rest.</p>
            <p dir="rtl" className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />ستُضاف كل الأسئلة ما عدا أسئلة التحدي. أكمل التحدي أولاً (أو تجاهله)، وبعدها تُضاف أسئلته مثل باقي الأسئلة.</p>
          </div>
          <p className="text-xs text-muted-foreground">This message is shown only once. · تظهر هذه الرسالة مرة واحدة فقط.</p>
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={() => {
                try { localStorage.setItem(noticeKey, "1"); } catch { /* the notice may show again; harmless */ }
                setNoticeSeen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
            >
              OK, continue · حسناً، تابع
            </button>
          </div>
        </>,
      );
    }
  }

  return <ExcludedSubjectsContext.Provider value={excluded}>{children}</ExcludedSubjectsContext.Provider>;
}
