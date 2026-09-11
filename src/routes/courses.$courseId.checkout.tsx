import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldCheck,
  Check,
  ArrowLeft,
  Loader2,
  AlertCircle,
  BookOpen,
  Ticket,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { validateCoupon, applyCoupon } from "@/lib/coupons.functions";
import { ensureFreeEnrollment, hasCourseAccess, isFreeCourse } from "@/lib/course-access";
import {
  syncPaddleCoursePrice,
  resolvePaddleCheckoutPrice,
  verifyAndFulfillTransaction,
} from "@/utils/payments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/courses/$courseId/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — AquaQBank" },
      { name: "description", content: "Complete your AquaQBank course purchase securely." },
      { property: "og:title", content: "Checkout — AquaQBank" },
      { property: "og:description", content: "Complete your AquaQBank course purchase securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CheckoutPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  price: number;
  currency: string | null;
  kind: string | null;
  paddle_price_id: string | null;
  image_url: string | null;
};

const COUPON_ERRORS: Record<string, string> = {
  not_found: "That code doesn't exist.",
  inactive: "This coupon is turned off.",
  not_yet_active: "This coupon isn't active yet.",
  expired: "This coupon has expired.",
  used_up: "This coupon has reached its usage limit.",
  course_excluded: "This coupon isn't valid for this course.",
  already_redeemed: "You've already used this coupon here.",
  sign_in_required: "Please sign in first.",
};

