import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Database, Server, TrendingUp, RefreshCw } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin/servers")({
  head: () => ({
    meta: [
      { title: "Servers & Storage — Admin" },
      { name: "description", content: "Storage, database size and hosting capacity overview for the site." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Servers & Storage — Admin" },
      { property: "og:description", content: "Storage, database and hosting capacity overview." },
    ],
  }),
  component: ServersPage,
});

type Bucket = { bucket: string; files: number; bytes: number; largest_bytes: number; last_upload: string | null };
type FileRow = { bucket: string; name: string; bytes: number; created_at: string };
type TableRow = { name: string; bytes: number; rows: number };
type Stats = {
  db_size_bytes: number;
  generated_at: string;
  buckets: Bucket[];
  growth: { bytes_30d: number; bytes_90d: number; files_30d: number };
  largest_files: FileRow[];
  tables: TableRow[];
  content: Record<string, number>;
};

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const GB = 1024 ** 3;
/** Rough, clearly-labelled estimates. Cloud is metered, not quota-based. */
const CREDITS_PER_GB_STORED_MONTH = 0.09;
const CREDITS_PER_GB_DOWNLOADED = 0.36;
const USD_PER_CREDIT = 0.25;

function fmtCredits(c: number): string {
  if (c < 0.01) return "<0.01 credits";
  return `${c.toFixed(2)} credits`;
}
function fmtMoney(c: number): string {
  return `~$${(c * USD_PER_CREDIT).toFixed(2)}`;
}

