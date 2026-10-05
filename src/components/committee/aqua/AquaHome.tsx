import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { UsersRound, History, Info } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { iconOf } from "@/lib/committee-meta";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { AQUA_MIGRATION, aquaCountsQuery, aquaTreeQuery, firstClosed } from "@/lib/committee-aqua";
import { AquaBackdrop, AquaHero, AquaNodeCard, AquaSetupNotice } from "@/components/committee/aqua/AquaParts";
import { VersionSwitch } from "@/components/committee/aqua/VersionSwitch";
import { useAquaOpen } from "@/components/committee/aqua/useAquaOpen";
import { BackupButtons } from "@/components/committee/BackupButtons";

const aquaYearsQuery = queryOptions({
  queryKey: ["committee-aqua-years"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("committee_years")
      .select("id, year_number, display_name, icon_key, sort_order")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as { id: string; year_number: number; display_name: string; icon_key: string; sort_order: number }[];
  },
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
});

/** The committee home in its AQUA version: same years, but only AQUA's own summaries live here. */
export function AquaHome() {
  const { canManage, canManageMembers, isCommittee, isCommitteeHead, isAdmin } = useCommitteeRole();
  const { data: years, isLoading } = useQuery(aquaYearsQuery);
  const { data: tree } = useQuery(aquaTreeQuery);
  const { data: counts } = useQuery(aquaCountsQuery);
  const aqua = useAquaOpen();

  // how many subjects a student can reach in each year, and how many summaries they hold
  const perYear = useMemo(() => {
    const out = new Map<string, { open: number; total: number; summaries: number }>();
    for (const s of tree?.subjects ?? []) {
      const cur = out.get(s.year_id) ?? { open: 0, total: 0, summaries: 0 };
      cur.total += 1;
      const closed = firstClosed(aqua.state, [
        { type: "year", id: s.year_id },
        { type: "semester", id: s.semester_id },
        { type: "module", id: s.module_id },
        { type: "subject", id: s.id },
      ]);
      if (!closed) {
        cur.open += 1;
        cur.summaries += counts?.[s.id] ?? 0;
      }
      out.set(s.year_id, cur);
    }
    return out;
  }, [tree, aqua.state, counts]);

  return (
    <div className="aqua-theme relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <AquaBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16 md:px-10">
        <div className="pt-10 md:pt-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <VersionSwitch />
            {(isCommittee || isAdmin) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                  {isAdmin ? "Admin" : isCommitteeHead ? "رئيس اللجنة" : "عضو في اللجنة"}
                </span>
                {canManageMembers && (
                  <>
                    <Link
                      to="/committee/manage-team"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold hover:border-primary/50"
                    >
                      <UsersRound size={13} /> Manage team
                    </Link>
                    <Link
                      to="/admin/committee-log"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold hover:border-primary/50"
                    >
                      <History size={13} /> Log
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <AquaHero
            titleAr="ملخصات أكوا"
            titleEn="AQUA Summaries"
            subtitle="Clear, high-yield summaries written by the AQUA team. The university's own books and files stay in the University version."
          />
        </div>

        {aqua.state?.missingTable && canManage && (
          <div className="mt-6">
            <AquaSetupNotice migration={AQUA_MIGRATION} />
          </div>
        )}

        {canManage && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Every year, semester and subject starts as <b className="text-foreground">coming soon</b>. Use the switch on a
              card to open the ones you are adding summaries to. Opening a subject also opens the semester and year above it.
            </p>
          </div>
        )}

        {canManageMembers && (
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-3">
            <span className="mr-auto text-xs text-muted-foreground">
              One backup covers both pages: the University resources and the AQUA summaries.
            </span>
            <BackupButtons />
          </div>
        )}

        <div className="mt-10 mb-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Choose your year</div>
            <h2 className="text-2xl font-bold tracking-tight">Years</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : (
          <div className="aqua-stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(years ?? []).map((y) => {
              const Icon = iconOf(y.icon_key);
              const stats = perYear.get(y.id);
              const open = aqua.isOpen("year", y.id);
              return (
                <AquaNodeCard
                  key={y.id}
                  icon={<Icon size={22} strokeWidth={1.8} />}
                  eyebrow={y.year_number === 0 ? "Preparation Year" : `Year ${y.year_number}`}
                  title={y.display_name}
                  mark={String(y.year_number)}
                  meta={
                    open && stats
                      ? `${stats.open} of ${stats.total} subjects open${stats.summaries ? ` · ${stats.summaries} summaries` : ""}`
                      : "Summaries are on the way"
                  }
                  open={open}
                  canManage={canManageMembers}
                  onToggle={() => aqua.toggle({ type: "year", id: y.id }, [], !open)}
                  toggling={aqua.busy("year", y.id)}
                  link={(card, cls) => (
                    <Link to="/committee/$year" params={{ year: String(y.year_number) }} search={{ sem: undefined, mod: undefined }} className={cls}>
                      {card}
                    </Link>
                  )}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}