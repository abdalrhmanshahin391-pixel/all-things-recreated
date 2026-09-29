import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, Package as PackageIcon, Users, User, Sparkles, Check, Flame, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Package = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price?: number | null;
  badge_text?: string | null;
  image_url?: string | null;
  currency: string;
  package_type: string;
  group_size: number;
};

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JOD: "JD ", SAR: "SAR " };

export const homePackagesQuery = queryOptions({
  queryKey: ["home-packages-strip"],
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
  queryFn: async (): Promise<{ packages: Package[]; courseCounts: Record<string, number> }> => {
    const { data } = await supabase
      .from("packages")
      .select("id, name, description, price, original_price, badge_text, image_url, currency, package_type, group_size")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    const packages = (data ?? []) as unknown as Package[];
    const courseCounts: Record<string, number> = {};
    if (packages.length > 0) {
      const { data: rows } = await supabase
        .from("package_courses")
        .select("package_id")
        .in("package_id", packages.map((p) => p.id));
      for (const r of (rows ?? []) as Array<{ package_id: string }>) {
        courseCounts[r.package_id] = (courseCounts[r.package_id] ?? 0) + 1;
      }
    }
    return { packages, courseCounts };
  },
});

export function PackagesStrip() {
  const { t } = useTranslation();
  const { data } = useQuery(homePackagesQuery);
  const packages = data?.packages ?? [];
  const courseCounts = data?.courseCounts ?? {};

  if (packages.length === 0) return null;

  // Highlight cheapest per-course package as BEST DEAL
  let bestId: string | null = null;
  let bestRatio = Infinity;
  for (const p of packages) {
    const n = courseCounts[p.id] ?? 0;
    if (n > 0) {
      const r = Number(p.price) / n;
      if (r < bestRatio) {
        bestRatio = r;
        bestId = p.id;
      }
    }
  }

  return (
    <section className="py-20 md:py-28 bg-muted relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 md:px-8 relative">
        <div className="text-center mb-14">
          <span
            className="inline-flex items-center gap-2 rounded-full bg-card border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] mb-4"
            style={{ borderColor: "var(--primary-soft)", color: "var(--primary)", boxShadow: "0 3px 0 var(--primary-soft)" }}
          >
            <Sparkles size={12} strokeWidth={3} />
            {t("cms.home.packages.badge", "Packages · الباقات")}
          </span>
          <h2 className="font-display font-black text-foreground lowercase leading-[1.05]" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
            {t("cms.home.packages.title", "Study Packages & Bundles")}
          </h2>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
            {t("cms.home.packages.subtitle", "Save big by bundling your subjects and lecture courses.")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((p) => {
            const isGroup = p.package_type === "group" || p.group_size > 1;
            const sym = SYMBOL[p.currency] ?? `${p.currency} `;
            const n = courseCounts[p.id] ?? 0;
            const isBest = bestId === p.id;
            const perStudent = isGroup && p.group_size > 0 ? Number(p.price) / p.group_size : null;
            const hasDiscount = p.original_price && Number(p.original_price) > Number(p.price);
            const discountPct = hasDiscount
              ? Math.round(((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100)
              : 0;

            return (
              <Link
                key={p.id}
                to="/packages"
                className={`group relative block rounded-3xl overflow-hidden bg-card border-2 hover:-translate-y-1 transition-transform ${
                  isBest ? "border-primary" : "border-border"
                }`}
                style={{
                  boxShadow: isBest
                    ? "0 6px 0 color-mix(in oklab, var(--primary) 40%, transparent)"
                    : "0 4px 0 var(--border)",
                }}
              >
                {/* Floating Badges */}
                {p.badge_text ? (
                  <div
                    className="absolute top-0 right-0 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white rounded-bl-2xl shadow flex items-center gap-1 z-10"
                    style={{ background: "#ef4444" }}
                  >
                    <Flame size={12} /> {p.badge_text}
                  </div>
                ) : isBest ? (
                  <div
                    className="absolute top-0 right-0 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white rounded-bl-2xl z-10"
                    style={{ background: "var(--primary)" }}
                  >
                    {t("cms.home.packages.bestDeal", "Best Deal")}
                  </div>
                ) : null}

                {/* Optional Cover image */}
                {p.image_url && (
                  <div className="h-32 w-full overflow-hidden bg-muted/40 border-b border-border/60">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}

                <div className="p-6 text-center flex flex-col items-center">
                  <div className="flex items-center justify-center gap-3 mb-5">
                    <span
                      className="grid place-items-center h-14 w-14 rounded-2xl text-white"
                      style={{
                        background: "var(--primary)",
                        boxShadow: "0 4px 0 color-mix(in oklab, var(--primary) 60%, black)",
                      }}
                    >
                      <PackageIcon size={24} strokeWidth={2.5} />
                    </span>
                    {isGroup ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md"
                        style={{ background: "#fef3c7", color: "#92400e" }}
                      >
                        <Users size={11} strokeWidth={3} />
                        {t("cms.home.packages.group")} · {p.group_size}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md"
                        style={{ background: "var(--primary-soft)", color: "var(--primary-deep)" }}
                      >
                        <User size={11} strokeWidth={3} />
                        {t("cms.home.packages.individual")}
                      </span>
                    )}
                  </div>

                  <h3 className="font-display font-black text-2xl text-foreground leading-tight lowercase">
                    {p.name}
                  </h3>

                  {p.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                  )}

                  {n > 0 && (
                    <div className="mt-4 space-y-1.5 inline-flex flex-col items-center">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Check size={14} strokeWidth={3} style={{ color: "var(--primary)" }} />
                        {n === 1
                          ? t("cms.home.packages.includesOne")
                          : t("cms.home.packages.includes", { count: n })}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Check size={14} strokeWidth={3} style={{ color: "var(--primary)" }} />
                        {t("cms.home.packages.lifetime")}
                      </div>
                      {isGroup && (
                        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Check size={14} strokeWidth={3} style={{ color: "var(--primary)" }} />
                          {t("cms.home.packages.shareWith", { count: p.group_size })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6 pt-5 border-t-2 border-dashed border-border w-full">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      {isGroup
                        ? t("cms.home.packages.groupPrice", { count: p.group_size })
                        : t("cms.home.packages.totalInvestment", { defaultValue: isAr ? "السعر الإجمالي" : "Total investment" })}
                    </p>
                    <div className="flex items-baseline justify-center gap-2 mt-1">
                      <span className="font-display font-black text-4xl text-foreground">
                        {sym}
                        {Number(p.price).toFixed(0)}
                      </span>
                      {hasDiscount && (
                        <span className="text-sm text-muted-foreground line-through font-serif">
                          {sym}{Number(p.original_price).toFixed(0)}
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="text-[11px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                          Save {discountPct}%
                        </span>
                      )}
                    </div>
                    {perStudent !== null && (
                      <p className="text-xs font-bold mt-1 text-muted-foreground">
                        ≈ {sym}{perStudent.toFixed(0)} {t("cms.home.packages.perStudent")}
                      </p>
                    )}
                  </div>

                  <span
                    className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-wider text-white"
                    style={{
                      background: "var(--primary)",
                      boxShadow: "0 4px 0 color-mix(in oklab, var(--primary) 70%, black)",
                    }}
                  >
                    {t("cms.home.packages.viewPackage", { defaultValue: isAr ? "عرض الباقة" : "View package" })}
                    <ArrowRight size={14} strokeWidth={3} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
