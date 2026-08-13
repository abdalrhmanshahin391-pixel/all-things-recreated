import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  RefreshCw,
  ShieldCheck,
  Wallet,
  HardDrive,
  Gauge,
  Users,
  BookOpen,
  Layers,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin/database")({
  head: () => ({
    meta: [
      { title: "Database Ultimate — AquaQBank Admin" },
      {
        name: "description",
        content:
          "What the AquaQBank database stores, why each part exists, what it costs, and when you would need to grow it.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Database Ultimate — AquaQBank Admin" },
      {
        property: "og:description",
        content: "A plain-language guide to the AquaQBank database: purpose, cost, limits and growth plan.",
      },
    ],
  }),
  component: DatabaseUltimate,
});

type Stats = {
  db_size_bytes: number;
  generated_at: string;
  buckets: Array<{ bucket: string; files: number; bytes: number; largest_bytes: number; last_upload: string | null }>;
  growth: { bytes_30d: number; bytes_90d: number; files_30d: number };
  largest_files: Array<{ bucket: string; name: string; bytes: number; created_at: string }>;
  tables: Array<{ name: string; bytes: number; rows: number }>;
  content: Record<string, number>;
};

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const GB = 1024 ** 3;
/** Soft guidance thresholds for the database disk (not a hard limit). */
const WATCH_DB_BYTES = 4 * GB;
const UPGRADE_DB_BYTES = 7 * GB;

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border-2 border-border bg-card p-5 md:p-6">
      <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-4">
      <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** What each part of the database does, in student-site language. */
const PURPOSE: Array<{ icon: React.ReactNode; area: string; holds: string; breaksWithout: string }> = [
  {
    icon: <Users className="h-4 w-4 text-primary" />,
    area: "Accounts & access",
    holds: "Profiles, roles (admin / committee / student), device limits, blocks and suspensions, login history.",
    breaksWithout: "Nobody can sign in, and paid content could not be limited to the people who bought it.",
  },
  {
    icon: <BookOpen className="h-4 w-4 text-primary" />,
    area: "Question banks",
    holds: "Courses, subject groups, subjects, questions, answer options, explanations, flags and attempts.",
    breaksWithout: "The core product disappears — no quizzes, no progress, no review of wrong answers.",
  },
  {
    icon: <Layers className="h-4 w-4 text-primary" />,
    area: "Committee library",
    holds: "Years, semesters, modules, subjects and the index of every uploaded file (not the file itself).",
    breaksWithout: "Files would still exist somewhere, but nothing would know which subject or year they belong to.",
  },
  {
    icon: <HardDrive className="h-4 w-4 text-primary" />,
    area: "Lectures & German",
    holds: "Lecture items, quizzes, vocabulary, shadowing and voice attempts, per-student progress.",
    breaksWithout: "Students lose their place and their scores every time they close the page.",
  },
  {
    icon: <Wallet className="h-4 w-4 text-primary" />,
    area: "Money",
    holds: "Packages, coupons, redemptions, payment events, and who owns which course.",
    breaksWithout: "You cannot prove a purchase, restore access, or reconcile revenue.",
  },
  {
    icon: <Gauge className="h-4 w-4 text-primary" />,
    area: "Analytics",
    holds: "Sessions, login events and the aggregates behind People Intelligence.",
    breaksWithout: "You are running the business blind — no growth, retention or activity numbers.",
  },
];

