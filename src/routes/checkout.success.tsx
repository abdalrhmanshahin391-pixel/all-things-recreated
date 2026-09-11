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
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-md px-6 pt-28 pb-24 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 border border-accent/30 grid place-items-center">
          <CheckCircle2 className="w-8 h-8 text-accent" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Payment received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks for your purchase — a receipt is on its way to your email.
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6 text-left shadow-[var(--shadow-card)]">
          {polling && !granted ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              Activating your access…
            </div>
          ) : granted ? (
            <div className="space-y-3">
              <div className="text-sm font-medium">Your access is ready.</div>
              {targetCourseId ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: isLecture ? "/lectures/$courseId" : "/courses/$courseId",
                      params: { courseId: targetCourseId },
                    })
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90"
                >
                  Go to my course <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  to="/my/courses"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90"
                >
                  Open my courses <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Your payment went through. Access can take a few seconds to appear — refresh this
                page in a moment, or check My Courses.
              </p>
              <Link
                to="/my/courses"
                className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
              >
                My courses <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