function CapacityPanel({ storageBytes, dbBytes, monthlyGrowth }: { storageBytes: number; dbBytes: number; monthlyGrowth: number }) {
  const gb = storageBytes / GB;
  const cost = gb * CREDITS_PER_GB_STORED_MONTH;
  const in6 = ((storageBytes + monthlyGrowth * 6) / GB) * CREDITS_PER_GB_STORED_MONTH;
  const in12 = ((storageBytes + monthlyGrowth * 12) / GB) * CREDITS_PER_GB_STORED_MONTH;
  const at50 = 50 * CREDITS_PER_GB_STORED_MONTH;

  return (
    <Panel title="Your plan & capacity">
      <p className="text-sm text-foreground">
        There is <strong>no fixed storage cap</strong> on your plan. File storage is metered, not quota-based: you can keep
        uploading, and what you store is billed from your credit balance. So the real question is not "how much is left" but
        "how many credits do my files cost".
      </p>

      <div className="mt-4 grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-border bg-muted/40 p-4">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">File storage — no limit</div>
          <div className="mt-2 text-2xl font-black text-foreground">{fmtBytes(storageBytes)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            PDFs, books, images and videos. Cost scales with size and with how much users download.
          </p>
        </div>
        <div className="rounded-xl border-2 border-border bg-muted/40 p-4">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Database disk — has a size</div>
          <div className="mt-2 text-2xl font-black text-foreground">{fmtBytes(dbBytes)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Grows only with records (users, courses, questions), never with uploaded files. Currently a small fraction of the
            database disk.
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        The database server size and the disk size are two separate settings — uploading more files never forces a bigger
        database server.
      </p>

      <div className="mt-5 rounded-xl border-2 border-border p-4">
        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cost estimate</div>
        <ul className="mt-3 space-y-2 text-sm text-foreground">
          <li>Today: <strong>{fmtCredits(cost)}</strong> / month ({fmtMoney(cost)}) to store {fmtBytes(storageBytes)}.</li>
          <li>In 6 months at the current pace: <strong>{fmtCredits(in6)}</strong> / month ({fmtMoney(in6)}).</li>
          <li>In 12 months: <strong>{fmtCredits(in12)}</strong> / month ({fmtMoney(in12)}).</li>
          <li>If you uploaded <strong>50 GB</strong>: about <strong>{fmtCredits(at50)}</strong> / month ({fmtMoney(at50)}) just to
            store it — plus roughly {fmtCredits(CREDITS_PER_GB_DOWNLOADED)} for every GB students actually download.</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Estimates, not a bill. Storing files is cheap; <strong>downloading</strong> them is what adds up on a course site. So far
          storage has cost you a fraction of a credit, while building the site is by far the largest share of your spend. Exact
          numbers live in Settings → Plans &amp; credit usage → Usage details.
        </p>
      </div>
    </Panel>
  );
}

function ServersPage() {
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

  const storageBytes = (data?.buckets ?? []).reduce((s, b) => s + Number(b.bytes || 0), 0);
  const fileCount = (data?.buckets ?? []).reduce((s, b) => s + Number(b.files || 0), 0);
  const dbBytes = Number(data?.db_size_bytes ?? 0);
  const total = storageBytes + dbBytes;
  const monthly = Number(data?.growth?.bytes_30d ?? 0);

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Admin · Infrastructure</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
              <Server className="h-8 w-8 text-primary" /> Servers &amp; Storage
            </h1>
            <p className="mt-2 text-muted-foreground">Everything the site is storing, and what it would take to outgrow it.</p>
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

        {!data ? (
          <p className="mt-10 text-muted-foreground">Loading server stats…</p>
        ) : (
          <>
            <section className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat icon={<HardDrive className="h-4 w-4" />} label="Files storage" value={fmtBytes(storageBytes)} hint={`${fileCount.toLocaleString()} files`} />
              <Stat icon={<Database className="h-4 w-4" />} label="Database" value={fmtBytes(dbBytes)} hint="Tables, indexes, records" />
              <Stat icon={<Server className="h-4 w-4" />} label="Total footprint" value={fmtBytes(total)} hint="Storage + database" />
              <Stat icon={<TrendingUp className="h-4 w-4" />} label="Growth / month" value={fmtBytes(monthly)} hint={`${data.growth.files_30d} new files in 30 days`} />
            </section>

            <CapacityPanel storageBytes={storageBytes} dbBytes={dbBytes} monthlyGrowth={monthly} />

            <Panel title="Storage by bucket">
              <div className="space-y-3">
                {data.buckets.map((b) => {
                  const pct = storageBytes ? (Number(b.bytes) / storageBytes) * 100 : 0;
                  return (
                    <div key={b.bucket}>
                      <div className="flex justify-between text-sm font-bold text-foreground">
                        <span>{b.bucket}</span>
                        <span>{fmtBytes(Number(b.bytes))} · {pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {Number(b.files).toLocaleString()} files · largest {fmtBytes(Number(b.largest_bytes))}
                        {b.last_upload ? ` · last upload ${new Date(b.last_upload).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Heaviest files">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                      <th className="py-2">File</th>
                      <th className="py-2">Bucket</th>
                      <th className="py-2 text-right">Size</th>
                      <th className="py-2 text-right">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.largest_files.map((f, i) => (
                      <tr key={`${f.bucket}-${f.name}-${i}`} className="border-t border-border">
                        <td className="py-2 pr-3 max-w-[320px] truncate text-foreground">{f.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{f.bucket}</td>
                        <td className="py-2 text-right font-bold text-foreground">{fmtBytes(Number(f.bytes))}</td>
                        <td className="py-2 text-right text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid md:grid-cols-2 gap-5">
              <Panel title="Largest database tables">
                <ul className="space-y-2 text-sm">
                  {data.tables.map((t) => (
                    <li key={t.name} className="flex justify-between border-b border-border pb-2 last:border-0">
                      <span className="text-foreground">{t.name}</span>
                      <span className="text-muted-foreground">
                        {fmtBytes(Number(t.bytes))} · ~{Number(t.rows).toLocaleString()} rows
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Content inventory">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(data.content).map(([k, v]) => (
                    <div key={k} className="rounded-xl border-2 border-border bg-muted/40 p-3">
                      <div className="text-2xl font-black text-foreground">{Number(v).toLocaleString()}</div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">{k.replace(/_/g, " ")}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="Should you move to outside hosting?">
              <ul className="space-y-2 text-sm text-foreground">
                <li>Current footprint: <strong>{fmtBytes(total)}</strong> ({fmtBytes(storageBytes)} files, {fmtBytes(dbBytes)} database).</li>
                <li>At the current pace you would reach about <strong>{fmtBytes(total + monthly * 6)}</strong> in 6 months and <strong>{fmtBytes(total + monthly * 12)}</strong> in 12 months.</li>
                <li>Stay on Cloud while storage stays a small share of your monthly credits — at today's size it is a rounding error next to build usage, so moving hosting would save nothing.</li>
                <li>Files are the driver here, not the database. Compressing PDFs and deleting unused files in the list above is cheaper and faster than changing hosting.</li>
                <li>The first real trigger is bandwidth, not size: once videos are watched heavily or the video bucket passes a few tens of gigabytes, move video to a dedicated video host and keep PDFs here.</li>
                <li>The second trigger is storage cost passing roughly a quarter of your monthly credit spend — until then, external hosting adds work without saving money.</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Measured {new Date(data.generated_at).toLocaleString()}.
              </p>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4" style={{ boxShadow: "0 4px 0 var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border-2 border-border bg-card p-5" style={{ boxShadow: "0 4px 0 var(--border)" }}>
      <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}