function DatabaseUltimate() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-server-stats"],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await (supabase.rpc as any)("admin_server_stats");
      if (error) throw error;
      return data as Stats;
    },
  });

  const dbBytes = Number(data?.db_size_bytes ?? 0);
  const storageBytes = (data?.buckets ?? []).reduce((s, b) => s + Number(b.bytes || 0), 0);
  const monthly = Number(data?.growth?.bytes_30d ?? 0);
  const content = data?.content ?? {};

  const health =
    dbBytes >= UPGRADE_DB_BYTES
      ? { tone: "bad" as const, label: "Time to grow", text: "The database disk is getting full. Increase it before writes start failing." }
      : dbBytes >= WATCH_DB_BYTES
        ? { tone: "warn" as const, label: "Watch this", text: "Still fine, but plan the next disk increase and move any large files out of database rows." }
        : { tone: "good" as const, label: "You're fine", text: "Plenty of headroom. Nothing to buy, nothing to move." };

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Admin · Foundations</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              <Database className="h-8 w-8 text-primary" /> Database Ultimate
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              What AquaQBank keeps in its database, why every piece is there, what it actually costs, and the exact signs
              that you need something bigger. Written to be read without any technical background.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {/* Live snapshot */}
        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Database size" value={data ? fmtBytes(dbBytes) : "…"} hint="Records and indexes only" />
          <Stat label="Files stored" value={data ? fmtBytes(storageBytes) : "…"} hint="PDFs, images, video" />
          <Stat label="Students" value={data ? Number(content["users"] ?? 0).toLocaleString() : "…"} hint="Registered accounts" />
          <Stat label="Questions" value={data ? Number(content["questions"] ?? 0).toLocaleString() : "…"} hint="Across all courses" />
        </section>

        <div
          className={`mt-4 flex items-start gap-3 rounded-2xl border-2 p-4 ${
            health.tone === "good"
              ? "border-primary/40 bg-primary/5"
              : health.tone === "warn"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-destructive/40 bg-destructive/10"
          }`}
        >
          {health.tone === "good" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          )}
          <div>
            <div className="text-sm font-black text-foreground">{health.label}</div>
            <p className="text-sm text-muted-foreground">{health.text}</p>
          </div>
        </div>

        {/* Why we need a database */}
        <Panel title="Why AquaQBank needs a database at all" icon={<Database className="h-5 w-5 text-primary" />}>
          <p className="text-sm text-foreground">
            A website on its own has no memory. Every time a student refreshes the page, everything they did would be gone.
            The database is the memory: it is the only reason a student can buy a course today and still have it next month,
            the only reason a wrong answer can be shown again in review, and the only reason you can tell how many people
            actually use the site.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {PURPOSE.map((p) => (
              <div key={p.area} className="rounded-xl border-2 border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  {p.icon}
                  {p.area}
                </div>
                <p className="mt-2 text-sm text-foreground">{p.holds}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong>Without it:</strong> {p.breaksWithout}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Do I need to buy one */}
        <Panel title="Do you need to buy an external database?" icon={<Wallet className="h-5 w-5 text-primary" />}>
          <p className="text-sm font-bold text-foreground">Short answer: no.</p>
          <p className="mt-2 text-sm text-foreground">
            AquaQBank already runs on a managed database that comes with the project — the same one powering sign-in, the
            question bank and payments right now. Buying a separate database from another company would cost money, add a
            second system to keep in sync, and make the site slower, because your pages and your data would live in
            different places.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border-2 border-border p-4">
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Free / included</div>
              <p className="mt-2 text-sm text-foreground">
                Everything you have today: all tables, all accounts, all questions, backups and the admin tools.
              </p>
            </div>
            <div className="rounded-xl border-2 border-border p-4">
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costs money later</div>
              <p className="mt-2 text-sm text-foreground">
                Only three things move the bill: how many files you store, how much students download, and how big the
                database server needs to be under heavy traffic.
              </p>
            </div>
            <div className="rounded-xl border-2 border-border p-4">
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Never worth buying</div>
              <p className="mt-2 text-sm text-foreground">
                A second database, a separate analytics database, or a paid caching service — at your scale these solve
                problems you do not have.
              </p>
            </div>
          </div>
        </Panel>

        {/* Files rule */}
        <Panel title="Where files belong (the rule that keeps costs low)" icon={<HardDrive className="h-5 w-5 text-primary" />}>
          <p className="text-sm text-foreground">
            Big files — PDFs, books, lecture videos — must live in file storage or Google Drive, and the database should
            only keep a short link to them. Putting file contents inside database rows is the single fastest way to make a
            site expensive and slow: backups explode, every query gets heavier, and the disk fills in weeks.
          </p>
          {data && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Biggest files today</div>
              {data.largest_files.slice(0, 5).map((f) => (
                <div key={`${f.bucket}/${f.name}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate text-foreground">{f.name}</span>
                  <span className="shrink-0 font-bold text-muted-foreground">{fmtBytes(Number(f.bytes))}</span>
                </div>
              ))}
              {data.largest_files.length === 0 && (
                <p className="text-sm text-muted-foreground">No stored files yet.</p>
              )}
            </div>
          )}
        </Panel>

        {/* Growth thresholds */}
        <Panel title="Growth plan — when to do something" icon={<Gauge className="h-5 w-5 text-primary" />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-widest text-muted-foreground">
                  <th className="py-2">Signal</th>
                  <th className="py-2">You're fine</th>
                  <th className="py-2">Watch this</th>
                  <th className="py-2">Act now</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {[
                  ["Database size", "under 4 GB", "4–7 GB", "over 7 GB → increase the disk"],
                  ["Students online at once", "under 200", "200–800", "over 800 → bigger instance"],
                  ["Page loads feel slow", "instant", "1–3 s waits", "timeouts → check slow queries first"],
                  ["Stored files", "under 20 GB", "20–100 GB", "over 100 GB → move video to a host"],
                  ["Question bank", "under 50k questions", "50k–250k", "over 250k → archive old years"],
                ].map((row) => (
                  <tr key={row[0]} className="border-t border-border">
                    <td className="py-2 pe-3 font-bold">{row[0]}</td>
                    <td className="py-2 pe-3 text-muted-foreground">{row[1]}</td>
                    <td className="py-2 pe-3 text-muted-foreground">{row[2]}</td>
                    <td className="py-2 text-muted-foreground">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Current pace: about {fmtBytes(monthly)} of new files in the last 30 days.
          </p>
        </Panel>

        {/* Speed */}
        <Panel title="What actually makes it fast" icon={<Gauge className="h-5 w-5 text-primary" />}>
          <ul className="space-y-2 text-sm text-foreground">
            <li>
              <strong>Indexes.</strong> Shortcuts that let the database jump straight to the right rows instead of reading a
              whole table. Every busy relationship on this site (questions by subject, options by question, subjects by
              group, course access by course) now has one.
            </li>
            <li>
              <strong>Caching.</strong> Site settings, navigation and page copy are identical for every visitor, so they are
              fetched once a minute per server instead of once per page view.
            </li>
            <li>
              <strong>Prefetching.</strong> When a student hovers a link, the next page is already loading, so the click
              feels instant.
            </li>
            <li>
              <strong>Less background chatter.</strong> Device and presence checks are throttled and pause while a tab is
              hidden, so hundreds of open tabs no longer hammer the server.
            </li>
          </ul>
        </Panel>

        {/* Backups */}
        <Panel title="Safety & backups" icon={<ShieldCheck className="h-5 w-5 text-primary" />}>
          <ul className="space-y-2 text-sm text-foreground">
            <li>An export contains accounts, roles, course ownership, question banks, committee structure and payment records — not the uploaded files themselves.</li>
            <li>Take an export before any big change: bulk imports, deleting a course, or restoring an old year.</li>
            <li>Keep at least one export off the site (your own computer or Drive). A backup stored only inside the system it protects is not a backup.</li>
            <li>To restore: export first (so you can undo), then import, then verify one student account and one paid course before telling anyone.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/admin/backups" className="rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold text-foreground">
              Backups
            </Link>
            <Link to="/admin/people" className="rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold text-foreground">
              People Intelligence
            </Link>
            <Link to="/admin/servers" className="rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold text-foreground">
              Servers &amp; Storage
            </Link>
          </div>
        </Panel>

        {/* Table sizes */}
        {data && (
          <Panel title="Largest tables right now" icon={<Layers className="h-5 w-5 text-primary" />}>
            <div className="space-y-2">
              {data.tables.slice(0, 10).map((t) => (
                <div key={t.name} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate font-bold text-foreground">{t.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {Number(t.rows).toLocaleString()} rows · {fmtBytes(Number(t.bytes))}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Snapshot taken {data.generated_at ? new Date(data.generated_at).toLocaleString() : "just now"}. This page only
              loads when you open it — it does not poll in the background.
            </p>
          </Panel>
        )}
      </main>
    </div>
  );
}
