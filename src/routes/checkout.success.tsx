import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { verifyAndFulfillTransaction } from "@/utils/payments.functions";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "Payment successful — AquaQBank" },
      { name: "description", content: "Your AquaQBank purchase is confirmed and access is being activated." },
      { property: "og:title", content: "Payment successful — AquaQBank" },
      { property: "og:description", content: "Your AquaQBank purchase is confirmed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    courseId: typeof search.courseId === "string" ? search.courseId : undefined,
    packageId: typeof search.packageId === "string" ? search.packageId : undefined,
    ptxn:
      typeof search._ptxn === "string"
        ? (search._ptxn as string)
        : typeof search.transaction_id === "string"
          ? (search.transaction_id as string)
          : undefined,
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { courseId, packageId, ptxn } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fulfillFn = useServerFn(verifyAndFulfillTransaction);
  const [polling, setPolling] = useState(true);
  const [granted, setGranted] = useState(false);
  const [targetCourseId, setTargetCourseId] = useState<string | null>(courseId ?? null);
  const [isLecture, setIsLecture] = useState(false);

  useEffect(() => {
    if (!user || (!courseId && !packageId)) {
      setPolling(false);
      return;
    }
    let cancelled = false;
    let attempts = 0;

    // Fast-path: If transaction ID is in URL (from Paddle redirect), fulfill immediately
    if (ptxn) {
      fulfillFn({ data: { transactionId: ptxn, courseId, packageId } })
        .then((res) => {
          if (!cancelled && res?.granted) {
            setGranted(true);
            setPolling(false);
          }
        })
        .catch((err) => {
          console.warn("[checkout.success] direct fulfillment attempt:", err);
        });
    }

    const check = async (): Promise<boolean> => {
      if (courseId) {
        const { data: c } = await supabase
          .from("courses")
          .select("kind")
          .eq("id", courseId)
          .maybeSingle();
        const lectures = (c as any)?.kind === "lectures";
        if (!cancelled) setIsLecture(lectures);
        const table = lectures ? "user_lecture_courses" : "user_courses";
        const { data } = await (supabase.from(table) as any)
          .select("user_id")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .maybeSingle();
        return !!data;
      }
      // Package: check that at least one of its courses is unlocked.
      const { data: links } = await (supabase.from("package_courses") as any)
        .select("course_id")
        .eq("package_id", packageId);
      const ids = ((links ?? []) as any[]).map((l) => l.course_id as string);
      if (ids.length === 0) return false;
      const { data: owned } = await (supabase.from("user_courses") as any)
        .select("course_id")
        .eq("user_id", user.id)
        .in("course_id", ids);
      const list = (owned ?? []) as any[];
      if (list.length > 0 && !cancelled) setTargetCourseId(list[0].course_id);
      return list.length > 0;
    };

    const tick = async () => {
      if (cancelled) return;
      attempts++;
      const ok = await check();
      if (cancelled) return;
      if (ok) {
        setGranted(true);
        setPolling(false);
        return;
      }

      // If still not granted after attempt 3 and ptxn is available, re-attempt fulfillment
      if (attempts === 3 && ptxn) {
        try {
          const res = await fulfillFn({ data: { transactionId: ptxn, courseId, packageId } });
          if (!cancelled && res?.granted) {
            setGranted(true);
            setPolling(false);
            return;
          }
        } catch (e) {
          console.warn("[checkout.success] retry fulfillment:", e);
        }
      }

      if (attempts < 15) setTimeout(tick, 1500);
      else setPolling(false);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [courseId, packageId, user, ptxn, fulfillFn]);

  return (
    <div className="min-h-screen bg-[#06080F] text-white relative overflow-hidden">
      {/* Subtle Ambient Cosmic Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-cyan-500/15 via-emerald-500/10 to-transparent blur-3xl opacity-60 rounded-full"
      />

      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-md px-6 pt-24 pb-24 text-center">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 grid place-items-center shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-white">Payment Received!</h1>
        <p className="mt-2 text-sm text-slate-200 font-medium">
          Thank you for your purchase. An official receipt has been sent to your email.
        </p>

        <div className="mt-8 rounded-2xl border border-white/15 bg-[#0C1222]/90 backdrop-blur-xl p-6 text-left shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          {polling && !granted ? (
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              <span className="font-medium">Activating full course & question bank access…</span>
            </div>
          ) : granted ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Your full access is unlocked & ready!</span>
              </div>
              {targetCourseId ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: isLecture ? "/lectures/$courseId" : "/courses/$courseId",
                      params: { courseId: targetCourseId },
                    })
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 font-black py-3.5 text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:scale-[1.01] transition-all cursor-pointer"
                >
                  Start Learning Now <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  to="/my/courses"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 font-black py-3.5 text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:scale-[1.01] transition-all"
                >
                  Open My Courses <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-300">
              <p>
                Your payment went through. Access is activating — please refresh this page in a moment or visit your dashboard.
              </p>
              <Link
                to="/my/courses"
                className="inline-flex items-center gap-2 text-cyan-300 font-bold hover:text-white transition-colors"
              >
                Go to My Courses <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
