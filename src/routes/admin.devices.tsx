import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Smartphone, Trash2, RotateCcw, Monitor, Tablet, Apple, ShieldAlert,
  Lock, Unlock, KeyRound, Save, Send, Users, AlertTriangle, Loader2, ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  adminListUsersAndDevices,
  adminRevokeDevice,
  adminResetUserDevices,
  adminSetDeviceLimit,
} from "@/lib/admin-users.functions";
import {
  friendlyDeviceName,
  adminGetDeviceSecurity,
  adminUpdateDeviceSecurity,
  adminSetUserLock,
  adminUnlockAndReset,
  adminListLockStates,
} from "@/lib/devices.functions";
import { scoreSharing, type RiskLevel } from "@/lib/device-risk";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/devices")({
  head: () => ({
    meta: [
      { title: "Device Security — AquaQBank" },
      {
        name: "description",
        content: "Control device limits, lock shared accounts and issue reactivation codes.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Device Security — AquaQBank" },
      { property: "og:description", content: "Device limits, account locks and reactivation codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDevicesPage,
});

type UserRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  device_limit: number;
  roles?: string[];
};
type DeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  nickname?: string | null;
  user_agent: string | null;
  platform: string | null;
  ip: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type Filter = "all" | "over" | "locked" | "flagged";

function platformIcon(p: string | null) {
  const k = (p ?? "").toLowerCase();
  if (k.includes("iphone") || k.includes("mac")) return <Apple size={14} className="text-muted-foreground" />;
  if (k.includes("ipad") || k.includes("tablet")) return <Tablet size={14} className="text-muted-foreground" />;
  if (k.includes("android") || k.includes("phone")) return <Smartphone size={14} className="text-muted-foreground" />;
  return <Monitor size={14} className="text-muted-foreground" />;
}

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  watch: "bg-amber-500/10 text-amber-700 border-amber-200",
  high: "bg-rose-500/10 text-rose-700 border-rose-200",
};

function AdminDevicesPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(adminListUsersAndDevices);
  const revoke = useServerFn(adminRevokeDevice);
  const reset = useServerFn(adminResetUserDevices);
  const setLimit = useServerFn(adminSetDeviceLimit);
  const getSecurity = useServerFn(adminGetDeviceSecurity);
  const saveSecurity = useServerFn(adminUpdateDeviceSecurity);
  const setLock = useServerFn(adminSetUserLock);
  const unlockReset = useServerFn(adminUnlockAndReset);
  const listLocks = useServerFn(adminListLockStates);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [locks, setLocks] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fetching, setFetching] = useState(true);

  const [unlockCode, setUnlockCode] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [defaultLimit, setDefaultLimit] = useState(2);
  const [attempts, setAttempts] = useState<
    { id: string; user_id: string; success: boolean; ip: string | null; created_at: string }[]
  >([]);
  const [savingSec, setSavingSec] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  async function refresh() {
    setFetching(true);
    try {
      const [res, sec, lockRes] = await Promise.all([list(), getSecurity(), listLocks()]);
      setUsers(res.users as UserRow[]);
      setDevices(res.devices as DeviceRow[]);
      setUnlockCode(sec.settings.unlock_code);
      setTelegramUrl(sec.settings.telegram_url);
      setSupportUrl(sec.settings.support_url);
      setDefaultLimit(sec.settings.default_device_limit ?? 2);
      setAttempts(sec.attempts);
      const m: Record<string, string | null> = {};
      for (const l of lockRes.locks) m[l.id] = l.locked_at;
      setLocks(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const byUser = useMemo(() => {
    const m = new Map<string, DeviceRow[]>();
    for (const d of devices) {
      const arr = m.get(d.user_id) ?? [];
      arr.push(d);
      m.set(d.user_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => +new Date(a.first_seen_at) - +new Date(b.first_seen_at));
    }
    return m;
  }, [devices]);

  const rows = useMemo(() => {
    return users.map((u) => {
      const list = byUser.get(u.id) ?? [];
      const admin = (u.roles ?? []).includes("admin");
      const risk = scoreSharing(list, u.device_limit);
      return {
        user: u,
        devices: list,
        admin,
        risk,
        locked: !!locks[u.id],
        over: !admin && list.length > u.device_limit,
      };
    });
  }, [users, byUser, locks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        !(
          r.user.full_name?.toLowerCase().includes(q) ||
          r.user.username?.toLowerCase().includes(q) ||
          r.user.email?.toLowerCase().includes(q)
        )
      )
        return false;
      if (filter === "over") return r.over;
      if (filter === "locked") return r.locked;
      if (filter === "flagged") return !r.admin && r.risk.level !== "low";
      return true;
    });
  }, [rows, query, filter]);

  const stats = useMemo(
    () => ({
      users: users.length,
      devices: devices.length,
      locked: rows.filter((r) => r.locked).length,
      flagged: rows.filter((r) => !r.admin && r.risk.level !== "low").length,
    }),
    [users, devices, rows],
  );

  async function handleRevoke(id: string) {
    try {
      await revoke({ data: { deviceRowId: id } });
      setDevices((p) => p.filter((d) => d.id !== id));
      toast.success("Device revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleReset(uid: string) {
    try {
      await reset({ data: { userId: uid } });
      setDevices((p) => p.filter((d) => d.user_id !== uid));
      toast.success("Devices reset to 0");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleUnlockReset(uid: string) {
    try {
      await unlockReset({ data: { userId: uid } });
      setDevices((p) => p.filter((d) => d.user_id !== uid));
      setLocks((p) => ({ ...p, [uid]: null }));
      toast.success("Account reactivated and devices cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleLock(uid: string, locked: boolean) {
    try {
      await setLock({ data: { userId: uid, locked } });
      setLocks((p) => ({ ...p, [uid]: locked ? new Date().toISOString() : null }));
      toast.success(locked ? "Account locked" : "Account unlocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleLimit(uid: string, n: number) {
    try {
      await setLimit({ data: { userId: uid, limit: n } });
      setUsers((p) => p.map((u) => (u.id === uid ? { ...u, device_limit: n } : u)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleSaveSecurity(applyToAll = false) {
    setSavingSec(true);
    try {
      await saveSecurity({
        data: { unlockCode, telegramUrl, supportUrl, defaultLimit, applyToAll },
      });
      toast.success(
        applyToAll
          ? `All accounts now follow the global limit of ${defaultLimit}`
          : "Security settings saved",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSec(false);
    }
  }

  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.username || u?.full_name || u?.email || id.slice(0, 8);
  };

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 grid place-items-center">
            <ShieldCheck size={22} className="text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Device Security</h1>
        </div>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Cap how many devices each account can use, lock accounts that are being shared, and hand
          out reactivation codes after the student contacts you.
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Users size={16} />} label="Users" value={stats.users} />
          <StatCard icon={<Smartphone size={16} />} label="Devices" value={stats.devices} />
          <StatCard icon={<Lock size={16} />} label="Locked" value={stats.locked} tone="rose" />
          <StatCard icon={<AlertTriangle size={16} />} label="Flagged" value={stats.flagged} tone="amber" />
        </div>

        {/* Reactivation code settings */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-primary" />
            <h2 className="font-bold">Reactivation code & contact links</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Locked students see the contact links below. When they message you and you verify them,
            give them this code — it clears their devices back to 0 and unlocks the account.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="text-xs font-semibold text-muted-foreground">
              Default device limit (all users)
              <input
                type="number"
                min={1}
                max={50}
                value={defaultLimit}
                onChange={(e) => setDefaultLimit(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Unlock code
              <input
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Telegram link
              <input
                value={telegramUrl}
                onChange={(e) => setTelegramUrl(e.target.value)}
                placeholder="https://t.me/yourchannel"
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Contact-us link
              <input
                value={supportUrl}
                onChange={(e) => setSupportUrl(e.target.value)}
                placeholder="https://wa.me/…"
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleSaveSecurity(false)}
              disabled={savingSec}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingSec ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Reset every account to the global limit of ${defaultLimit} devices? Personal limits you set for individual users will be cleared.`,
                  )
                )
                  handleSaveSecurity(true);
              }}
              disabled={savingSec}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
            >
              Apply to all users
            </button>
            <span className="text-xs text-muted-foreground">
              Individual overrides below always win over the global limit.
            </span>
          </div>
        </section>

        {/* Search + filters */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, or email…"
            className="w-full rounded-xl border border-border bg-card pl-11 pr-4 py-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {(
            [
              ["all", "All"],
              ["over", "Over limit"],
              ["locked", "Locked"],
              ["flagged", "Sharing risk"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold border transition ${
                filter === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {fetching ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No users found.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map(({ user: u, devices: userDevices, admin, risk, locked, over }) => {
                const isOpen = !!expanded[u.id];
                return (
                  <li key={u.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [u.id]: !isOpen }))}
                        className="flex-1 min-w-[200px] text-left"
                      >
                        <div className="font-semibold flex items-center gap-2">
                          {u.full_name || u.username || u.email}
                          {admin && (
                            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                              ADMIN · unlimited
                            </span>
                          )}
                          {locked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-700 px-2 py-0.5 text-[10px] font-bold">
                              <Lock size={10} /> LOCKED
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.username} · {u.email}
                        </div>
                      </button>

                      {!admin && (
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${RISK_STYLE[risk.level]}`}
                          title={risk.reasons.join(" · ") || "No sharing signals"}
                        >
                          <ShieldAlert size={12} />
                          {risk.level === "low" ? "Low risk" : risk.level === "watch" ? "Watch" : "High risk"}
                        </div>
                      )}

                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                          over
                            ? "bg-rose-500/10 text-rose-700 border-rose-200"
                            : "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        <Smartphone size={12} />
                        {userDevices.length} / {admin ? "∞" : u.device_limit}
                      </div>

                      {!admin && (
                        <label className="text-xs text-muted-foreground inline-flex items-center gap-2">
                          Limit
                          <input
                            type="number"
                            min={1}
                            max={20}
                            defaultValue={u.device_limit}
                            onBlur={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v) && v !== u.device_limit) handleLimit(u.id, v);
                            }}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                          />
                        </label>
                      )}

                      <button
                        onClick={() => (locked ? handleUnlockReset(u.id) : handleReset(u.id))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        <RotateCcw size={13} />
                        {locked ? "Unlock + reset" : "Reset devices"}
                      </button>

                      {!admin && (
                        <button
                          onClick={() => handleLock(u.id, !locked)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            locked
                              ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              : "border-rose-200 text-rose-700 hover:bg-rose-50"
                          }`}
                        >
                          {locked ? <Unlock size={13} /> : <Lock size={13} />}
                          {locked ? "Unlock" : "Lock"}
                        </button>
                      )}
                    </div>

                    {!admin && risk.reasons.length > 0 && (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {risk.reasons.join(" · ")}
                      </div>
                    )}

                    {isOpen && (
                      <div className="mt-4 rounded-xl border border-border bg-muted/40 overflow-hidden">
                        {userDevices.length === 0 ? (
                          <div className="p-4 text-xs text-muted-foreground">No devices recorded yet.</div>
                        ) : (
                          <ul className="divide-y divide-border">
                            {userDevices.map((d, i) => (
                              <li
                                key={d.id}
                                className="px-4 py-3 grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto] gap-3 items-center text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  {platformIcon(d.platform)}
                                  <span className="font-semibold">
                                    {d.nickname || friendlyDeviceName(d.user_agent, d.platform)}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      admin || i < u.device_limit
                                        ? "bg-emerald-500/10 text-emerald-700"
                                        : "bg-amber-500/10 text-amber-700"
                                    }`}
                                  >
                                    {admin || i < u.device_limit ? `Slot ${i + 1}` : "Over limit"}
                                  </span>
                                </div>
                                <div
                                  className="text-xs text-muted-foreground truncate"
                                  title={d.user_agent ?? ""}
                                >
                                  {d.user_agent ?? "—"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <div>IP: {d.ip ?? "—"}</div>
                                  <div>Last: {fmt(d.last_seen_at)}</div>
                                </div>
                                <button
                                  onClick={() => handleRevoke(d.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-card px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 size={13} /> Revoke
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Unlock history */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Send size={16} className="text-primary" />
            <h2 className="font-bold">Recent reactivation attempts</h2>
          </div>
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No code has been used yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {attempts.map((a) => (
                <li key={a.id} className="py-2.5 flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      a.success
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-rose-500/10 text-rose-700"
                    }`}
                  >
                    {a.success ? "Unlocked" : "Wrong code"}
                  </span>
                  <span className="font-semibold">{nameOf(a.user_id)}</span>
                  <span className="text-xs text-muted-foreground">{a.ip ?? "—"}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmt(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-4 text-xs text-muted-foreground">
          {filtered.length} user{filtered.length === 1 ? "" : "s"} shown · {devices.length} total devices
        </p>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "rose" | "amber";
}) {
  const toneCls =
    tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex items-center gap-2 text-xs font-semibold ${toneCls}`}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}
