import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Users, ShieldCheck, ShieldAlert, Download, Upload, Search,
  TrendingUp, TrendingDown, Eye, EyeOff, RefreshCw, X, Wallet, Clock,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  getPeopleDashboard, getPersonDetail,
  type DirectoryRow, type PeopleDashboard, type PersonDetail,
} from "@/lib/people-analytics.functions";
import {
  exportPeopleBackup, importPeopleTable, getExportAudit, IMPORTABLE_TABLES,
} from "@/lib/people-backup.functions";

export const Route = createFileRoute("/admin/people")({
  head: () => ({
    meta: [
      { title: "People Intelligence — AquaQBank" },
      { name: "description", content: "Growth, activity, revenue, retention and data backup for every AquaQBank account." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "People Intelligence — AquaQBank" },
      { property: "og:description", content: "Admin analytics console for AquaQBank accounts." },
    ],
  }),
  component: PeoplePage,
});

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: number) => (n ?? 0).toLocaleString();
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const ago = (s: string | null) => {
  if (!s) return "never";
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};
function mask(v: string | null, revealed: boolean) {
  if (!v) return "—";
  if (revealed) return v;
  const [a, b] = v.split("@");
  if (b) return `${a!.slice(0, 2)}${"•".repeat(Math.max(a!.length - 2, 2))}@${b}`;
  return `${v.slice(0, 3)}${"•".repeat(Math.max(v.length - 3, 3))}`;
}
function delta(now: number, prev: number) {
  if (!prev) return now ? 100 : 0;
  return Math.round(((now - prev) / prev) * 100);
}

type Filter = "all" | "verified" | "unverified" | "paying" | "owners" | "blocked" | "dormant";

