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
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import {
  listPublishedPackages,
  openPackageCheckoutData,
  type PackageWithCourses,
} from "@/lib/packages.functions";
import { GroupMemberPicker, type GroupMember } from "@/components/packages/GroupMemberPicker";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/packages/")({
  head: () => ({
    meta: [
      { title: "Subscription Packages — AquaQBank" },
      {
        name: "description",
        content:
          "Bundle multiple courses into one subscription. Individual and group packages available.",
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

  async function startCheckout(pkg: PackageWithCourses, memberIds: string[]) {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    setOpening(pkg.id);
    setError(null);
    try {
      const { paddlePriceId, customData } = await validate({
        data: { packageId: pkg.id, memberIds },
      });
      await initializePaddle();
      const resolvedPriceId = await getPaddlePriceId(paddlePriceId);
      window.Paddle.Checkout.open({
        items: [{ priceId: resolvedPriceId, quantity: 1 }],
        customer: {
          email: user.email ?? undefined,
          name: profile?.full_name || (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || undefined,
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
    }
  }

  function onSubscribe(pkg: PackageWithCourses) {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (pkg.package_type === "group") {
      setGroupPick({ pkg, members: [] });
    } else {
      startCheckout(pkg, []);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
      <main className="pt-24 pb-24">

        {/* Hero — institutional light */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-16 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="w-3 h-3 text-accent" /> {t("cms.packagesPage.badge")}
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-semibold tracking-tight text-foreground max-w-3xl">
              {t("cms.packagesPage.title")}
            </h1>
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl">
              {t("cms.packagesPage.subtitle")}
            </p>
          </div>
        </section>


        <div className="mx-auto max-w-7xl px-6 md:px-10 mt-12">
          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {packages === null && (
            <div className="text-center py-20 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> {t("cms.packagesPage.loading")}
            </div>
          )}

          {packages && packages.length === 0 && (
            <div className="medical-card text-center py-16">
              <div className="text-slate-600">{t("cms.packagesPage.empty")}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages?.map((pkg, idx) => {
              const totalQ = pkg.courses.reduce(
                (a, c) => a + c.questions_count_mid + c.questions_count_final,
                0,
              );
              const isGroup = pkg.package_type === "group";
              const CornerGlyph = isGroup ? Users : Activity;
              return (
                <article
                  key={pkg.id}
                  className="relative medical-card overflow-hidden flex flex-col"
                >
                  <div
                    className={`absolute top-5 right-5 grid place-items-center h-10 w-10 rounded-md bg-muted text-primary border border-border`}
                    aria-hidden
                  >
                    <CornerGlyph size={18} strokeWidth={2} />
                  </div>

                  <div className="p-6 md:p-7 border-b border-border">
                    <div className="flex items-center justify-between gap-2 mb-3 pr-12">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest rounded-full px-2.5 py-1 bg-muted text-muted-foreground border border-border">
                        {isGroup ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {isGroup
                          ? t("cms.packagesPage.groupSeats", { count: pkg.group_size })
                          : t("cms.packagesPage.individual")}
                      </span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                      {pkg.name}
                    </h2>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-4xl font-semibold text-foreground">
                        ${Number(pkg.price).toFixed(0)}
                      </span>
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        {pkg.currency?.toUpperCase() ?? "USD"} · {t("cms.packagesPage.oneTime")}
                      </span>
                    </div>
                    {pkg.description && (
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {pkg.description}
                      </p>
                    )}
                  </div>


                  <div className="p-6 md:p-7 flex-1 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      <span>{t("cms.packagesPage.coursesLabel", { count: pkg.courses.length })}</span>
                      <span>{t("cms.packagesPage.questionsLabel", { count: totalQ })}</span>
                    </div>
                    <ul className="space-y-2">
                      {pkg.courses.map((c) => {
                        const qs = c.questions_count_mid + c.questions_count_final;
                        return (
                          <li
                            key={c.id}
                            className="flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5"
                          >
                            <div className="grid place-items-center h-5 w-5 rounded-md bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-900 capitalize truncate">
                                {c.title}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {t("cms.packagesPage.yearNote", { year: c.year, count: qs })}
                              </div>
                              {c.note && (
                                <div className="mt-1 text-[11px] text-orange-600 italic">
                                  {c.note}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="p-6 md:p-7 pt-0">
                    <button
                      onClick={() => onSubscribe(pkg)}
                      disabled={opening === pkg.id}
                      className="magnetic-cta w-full inline-flex items-center justify-center gap-2 rounded-xl text-white font-extrabold tracking-wide py-3.5 text-sm disabled:opacity-60"
                    >
                      <span className="relative z-10 inline-flex items-center gap-2">
                        {opening === pkg.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> {t("cms.packagesPage.opening")}
                          </>
                        ) : isGroup ? (
                          <>
                            {t("cms.packagesPage.ctaGroup")} <ArrowRight className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            {t("cms.packagesPage.ctaIndividual")} — ${Number(pkg.price).toFixed(0)}{" "}
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      <ShieldCheck className="w-3 h-3" /> Secure · Paddle MoR
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>
      </MedicalPageBackdrop>

      {/* Group picker modal */}
      {groupPick && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
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
                className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-5">
                You count as{" "}
                <span className="font-semibold text-slate-900">
                  1 of {groupPick.pkg.group_size}
                </span>{" "}
                seats. Search and add {groupPick.pkg.group_size - 1} more registered{" "}
                {groupPick.pkg.group_size - 1 === 1 ? "user" : "users"}. They'll get
                access to every course in the package as soon as your payment clears.
              </p>
              <GroupMemberPicker
                needed={groupPick.pkg.group_size - 1}
                value={groupPick.members}
                onChange={(next) => setGroupPick({ ...groupPick, members: next })}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
              <div className="text-sm text-slate-600">
                Total ·{" "}
                <span className="text-xl font-black text-slate-900">
                  ${Number(groupPick.pkg.price).toFixed(0)}
                </span>
              </div>
              <button
                disabled={
                  groupPick.members.length !== groupPick.pkg.group_size - 1 ||
                  opening === groupPick.pkg.id
                }
                onClick={() =>
                  startCheckout(
                    groupPick.pkg,
                    groupPick.members.map((m) => m.id),
                  )
                }
                className="magnetic-cta inline-flex items-center justify-center gap-2 rounded-xl text-white font-extrabold tracking-wide px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  {opening === groupPick.pkg.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Opening…
                    </>
                  ) : (
                    <>
                      Pay & unlock group <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/courses" className="hidden">
        all courses
      </Link>
    </div>
  );
}

function FloatingGlyph({
  Icon,
  className,
  style,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute hidden md:grid place-items-center h-12 w-12 rounded-2xl bg-white/85 backdrop-blur-md border border-white shadow-lg doc-float pointer-events-none ${className ?? ""}`}
      style={style}
      aria-hidden
    >
      <Icon size={20} strokeWidth={2.2} />
    </div>
  );
}
