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
  Zap,
  Lock,
  CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { initializePaddle } from "@/lib/paddle";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { validateCoupon, applyCoupon } from "@/lib/coupons.functions";
import { ensureFreeEnrollment, hasCourseAccess, isFreeCourse } from "@/lib/course-access";
import {
  createCheckoutTransaction,
  verifyAndFulfillTransaction,
} from "@/utils/payments.functions";
import { toast } from "sonner";

function CheckoutErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#06080F] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-md px-6 pt-36 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 grid place-items-center mb-4">
          <AlertCircle className="w-6 h-6 text-rose-400" />
        </div>
        <h1 className="text-2xl font-black text-white">Unable to Load Checkout</h1>
        <p className="mt-2 text-sm text-slate-300">
          {error?.message || "Something went wrong while initializing secure checkout."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-bold text-sm shadow-md hover:scale-[1.02] transition-transform cursor-pointer"
          >
            Try Again
          </button>
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-cyan-300 hover:text-white font-bold text-sm border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Courses
          </Link>
        </div>
      </div>
    </div>
  );
}

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
  errorComponent: CheckoutErrorFallback,
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
  const checkoutEnv = "live";
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
  const createTxnFn = useServerFn(createCheckoutTransaction);
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
        // A free coupon was already redeemed (once) inside handleApplyCoupon.
        if ((validated.price_after ?? total) <= 0) {
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

      // 3. Paid checkout — pre-create verified transaction with Paddle API on server side
      const checkoutRes = await createTxnFn({
        data: {
          courseId: course.id,
          finalPrice: currentTotal,
          originalPrice: course.price,
          couponCode: activeCode,
          currency,
          environment: checkoutEnv,
          returnUrl: `${window.location.origin}/checkout/success?courseId=${course.id}`,
          customerEmail: user.email || undefined,
          customerName:
            (profile as any)?.full_name ||
            (profile as any)?.username ||
            (user.user_metadata as any)?.full_name ||
            undefined,
        },
      });

      if (!checkoutRes?.transactionId) {
        throw new Error("Could not initialize payment transaction with Paddle. Please try again.");
      }

      // Initialize Paddle with eventCallback for immediate full course unlocking
      await initializePaddle(checkoutEnv, async (eventData: any) => {
        if (eventData?.name === "checkout.completed") {
          const completedTxnId = eventData?.data?.transaction_id || checkoutRes.transactionId;
          toast.success("Payment confirmed — unlocking course!");
          try {
            await fulfillFn({
              data: {
                transactionId: completedTxnId,
                courseId: course.id,
                environment: checkoutEnv,
              },
            });
          } catch (err) {
            console.warn("Fast fulfill on checkout.completed:", err);
          }
          const targetPath = course.kind === "lectures" ? "/lectures/$courseId" : "/courses/$courseId";
          navigate({ to: targetPath, params: { courseId: course.id }, replace: true });
        }
      });

      window.Paddle.Checkout.open({
        transactionId: checkoutRes.transactionId,
        settings: {
          displayMode: "overlay",
          theme: "dark",
          allowedPaymentMethods: ["card", "paypal", "saved_payment_methods"],
          successUrl: `${window.location.origin}/checkout/success?courseId=${course.id}`,
          allowLogout: false,
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
      <div className="min-h-screen bg-[#06080F] text-white">
        <SiteHeader />
        <div className="flex flex-col items-center justify-center py-40 text-slate-300 text-sm">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mb-3" />
          <span className="font-medium tracking-wide">Preparing secure checkout…</span>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#06080F] text-white">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 pt-36 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 grid place-items-center mb-4">
            <AlertCircle className="w-6 h-6 text-rose-400" />
          </div>
          <h1 className="text-2xl font-black text-white">Course Not Found</h1>
          <p className="mt-2 text-sm text-slate-300">The requested course could not be located.</p>
          <Link
            to="/courses"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-cyan-300 hover:text-white font-bold text-sm border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080F] text-white relative overflow-hidden">
      {/* Subtle Ambient Cosmic Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[380px] bg-gradient-to-b from-cyan-500/15 via-emerald-500/10 to-transparent blur-3xl opacity-60 rounded-full"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-40 w-[400px] h-[400px] bg-cyan-600/10 blur-3xl rounded-full"
      />

      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-xl px-6 pt-16 pb-28">
        <Link
          to="/courses/$courseId"
          params={{ courseId: course.id }}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-cyan-300 transition-colors py-1.5 px-3 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/30"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to course
        </Link>

        <div className="mt-6">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Course Checkout
          </h1>
          <p className="mt-1.5 text-sm text-slate-200 font-medium">
            One-time payment for complete lifetime course & QBank access.
          </p>
        </div>

        {/* Glassmorphic Order Summary Card */}
        <section className="mt-8 rounded-2xl border border-white/15 bg-[#0C1222]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden">
          {/* Course Preview */}
          <div className="flex items-center gap-4 p-6 border-b border-white/10 bg-white/[0.02]">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`${course.title} cover`}
                className="w-20 h-20 rounded-xl object-cover border border-white/15 shadow-md shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-cyan-950/40 border border-cyan-500/20 shrink-0 grid place-items-center">
                <BookOpen className="w-8 h-8 text-cyan-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Year {course.year}
              </div>
              <h2 className="mt-1.5 text-xl font-extrabold text-white capitalize truncate tracking-tight">
                {course.title}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Full QBank, Exam Archive & Analytics
              </p>
            </div>
            <div className="text-2xl font-black text-emerald-400 shrink-0 tracking-tight">
              {fmt(price)}
            </div>
          </div>

          {/* Coupon / Referral Input */}
          <div className="p-6 border-b border-white/10 bg-black/20">
            <label
              htmlFor="coupon"
              className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5"
            >
              <Ticket className="w-4 h-4 text-cyan-400" /> Coupon or Referral Code
            </label>
            <div className="mt-2.5 flex gap-2">
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
                placeholder="Enter discount code"
                disabled={!!applied}
                className="flex-1 rounded-xl border border-white/20 bg-black/40 px-4 py-2.5 font-mono text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleApplyCoupon()}
                disabled={couponBusy || !couponInput.trim() || !!applied}
                className="inline-flex items-center gap-1.5 px-5 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300 hover:text-white hover:border-cyan-400 font-bold text-sm shadow-sm hover:shadow-cyan-500/20 transition-all disabled:opacity-40 disabled:hover:text-cyan-300 disabled:hover:border-cyan-500/30 cursor-pointer"
              >
                {couponBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Apply
              </button>
            </div>
            {couponError && (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{couponError}</span>
              </div>
            )}
            {applied && (
              <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-300">
                <Check className="w-3.5 h-3.5" /> Coupon <strong className="font-mono text-white">{applied.code}</strong> applied
                <button
                  type="button"
                  onClick={() => setApplied(null)}
                  aria-label="Remove coupon"
                  className="grid place-items-center h-4 w-4 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Pricing Calculation Summary */}
          <div className="p-6 space-y-3 border-b border-white/10 bg-white/[0.01] text-sm">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-medium">Original Course Price</span>
              <span className="font-semibold text-white">{fmt(price)}</span>
            </div>
            {applied && (
              <div className="flex items-center justify-between text-emerald-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <Ticket className="w-4 h-4" /> Discount ({applied.code})
                </span>
                <span className="font-bold">−{fmt(applied.priceBefore - applied.priceAfter)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Sales Tax / VAT</span>
              <span className="text-slate-300">Calculated automatically</span>
            </div>
            <div className="pt-4 mt-2 border-t border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-300 block">
                  Total Due
                </span>
                <span className="text-[11px] text-cyan-300 font-medium">
                  Instant activation upon completion
                </span>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-white tracking-tight">
                  {fmt(total)}
                </span>{" "}
                <span className="text-xs font-bold text-slate-300 uppercase">{currency}</span>
              </div>
            </div>
          </div>

          {/* CTA & Secure Payment Actions */}
          <div className="p-6 bg-black/30">
            {owned ? (
              <Link
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black py-4 text-base shadow-lg shadow-emerald-500/20 hover:scale-[1.01] transition-all"
              >
                You already own this course — Open Course Now
              </Link>
            ) : (
              <button
                type="button"
                onClick={handlePay}
                disabled={opening}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 font-black py-4 text-base shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
              >
                {opening ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />{" "}
                    <span>
                      {total <= 0 ? "Activating Course Access…" : "Opening Secure Paddle Checkout…"}
                    </span>
                  </>
                ) : total <= 0 ? (
                  <>
                    <Zap className="w-5 h-5 fill-current" /> Claim Free Course Access
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Pay {fmt(total)} & Start Studying
                  </>
                )}
              </button>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200 font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Trust Badges: Cards & PayPal Only */}
            <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-200">
                <CreditCard className="w-4 h-4 text-cyan-400" />
                <span>Accepted: Debit / Credit Card & PayPal</span>
              </div>
              <p className="text-[11px] text-center text-slate-300 flex items-center justify-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                256-bit bank-grade SSL encryption · Handled securely by Paddle
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
