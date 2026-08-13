import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Users as UsersIcon,
  Activity,
  Clock,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin/marketing")({
  head: () => ({ meta: [{ title: "Marketing — AquaQBank" }] }),
  component: MarketingPage,
});

type Stats = {
  total_users: number;
  active_now: number;
  opened_today: number;
};

function MarketingPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  async function load() {
    setRefreshing(true);
    const { data, error: err } = await (supabase.rpc as any)("admin_marketing_stats");
    if (err) setError(err.message);
    else setStats(data as Stats);
    setRefreshing(false);
  }

  useEffect(() => {
    if (isAdmin) {
      load();
      const t = setInterval(load, 30_000);
      return () => clearInterval(t);
    }
  }, [isAdmin]);

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="mb-3 text-xs font-bold tracking-[0.28em] text-amber-400 uppercase">
              Admin · Marketing
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold flex items-center gap-3">
              <BarChart3 className="w-9 h-9 text-amber-400" />
              Audience overview
            </h1>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg border border-white/15 text-sm font-bold hover:bg-white/5 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!stats ? (
          <div className="text-white/50">Loading stats…</div>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <BigCard
                icon={<Activity className="w-5 h-5" />}
                label="Active right now"
                value={stats.active_now}
                hint="Last 5 minutes"
                tone="emerald"
              />
              <BigCard
                icon={<Clock className="w-5 h-5" />}
                label="Opened today"
                value={stats.opened_today}
                hint="Unique users since midnight"
                tone="amber"
              />
              <BigCard
                icon={<UsersIcon className="w-5 h-5" />}
                label="Total registered"
                value={stats.total_users}
                hint="All-time accounts"
                tone="rose"
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function BigCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: "emerald" | "amber" | "rose";
}) {
  const ring =
    tone === "emerald"
      ? "from-emerald-500/20 to-emerald-500/0 border-emerald-500/30 text-emerald-300"
      : tone === "amber"
        ? "from-amber-500/20 to-amber-500/0 border-amber-500/30 text-amber-300"
        : "from-rose-500/20 to-rose-500/0 border-rose-500/30 text-rose-300";
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${ring} p-6`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold opacity-80">
        {icon} {label}
      </div>
      <div className="mt-4 text-5xl font-extrabold text-white">{value.toLocaleString()}</div>
      <div className="mt-2 text-xs text-white/50">{hint}</div>
    </div>
  );
}