function CheckoutPage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFn = useServerFn(validateCoupon);
  const applyFn = useServerFn(applyCoupon);
  const resolvePriceFn = useServerFn(resolvePaddleCheckoutPrice);
  const fulfillFn = useServerFn(verifyAndFulfillTransaction);
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{
    code: string;
    priceBefore: number;
    priceAfter: number;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: qErr } = await supabase
        .from("courses")
        .select("id,title,year,price,currency,kind,paddle_price_id,image_url")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      const c = data as Course | null;
      setCourse(c);
      if (c?.image_url) resolveCourseImageUrl(c.image_url).then((u) => !cancelled && setCoverUrl(u));

      const goToCourse = () =>
        navigate({
          to: c?.kind === "lectures" ? "/lectures/$courseId" : "/courses/$courseId",
          params: { courseId: c!.id },
          replace: true,
        });

      // Free course — never show a payment page.
      if (c && isFreeCourse(c.price)) {
        if (user) await ensureFreeEnrollment(user.id, c.id, c.kind);
        if (!cancelled) goToCourse();
        return;
      }

      if (c && user) {
        const has = await hasCourseAccess(user.id, c.id, c.kind);
        if (!cancelled && has) {
          setOwned(true);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user, navigate]);

  const price = course?.price ?? 0;
  const currency = (course?.currency ?? "usd").toUpperCase();
  const total = applied ? applied.priceAfter : price;
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  async function handleApplyCoupon(overrideCode?: string) {
    const codeToTest = (overrideCode ?? couponInput).trim().toUpperCase();
    if (!course || !codeToTest) return null;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await validateFn({ data: { code: codeToTest, courseId: course.id } });
      if (!res.valid) {
        setCouponError(COUPON_ERRORS[res.reason ?? ""] ?? "Coupon not valid.");
        return null;
      }
      if ((res.price_after ?? 0) <= 0) {
        const applyRes = await applyFn({ data: { code: codeToTest, courseId: course.id } });
        if (applyRes.valid) {
          if (user) await ensureFreeEnrollment(user.id, course.id, course.kind);
          toast.success("Coupon applied — the course is yours!");
          const targetPath = course.kind === "lectures" ? "/lectures/$courseId" : "/courses/$courseId";
          navigate({ to: targetPath, params: { courseId: course.id }, replace: true });
          return res;
        }
      }
      setApplied({
        code: res.code ?? codeToTest,
        priceBefore: res.price_before ?? price,
        priceAfter: res.price_after ?? price,
      });
      toast.success(`Coupon ${res.code} applied`);
      return res;
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "Failed to apply coupon");
      return null;
    } finally {
      setCouponBusy(false);
    }
  }

  async function handlePay() {
    if (!course || !user) return;
    setOpening(true);
    setError(null);
    try {
      // 1. Auto-apply coupon if user typed a code but didn't press "Apply" yet
      let currentTotal = total;
      let activeCode = applied?.code;
      if (!applied && couponInput.trim()) {
        const validated = await handleApplyCoupon(couponInput);
        if (!validated) {
          setOpening(false);
          return;
        }
        currentTotal = validated.price_after ?? total;
        activeCode = validated.code;
      }

      // 2. 100% discount / free claim — zero payment required
      if (currentTotal <= 0) {
        if (activeCode) {
          await applyFn({ data: { code: activeCode, courseId: course.id } });
        }
        await ensureFreeEnrollment(user.id, course.id, course.kind);
        toast.success("Access activated — enjoy your course!");
        const targetPath = course.kind === "lectures" ? "/lectures/$courseId" : "/courses/$courseId";
        navigate({ to: targetPath, params: { courseId: course.id }, replace: true });
        return;
      }

      // 3. Paid checkout — resolve exact price ID in Paddle
      let targetPriceId: string | null = null;
      try {
        const priceRes = await resolvePriceFn({
          data: {
            courseId: course.id,
            title: course.title,
            finalPrice: currentTotal,
            originalPrice: course.price,
            couponCode: activeCode,
            currency,
          },
        });
        targetPriceId = priceRes?.paddlePriceId || null;
      } catch (priceErr: any) {
        console.warn("[checkout] resolvePaddleCheckoutPrice failed, fallback to course price:", priceErr);
      }

      if (!targetPriceId || !targetPriceId.startsWith("pri_")) {
        targetPriceId =
          course.paddle_price_id && course.paddle_price_id.startsWith("pri_")
            ? course.paddle_price_id
            : null;
      }

      if (!targetPriceId && Number(course.price) > 0) {
        try {
          const syncRes = await syncPaddleCoursePrice({
            data: {
              courseId: course.id,
              title: course.title,
              price: Number(course.price),
              currency: course.currency || "USD",
            },
          });
          targetPriceId = syncRes.paddlePriceId;
        } catch (syncErr: any) {
          console.warn("[checkout] auto sync Paddle price failed:", syncErr);
        }
      }

      if (!targetPriceId) {
        setError(
          "This course isn't ready for purchase yet — its payment price hasn't been set. Please contact support.",
        );
        setOpening(false);
        return;
      }

      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(targetPriceId);
      const savedCustomerId = (user.user_metadata as any)?.paddle_customer_id || undefined;

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: {
          email: user.email ?? undefined,
          name:
            profile?.full_name ||
            (user.user_metadata?.full_name as string) ||
            (user.user_metadata?.name as string) ||
            undefined,
          ...(savedCustomerId ? { id: savedCustomerId } : {}),
        },
        customData: {
          userId: user.id,
          courseId: course.id,
          ...(activeCode ? { couponCode: activeCode } : {}),
        },
        settings: {
          displayMode: "overlay",
          theme: "light",
          successUrl: `${window.location.origin}/checkout/success?courseId=${course.id}`,
          allowLogout: false,
          variant: "express",
          showAddDiscounts: false,
        },
      });
    } catch (e: any) {
      console.error("[checkout] failed to open Paddle:", e);
      setError(e?.message ?? "Could not open checkout. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading checkout…
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader variant="light" />
        <div className="mx-auto max-w-md px-6 pt-32 text-center">
          <h1 className="text-2xl font-semibold">Course not found</h1>
          <Link to="/courses" className="mt-4 inline-block text-primary hover:underline text-sm">
            ← Back to courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />

      <main className="mx-auto max-w-xl px-6 pt-24 pb-24">
        <Link
          to="/courses/$courseId"
          params={{ courseId: course.id }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" /> Back to course
        </Link>

        <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time payment. Access is granted the moment your payment clears.
        </p>

        <section className="mt-8 rounded-lg border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Item */}
          <div className="flex items-center gap-4 p-6 border-b border-border">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`${course.title} cover`}
                className="w-16 h-16 rounded-md object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-md bg-muted border border-border shrink-0 grid place-items-center">
                <BookOpen className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Year {course.year}
              </div>
              <h2 className="mt-0.5 text-lg font-semibold capitalize truncate">{course.title}</h2>
            </div>
            <div className="text-lg font-semibold shrink-0">{fmt(price)}</div>
          </div>

          {/* Coupon */}
          <div className="p-6 border-b border-border">
            <label
              htmlFor="coupon"
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Coupon code
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="coupon"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value.toUpperCase());
                  setCouponError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyCoupon();
                }}
                placeholder="Optional"
                disabled={!!applied}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={couponBusy || !couponInput.trim() || !!applied}
                className="inline-flex items-center gap-1.5 px-4 rounded-md border border-border bg-muted text-sm font-semibold hover:bg-accent/10 disabled:opacity-50"
              >
                {couponBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Ticket className="w-3.5 h-3.5" />
                )}
                Apply
              </button>
            </div>
            {couponError && <p className="mt-2 text-xs text-destructive">{couponError}</p>}
            {applied && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-accent">
                <Check className="w-3.5 h-3.5" /> {applied.code} applied
                <button
                  type="button"
                  onClick={() => setApplied(null)}
                  aria-label="Remove coupon"
                  className="grid place-items-center h-4 w-4 rounded-full hover:bg-accent/15"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="p-6 space-y-2 border-b border-border text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(price)}</span>
            </div>
            {applied && (
              <div className="flex items-center justify-between text-accent">
                <span>Discount</span>
                <span>−{fmt(applied.priceBefore - applied.priceAfter)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>Tax</span>
              <span>Calculated at payment</span>
            </div>
            <div className="pt-3 mt-1 border-t border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Total
              </span>
              <span className="text-2xl font-semibold">
                {fmt(total)} <span className="text-xs text-muted-foreground">{currency}</span>
              </span>
            </div>
          </div>

          {/* Pay */}
          <div className="p-6">
            {owned ? (
              <Link
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold py-3.5 text-sm"
              >
                You already own this course — open it
              </Link>
            ) : (
              <button
                type="button"
                onClick={handlePay}
                disabled={opening}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold py-3.5 text-sm hover:opacity-90 disabled:opacity-60"
              >
                {opening ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />{" "}
                    {total <= 0 ? "Activating access…" : "Opening secure checkout…"}
                  </>
                ) : total <= 0 ? (
                  <>Claim free access</>
                ) : (
                  <>Pay {fmt(total)}</>
                )}
              </button>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5" /> Secure payment handled by Paddle · card, Apple
              Pay and Google Pay
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