function PeoplePage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [reveal, setReveal] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<DirectoryRow | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["people-dashboard", days],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: () => getPeopleDashboard({ data: { days } }) as Promise<PeopleDashboard>,
  });

  const rows = useMemo(() => {
    const list = data?.directory ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((r) => {
      if (needle) {
        const hay = `${r.full_name ?? ""} ${r.username ?? ""} ${r.email ?? ""} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      switch (filter) {
        case "verified": return r.verified;
        case "unverified": return !r.verified;
        case "paying": return r.paid_cents > 0;
        case "owners": return r.courses > 0;
        case "blocked": return !!r.locked_at;
        case "dormant": return !r.last_seen || Date.now() - new Date(r.last_seen).getTime() > 30 * 864e5;
        default: return true;
      }
    });
  }, [data, q, filter]);

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-background" />;

  const o = data?.overview;
  const ins = data?.insights;

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-primary">Admin · Intelligence</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-foreground">People Intelligence</h1>
            <p className="mt-2 text-muted-foreground">
              Everyone who joined AquaQBank — growth, activity, money and retention in one console.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted"
            >
              {reveal ? <EyeOff size={15} /> : <Eye size={15} />} {reveal ? "Hide contacts" : "Reveal contacts"}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} /> Refresh
            </button>
            <Link to="/admin/users" className="rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted">
              Users & Roles
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {!data ? (
          <p className="mt-10 text-muted-foreground">Loading the numbers…</p>
        ) : (
          <>
            <section className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={<Activity size={16} />} label="Active right now" value={num(o!.active_now)} hint="Seen in the last 5 minutes" accent />
              <Kpi icon={<Clock size={16} />} label="Opened today" value={num(o!.opened_today)} hint={`${num(o!.logins_today)} sign-ins today`} />
              <Kpi
                icon={<Users size={16} />}
                label="Total accounts"
                value={num(o!.total_users)}
                hint={`+${num(o!.new_today)} today · +${num(o!.new_week)} this week`}
                trend={delta(o!.new_week, o!.new_prev_week)}
              />
              <Kpi
                icon={<Wallet size={16} />}
                label="Revenue"
                value={money(o!.revenue_cents)}
                hint={`${num(o!.paying_users)} paying · ${money(o!.revenue_month_cents)} last 30d`}
              />
            </section>

            <section className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={<ShieldCheck size={16} />} label="Verified" value={num(o!.verified)} hint={`${num(o!.unverified)} still unverified`} />
              <Kpi icon={<ShieldAlert size={16} />} label="Blocked / stopped" value={num(o!.blocked + o!.suspended)} hint={`${num(o!.blocked)} blocked · ${num(o!.suspended)} temporary`} />
              <Kpi icon={<Users size={16} />} label="Course owners" value={num(o!.owners)} hint={`${num(o!.course_grants)} grants in total`} />
              <Kpi icon={<TrendingDown size={16} />} label="Gone quiet" value={num(o!.dormant_30d)} hint={`${num(o!.never_logged_in)} never signed in`} />
            </section>

            <Panel
              title="Growth"
              right={
                <div className="flex gap-1">
                  {[7, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold ${days === d ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              }
            >
              <Chart series={data.series} />
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Mini label="Sign-ups (30d)" value={num(o!.new_month)} trend={delta(o!.new_month, o!.new_prev_month)} />
                <Mini label="Sign-ups (7d)" value={num(o!.new_week)} trend={delta(o!.new_week, o!.new_prev_week)} />
                <Mini label="Sign-ins (7d)" value={num(o!.logins_week)} trend={delta(o!.logins_week, o!.logins_prev_week)} />
                <Mini label="Sign-ins (30d)" value={num(o!.logins_month)} />
              </div>
            </Panel>

            <div className="mt-6 grid lg:grid-cols-2 gap-6">
              <Panel title="Weekly retention cohorts">
                {data.cohorts.length === 0 ? (
                  <Empty>No cohorts yet — this fills in as people join.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="py-2">Joined week</th><th>Size</th><th>W0</th><th>W1</th><th>W2</th><th>W3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cohorts.map((c) => (
                          <tr key={c.cohort} className="border-t border-border">
                            <td className="py-2 font-bold">{day(c.cohort)}</td>
                            <td>{c.size}</td>
                            {[c.w0, c.w1, c.w2, c.w3].map((v, i) => {
                              const pct = c.size ? Math.round((v / c.size) * 100) : 0;
                              return (
                                <td key={i}>
                                  <span
                                    className="inline-block rounded-md px-2 py-0.5 text-xs font-bold"
                                    style={{ background: `color-mix(in oklab, var(--primary) ${pct}%, transparent)` }}
                                  >
                                    {pct}%
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="What the data says">
                <ul className="space-y-3 text-sm">
                  <Insight>
                    People who own at least one course sign in{" "}
                    <b>{ins!.avg_logins_with_courses}</b> times on average, against{" "}
                    <b>{ins!.avg_logins_without_courses}</b> for those who own none
                    {ins!.avg_logins_without_courses > 0 && (
                      <> — that is <b>{(ins!.avg_logins_with_courses / Math.max(ins!.avg_logins_without_courses, 0.1)).toFixed(1)}x</b> more engagement</>
                    )}.
                  </Insight>
                  <Insight><b>{ins!.share_returning}%</b> of accounts came back for a second session.</Insight>
                  <Insight><b>{ins!.share_active_7d}%</b> of everyone signed in during the last 7 days.</Insight>
                  <Insight>Typical gap between registering and first sign-in: <b>{ins!.median_days_to_first_login}</b> days.</Insight>
                  <Insight>Busiest time to be online: around <b>{String(ins!.peak_hour).padStart(2, "0")}:00</b>{ins!.peak_weekday ? <> on <b>{ins!.peak_weekday.trim()}s</b></> : null}.</Insight>
                  <Insight>Coupons: <b>{num(o!.coupon_redemptions)}</b> redemptions, <b>{money(Math.round(Number(o!.coupon_discount) * 100))}</b> given away in discounts.</Insight>
                </ul>
              </Panel>
            </div>

            <Panel title="Courses by ownership and revenue" className="mt-6">
              {data.courses.length === 0 ? (
                <Empty>No courses yet.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2">Course</th><th>Price</th><th>Owners</th><th>Share of users</th><th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.courses.slice(0, 15).map((c) => {
                        const pct = o!.total_users ? Math.round((c.owners / o!.total_users) * 100) : 0;
                        return (
                          <tr key={c.course_id} className="border-t border-border">
                            <td className="py-2 font-bold">{c.title}</td>
                            <td>{c.price != null ? `$${c.price}` : "—"}</td>
                            <td>{num(c.owners)}</td>
                            <td>
                              <div className="h-2 w-28 rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                            <td>{money(c.revenue_cents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title={`Directory — ${num(rows.length)} of ${num(data.directory.length)}`}
              className="mt-6"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search name, email, phone…"
                      className="w-56 rounded-lg border-2 border-border bg-background py-1.5 pl-8 pr-3 text-sm"
                    />
                  </div>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as Filter)}
                    className="rounded-lg border-2 border-border bg-background px-2 py-1.5 text-sm font-bold"
                  >
                    <option value="all">Everyone</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                    <option value="paying">Has paid</option>
                    <option value="owners">Owns a course</option>
                    <option value="blocked">Blocked / stopped</option>
                    <option value="dormant">Inactive 30+ days</option>
                  </select>
                  <button
                    onClick={() => downloadCsv(rows)}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-border px-3 py-1.5 text-sm font-bold hover:bg-muted"
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2">Person</th><th>Contact</th><th>Status</th><th>Courses</th><th>Paid</th><th>Joined</th><th>Last seen</th><th>Sign-ins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 300).map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="cursor-pointer border-t border-border hover:bg-muted/60"
                      >
                        <td className="py-2">
                          <div className="font-bold text-foreground">{r.full_name || r.username || "—"}</div>
                          <div className="text-xs text-muted-foreground">@{r.username ?? "—"}{r.roles.length > 0 && ` · ${r.roles.join(", ")}`}</div>
                        </td>
                        <td className="text-xs">
                          <div>{mask(r.email, reveal)}</div>
                          <div className="text-muted-foreground">{mask(r.phone, reveal)}</div>
                        </td>
                        <td>
                          <StatusChip row={r} />
                        </td>
                        <td>{r.courses}</td>
                        <td>{r.paid_cents ? money(r.paid_cents) : "—"}</td>
                        <td className="text-xs">{day(r.created_at)}</td>
                        <td className="text-xs">{ago(r.last_seen)}</td>
                        <td>{r.login_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 300 && (
                  <p className="mt-3 text-xs text-muted-foreground">Showing the first 300 — narrow it with search or a filter.</p>
                )}
              </div>
            </Panel>

            <BackupPanel />
          </>
        )}
      </main>

      {selected && <PersonDrawer row={selected} reveal={reveal} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ---------- pieces ---------- */

function Panel({ title, right, children, className = "" }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`mt-6 rounded-2xl border-2 border-border bg-card p-5 ${className}`} style={{ boxShadow: "0 4px 0 var(--border)" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ icon, label, value, hint, trend, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; trend?: number; accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border-2 border-border bg-card p-4"
      style={{ boxShadow: "0 4px 0 var(--border)", ...(accent ? { borderColor: "var(--primary)" } : {}) }}
    >
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {hint}
        {typeof trend === "number" && trend !== 0 && (
          <span className={`inline-flex items-center gap-0.5 font-bold ${trend > 0 ? "text-primary" : "text-destructive"}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-black text-foreground">{value}</span>
        {typeof trend === "number" && trend !== 0 && (
          <span className={`text-xs font-bold ${trend > 0 ? "text-primary" : "text-destructive"}`}>
            {trend > 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
    </div>
  );
}

function Insight({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-foreground">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function StatusChip({ row }: { row: DirectoryRow }) {
  const cls = "rounded-md px-2 py-0.5 text-xs font-bold";
  if (row.locked_at) {
    const temp = row.lock_until && new Date(row.lock_until) > new Date();
    return <span className={`${cls} bg-destructive/15 text-destructive`}>{temp ? "Stopped" : "Blocked"}</span>;
  }
  if (!row.verified) return <span className={`${cls} bg-muted text-muted-foreground`}>Unverified</span>;
  return <span className={`${cls} bg-primary/15 text-primary`}>Active</span>;
}

function Chart({ series }: { series: PeopleDashboard["series"] }) {
  const w = 900, h = 180, pad = 8;
  const max = Math.max(1, ...series.map((s) => Math.max(s.signups, s.logins)));
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(series.length - 1, 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const path = (key: "signups" | "logins") =>
    series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Daily sign-ups and sign-ins">
        <path d={`${path("logins")} L${x(series.length - 1)},${h - pad} L${x(0)},${h - pad} Z`} fill="var(--primary)" opacity="0.12" />
        <path d={path("logins")} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        <path d={path("signups")} fill="none" stroke="var(--foreground)" strokeWidth="2" strokeDasharray="5 4" opacity="0.65" />
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> Sign-ins</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-foreground/60" /> Sign-ups</span>
        <span className="ml-auto">{series[0]?.day ? day(series[0].day) : ""} → today</span>
      </div>
    </div>
  );
}

function PersonDrawer({ row, reveal, onClose }: { row: DirectoryRow; reveal: boolean; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["person-detail", row.id],
    queryFn: () => getPersonDetail({ data: { userId: row.id } }) as Promise<PersonDetail>,
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l-2 border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-foreground">{row.full_name || row.username}</h3>
            <p className="text-sm text-muted-foreground">@{row.username} · {mask(row.email, reveal)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 hover:bg-muted"><X size={16} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Fact label="Status" value={row.locked_at ? (row.lock_until ? "Stopped" : "Blocked") : row.verified ? "Active" : "Unverified"} />
          <Fact label="Joined" value={day(row.created_at)} />
          <Fact label="Last seen" value={ago(row.last_seen)} />
          <Fact label="Sign-ins" value={String(row.login_count)} />
          <Fact label="Courses" value={String(row.courses)} />
          <Fact label="Lifetime spend" value={row.paid_cents ? money(row.paid_cents) : "—"} />
        </div>
        {row.lock_reason && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Reason: {row.lock_reason}
          </p>
        )}

        <Section title="Courses">
          {(data?.courses ?? []).length === 0 ? <Empty>None yet.</Empty> : (
            <ul className="space-y-1 text-sm">
              {data!.courses.map((c) => (
                <li key={c.course_id} className="flex justify-between gap-3">
                  <span className="font-bold">{c.title ?? c.course_id}</span>
                  <span className="text-muted-foreground">{day(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Payments">
          {(data?.payments ?? []).length === 0 ? <Empty>No payments recorded.</Empty> : (
            <ul className="space-y-1 text-sm">
              {data!.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="font-bold">{money(p.amount_cents)} {p.currency ?? ""}</span>
                  <span className="text-muted-foreground">{p.status} · {day(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Devices">
          {(data?.devices ?? []).length === 0 ? <Empty>No devices seen.</Empty> : (
            <ul className="space-y-1 text-sm">
              {data!.devices.map((d) => (
                <li key={d.id} className="flex justify-between gap-3">
                  <span className="truncate">{d.platform ?? d.user_agent?.slice(0, 30) ?? "Unknown"}</span>
                  <span className="text-muted-foreground">{ago(d.last_seen_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent sign-ins">
          {(data?.logins ?? []).length === 0 ? <Empty>Never signed in.</Empty> : (
            <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              {data!.logins.map((l) => <li key={l}>{new Date(l).toLocaleString()}</li>)}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-bold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const { data: audit, refetch } = useQuery({ queryKey: ["people-audit"], queryFn: () => getExportAudit() });

  async function doExport() {
    setBusy("Exporting…");
    setLog([]);
    try {
      const backup = await exportPeopleBackup({ data: {} } as any);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aquaqbank-people-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setLog([`Exported ${backup.accounts.length} accounts and ${Object.values(backup.tables).reduce((s, v) => s + v.length, 0)} records.`]);
      refetch();
    } catch (e) {
      setLog([`Export failed: ${(e as Error).message}`]);
    } finally {
      setBusy(null);
    }
  }

  async function doImport(file: File) {
    setBusy("Restoring…");
    setLog([]);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.format !== "aquaqbank.people") throw new Error("This file is not a people archive.");
      const lines: string[] = [];
      for (const t of IMPORTABLE_TABLES) {
        const rows = parsed.tables?.[t] ?? [];
        if (!rows.length) continue;
        setBusy(`Restoring ${t}…`);
        const res = await importPeopleTable({ data: { table: t, rows } });
        lines.push(`${t}: ${res.written}/${res.attempted} restored${res.failed.length ? `, ${res.failed.length} skipped` : ""}`);
        setLog([...lines]);
      }
      lines.push("Done. Restored people set a new password through the reset-password email.");
      setLog([...lines]);
      refetch();
    } catch (e) {
      setLog([`Restore failed: ${(e as Error).message}`]);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Panel title="Backup — export & restore people data">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={doExport}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          <Download size={15} /> Export everything (JSON)
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50"
        >
          <Upload size={15} /> Restore from a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }}
        />
        {busy && <span className="self-center text-sm text-muted-foreground">{busy}</span>}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        The archive holds profiles, roles, course grants, purchases, payments, coupon redemptions, devices and sign-in
        history. Passwords are never included — the login system only stores a one-way hash, so no readable password
        exists anywhere. Restored people set a new password through the reset-password email, which is how every serious
        platform handles account exports.
      </p>

      {log.length > 0 && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/60 p-3 text-xs">{log.join("\n")}</pre>
      )}

      {(audit ?? []).length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Audit trail</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {audit!.map((a) => (
              <li key={a.id}>
                {new Date(a.created_at).toLocaleString()} — <b className="text-foreground">{a.action}</b> by {a.actor_label ?? "admin"} ({num(a.record_count)} records)
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function downloadCsv(rows: DirectoryRow[]) {
  const head = ["name", "username", "email", "phone", "verified", "status", "roles", "courses", "paid", "joined", "last_seen", "sign_ins"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      r.full_name, r.username, r.email, r.phone, r.verified ? "yes" : "no",
      r.locked_at ? (r.lock_until ? "stopped" : "blocked") : "active",
      r.roles.join("|"), r.courses, (r.paid_cents / 100).toFixed(2),
      r.created_at, r.last_seen ?? "", r.login_count,
    ].map(esc).join(","),
  );
  const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aquaqbank-people-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
