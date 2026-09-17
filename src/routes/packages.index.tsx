import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Users,
  User,
  Check,
  Loader2,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  X,
  Heart,
  Stethoscope,
  Pill,
  Activity,
  Flame,
  Clock,
  Gem,
  Tag,
  Percent,
  BookOpen,
  Video,
  Info,
  Package as PackageIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import {
  listPublishedPackages,
  openPackageCheckoutData,
  type PackageWithCourses,
} from "@/lib/packages.functions";
import { GroupMemberPicker, type GroupMember } from "@/components/packages/GroupMemberPicker";
import { StudentChoicePickerModal } from "@/components/packages/StudentChoicePickerModal";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/packages/")({
  head: () => ({
    meta: [
      { title: "Subscription Packages — AquaQBank" },
      {
        name: "description",
        content:
          "Bundle multiple question bank courses and lectures into one discounted subscription. Individual and group packages available.",
      },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const load = useServerFn(listPublishedPackages);
  const validate = useServerFn(openPackageCheckoutData);

  const [packages, setPackages] = useState<PackageWithCourses[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [groupPick, setGroupPick] = useState<{
    pkg: PackageWithCourses;
    members: GroupMember[];
  } | null>(null);
  const [choicePickPkg, setChoicePickPkg] = useState<PackageWithCourses | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await load();
        setPackages(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load packages");
      }
    })();
  }, [load]);

  async function startCheckout(
    pkg: PackageWithCourses,
    memberIds: string[],
    selectedCourseIds: string[] = [],
  ) {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    setOpening(pkg.id);
    setError(null);
    try {
      const { paddlePriceId, customData } = await validate({
        data: {
          packageId: pkg.id,
          memberIds,
          selectedCourseIds: selectedCourseIds.length > 0 ? selectedCourseIds : undefined,
        },
      });
      await initializePaddle();
      const resolvedPriceId = await getPaddlePriceId(paddlePriceId);
      window.Paddle.Checkout.open({
        items: [{ priceId: resolvedPriceId, quantity: 1 }],
        customer: {
          email: user.email ?? undefined,
          name:
            profile?.full_name ||
            (user.user_metadata?.full_name as string) ||
            (user.user_metadata?.name as string) ||
            undefined,
          ...((user.user_metadata as any)?.paddle_customer_id
            ? { id: (user.user_metadata as any).paddle_customer_id }
            : {}),
        },
        customData: { userId: user.id, ...customData },
        settings: {
          displayMode: "overlay",
          theme: "light",
          successUrl: `${window.location.origin}/checkout/success?packageId=${pkg.id}`,
          allowLogout: false,
          variant: "express",
          showAddDiscounts: false,
        },
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to open checkout");
    } finally {
      setOpening(null);
      setGroupPick(null);
      setChoicePickPkg(null);
    }
  }

  function onSubscribe(pkg: PackageWithCourses) {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (pkg.package_type === "group") {
      setGroupPick({ pkg, members: [] });
    } else if (pkg.selection_mode === "student_choice") {
      setChoicePickPkg(pkg);
    } else {
      startCheckout(pkg, [], []);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
        <main className="pt-24 pb-24">
          {/* Hero Section */}
          <section className="relative overflow-hidden border-b border-border">
            <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-16 md:py-20">
              <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Sparkles className="w-3 h-3 text-amber-500" /> Subscription Bundles & Packages
              </span>
              <h1 className="mt-5 text-4xl md:text-6xl font-semibold tracking-tight text-foreground max-w-3xl">
                Comprehensive Packages & Massive Savings
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl">
                Bundle courses and lectures together to get the best value, unlock complete year curriculums, or build your own custom bundle.
              </p>
            </div>
          </section>

          <div className="mx-auto max-w-7xl px-6 md:px-10 mt-12">
            {error && (
              <div className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900/60 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}

            {/* Loading */}
            {packages === null && (
              <div className="text-center py-20 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2 text-primary" /> Loading packages...
              </div>
            )}

            {/* COMING SOON EMPTY STATE */}
            {packages && packages.length === 0 && (
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card/80 backdrop-blur-sm p-10 md:p-16 text-center max-w-3xl mx-auto shadow-lg">
                <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 grid place-items-center mx-auto mb-6">
                  <PackageIcon className="w-8 h-8" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest mb-3">
                  <Sparkles className="w-3.5 h-3.5" /> Coming Soon · قريباً
                </span>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Exclusive Packages & Bundles Coming Soon
                </h2>
                <h3 className="text-lg md:text-xl font-serif text-muted-foreground mt-1">
                  باقات دراسية شاملة قادمة قريباً
                </h3>
                <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
                  We are preparing special discounted packages and custom study passes for question banks and lecture courses. Check back soon for exceptional multi-course savings!
                </p>

                <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
                  <Link
                    to="/courses"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3 text-xs shadow hover:bg-primary/90 transition-all"
                  >
                    <BookOpen className="w-4 h-4" /> Browse Courses · استعراض الدورات
                  </Link>
                  <Link
                    to="/lectures"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold px-5 py-3 text-xs transition-all"
                  >
                    <Video className="w-4 h-4" /> Browse Lectures · استعراض المحاضرات
                  </Link>
                </div>
              </div>
            )}

            {/* PACKAGES GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packages?.map((pkg) => {
                const totalQ = pkg.courses.reduce(
                  (a, c) => a + c.questions_count_mid + c.questions_count_final,
                  0,
                );
                const isGroup = pkg.package_type === "group";
                const isChoice = pkg.selection_mode === "student_choice";
                const hasDiscount =
                  pkg.original_price && Number(pkg.original_price) > Number(pkg.price);
                const discountPct = hasDiscount
                  ? Math.round(
                      ((Number(pkg.original_price) - Number(pkg.price)) /
                        Number(pkg.original_price)) *
                        100,
                    )
                  : 0;

                return (
                  <article
                    key={pkg.id}
                    className="relative medical-card overflow-hidden flex flex-col rounded-3xl border border-border hover:border-primary/50 transition-all shadow-sm hover:shadow-md bg-card"
                  >
                    {/* Cover image if available */}
                    {pkg.image_url ? (
                      <div className="relative h-44 w-full overflow-hidden bg-muted/60 border-b border-border">
                        <img
                          src={pkg.image_url}
                          alt={pkg.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                      </div>
                    ) : null}

                    {/* Promotional Badge (Hot Offer, Limited Time, etc.) */}
                    {pkg.badge_text && (
                      <div className="absolute top-4 right-4 z-10">
                        <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/20">
                          <Flame className="w-3.5 h-3.5" />
                          {pkg.badge_text}
                        </span>
                      </div>
                    )}

                    <div className="p-6 md:p-7 border-b border-border flex-1">
                      {/* Sub-badge / Category */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest rounded-full px-2.5 py-1 bg-muted text-muted-foreground border border-border">
                          {isGroup ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {isGroup ? `${pkg.group_size} Group Seats` : "Individual Access"}
                        </span>
                        {isChoice && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            Pick Any {pkg.choice_count || 3}
                          </span>
                        )}
                      </div>

                      {/* Package Name */}
                      <h2 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
                        {pkg.name}
                      </h2>

                      {/* Price & Discounts */}
                      <div className="mt-4 flex items-baseline gap-2.5 flex-wrap">
                        <span className="text-3xl sm:text-4xl font-extrabold text-foreground font-serif">
                          ${Number(pkg.price).toFixed(0)}
                        </span>
                        {hasDiscount && (
                          <span className="text-sm sm:text-base text-muted-foreground line-through font-serif">
                            ${Number(pkg.original_price).toFixed(0)}
                          </span>
                        )}
                        {hasDiscount && (
                          <span className="inline-flex items-center gap-1 text-xs font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                            Save {discountPct}%
                          </span>
                        )}
                        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          {pkg.currency?.toUpperCase() ?? "USD"} · One-time
                        </span>
                      </div>

                      {/* Description */}
                      {pkg.description && (
                        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                          {pkg.description}
                        </p>
                      )}

                      {/* Notes Box */}
                      {pkg.notes && (
                        <div className="mt-3.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span>{pkg.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Courses / Content List */}
                    <div className="p-6 md:p-7 space-y-3 bg-muted/5 border-b border-border">
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        <span>
                          {isChoice
                            ? `Eligible items (${pkg.courses.length})`
                            : `Included items (${pkg.courses.length})`}
                        </span>
                        {totalQ > 0 && <span>{totalQ.toLocaleString()} questions</span>}
                      </div>

                      {isChoice ? (
                        <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 text-xs text-sky-800 dark:text-sky-200">
                          <p className="font-semibold">
                            🎯 You will choose any {pkg.choice_count || 3} courses/lectures from {pkg.courses.length} available subjects upon checkout.
                          </p>
                        </div>
                      ) : (
                        <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {pkg.courses.map((c) => {
                            const qs = c.questions_count_mid + c.questions_count_final;
                            const isLectures = c.kind === "lectures";
                            return (
                              <li
                                key={c.id}
                                className="flex items-start gap-2.5 rounded-xl bg-background border border-border/80 px-3 py-2 text-xs"
                              >
                                <div className="grid place-items-center h-4 w-4 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-foreground truncate">
                                    {c.title}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                    <span>Year {c.year}</span>
                                    {isLectures ? (
                                      <span className="text-purple-600 dark:text-purple-400 font-bold">
                                        • Recorded Lectures
                                      </span>
                                    ) : (
                                      <span>• {qs} Qs</span>
                                    )}
                                  </div>
                                  {c.note && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 italic">
                                      {c.note}
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* CTA Button */}
                    <div className="p-6 md:p-7 pt-5">
                      <button
                        onClick={() => onSubscribe(pkg)}
                        disabled={opening === pkg.id}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold tracking-wide py-3.5 text-sm shadow-md transition-all disabled:opacity-60"
                      >
                        {opening === pkg.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Opening Checkout...
                          </>
                        ) : isGroup ? (
                          <>
                            Join as Group ({pkg.group_size} seats) <ArrowRight className="w-4 h-4" />
                          </>
                        ) : isChoice ? (
                          <>
                            Choose {pkg.choice_count || 3} Courses & Subscribe — ${Number(pkg.price).toFixed(0)} <ArrowRight className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            Subscribe Now — ${Number(pkg.price).toFixed(0)} <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Secure Payment · Powered by Paddle
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </main>
      </MedicalPageBackdrop>

      {/* Student Choice Modal */}
      {choicePickPkg && (
        <StudentChoicePickerModal
          pkg={choicePickPkg}
          loading={opening === choicePickPkg.id}
          onClose={() => setChoicePickPkg(null)}
          onConfirm={(selectedCourseIds) => {
            startCheckout(choicePickPkg, [], selectedCourseIds);
          }}
        />
      )}

      {/* Group picker modal */}
      {groupPick && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Group Package
                </div>
                <h3 className="text-xl font-semibold mt-0.5 text-foreground">
                  {groupPick.pkg.name}
                </h3>
              </div>
              <button
                aria-label="Close"
                onClick={() => setGroupPick(null)}
                className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              <GroupMemberPicker
                totalSeats={groupPick.pkg.group_size}
                needed={Math.max(1, groupPick.pkg.group_size - 1)}
                value={groupPick.members}
                onChange={(members) => setGroupPick({ ...groupPick, members })}
              />

              <button
                onClick={() =>
                  startCheckout(
                    groupPick.pkg,
                    groupPick.members.map((m) => m.id),
                    [],
                  )
                }
                disabled={
                  opening === groupPick.pkg.id ||
                  groupPick.members.length !== groupPick.pkg.group_size - 1
                }
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 text-sm disabled:opacity-50 transition-all"
              >
                {opening === groupPick.pkg.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Opening Checkout...
                  </>
                ) : (
                  <>
                    Proceed to Payment — ${Number(groupPick.pkg.price).toFixed(0)}{" "}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
