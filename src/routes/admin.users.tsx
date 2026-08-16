import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Check,
  X,
  Pencil,
  Shield,
  UserCog,
  Users as UsersIcon,
  Copy,
  Info,
  History,
  Undo2,
  Ban,
  MailCheck,
  MailWarning,
  Crown,
  Star,

} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListUsersAndDevices,
  adminSetUserPhone,
  adminSetEmailVerified,
  adminResendConfirmation,
  type AdminUserRow,
} from "@/lib/admin-users.functions";
import { toast } from "sonner";
import { UserModerationDialog } from "@/components/admin/UserModerationDialog";
import { UserEditDialog } from "@/components/admin/UserEditDialog";


export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — AquaQBank" },
      {
        name: "description",
        content:
          "Manage every registered account and grant Admin or لجنة الطب والجراحة permissions.",
      },
    ],
  }),
  component: AdminUsersPage,
});

type RoleKey = "admin" | "committee" | "committee_head" | "golden";
type Filter = "all" | "admin" | "committee" | "committee_head" | "golden" | "none" | "unverified";

const ROLE_LABEL: Record<RoleKey, string> = {
  admin: "Admin",
  committee: "لجنة الطب والجراحة",
  committee_head: "رئيس لجنة الطب والجراحة",
  golden: "Golden account",
};

function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(adminListUsersAndDevices);
  const setPhoneFn = useServerFn(adminSetUserPhone);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [moderating, setModerating] = useState<AdminUserRow | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [busyVerify, setBusyVerify] = useState<string | null>(null);
  const verifyFn = useServerFn(adminSetEmailVerified);
  const resendFn = useServerFn(adminResendConfirmation);
  const [recent, setRecent] = useState<
    { userId: string; name: string; role: RoleKey; granted: boolean }[]
  >([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    setFetching(true);
    listFn()
      .then((res) => setUsers(res.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "admin" && !u.roles.includes("admin")) return false;
      if (filter === "committee" && !u.roles.includes("committee")) return false;
      if (filter === "committee_head" && !u.roles.includes("committee_head")) return false;
      if (filter === "golden" && !u.roles.includes("golden")) return false;
      if (filter === "none" && u.roles.length > 0) return false;
      if (filter === "unverified" && u.email_confirmed_at) return false;
      if (!q) return true;
      return (
        !!u.full_name?.toLowerCase().includes(q) ||
        !!u.username?.toLowerCase().includes(q) ||
        !!u.email?.toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, query, filter]);

  const counts = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((u) => u.roles.includes("admin")).length,
      committee: users.filter((u) => u.roles.includes("committee")).length,
      heads: users.filter((u) => u.roles.includes("committee_head")).length,
      golden: users.filter((u) => u.roles.includes("golden")).length,
    }),
    [users],
  );

  async function toggleRole(u: AdminUserRow, role: RoleKey) {
    const has = u.roles.includes(role);
    if (has && role === "admin" && u.id === user?.id) {
      toast.error("You can't remove your own Admin role.");
      return;
    }
    const key = `${u.id}:${role}`;
    setBusyRole(key);
    // optimistic
    setUsers((prev) =>
      prev.map((x) =>
        x.id === u.id
          ? { ...x, roles: has ? x.roles.filter((r) => r !== role) : [...x.roles, role] }
          : x,
      ),
    );
    const { error: rpcError } = has
      ? await supabase.rpc("admin_revoke_role", { _user_id: u.id, _role: role })
      : await supabase.rpc("admin_grant_role", { _user_id: u.id, _role: role });
    setBusyRole(null);
    if (rpcError) {
      // rollback
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, roles: has ? [...x.roles, role] : x.roles.filter((r) => r !== role) }
            : x,
        ),
      );
      toast.error(rpcError.message);
      return;
    }
    const name = u.full_name || u.username || u.email || "User";
    setRecent((prev) =>
      [{ userId: u.id, name, role, granted: !has }, ...prev.filter((r) => !(r.userId === u.id && r.role === role))].slice(0, 5),
    );
    toast.success(
      has ? `Removed ${ROLE_LABEL[role]} from ${name}` : `${name} is now ${ROLE_LABEL[role]}`,
    );
  }

  async function verifyUser(u: AdminUserRow) {
    setBusyVerify(u.id);
    try {
      const res = await verifyFn({ data: { userId: u.id, verified: true } });
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, email_confirmed_at: res.email_confirmed_at ?? new Date().toISOString() }
            : x,
        ),
      );
      toast.success("Email marked as verified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not verify this email");
    } finally {
      setBusyVerify(null);
    }
  }

  async function resendConfirmation(u: AdminUserRow) {
    setBusyVerify(u.id);
    try {
      await resendFn({
        data: {
          userId: u.id,
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      toast.success("Confirmation email sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setBusyVerify(null);
    }
  }

  async function savePhone(userId: string) {
    setSavingPhone(true);
    try {
      const res = await setPhoneFn({ data: { userId, phone: phoneDraft } });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, phone: res.phone } : u)),
      );
      setEditingPhone(null);
      toast.success("Phone updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update phone");
    } finally {
      setSavingPhone(false);
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-muted/40" />;

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 inline-flex items-center gap-3">
            <UsersIcon size={30} className="text-primary" /> Users &amp; Roles
          </h1>
          <p className="text-muted-foreground">
            Every registered account in one place — search, edit phone numbers, and give people
            permissions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Stat label="Users" value={counts.total} />
          <Stat label="Admins" value={counts.admins} />
          <Stat label="لجنة الطب والجراحة" value={counts.committee} />
          <Stat label="Golden accounts" value={counts.golden} />
        </div>

        <div className="mb-6 rounded-2xl border border-border bg-card p-4 flex gap-3">
          <Info size={18} className="text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">What can each role do?</span>{" "}
            <span className="font-semibold text-foreground">Admin</span> controls the whole
            administration site.{" "}
            <span className="font-semibold text-foreground">لجنة الطب والجراحة</span> can only add,
            edit and upload years, semesters, subjects and resources inside the Committee section —
            nothing else.
            {" "}
            <span className="font-semibold text-foreground">Golden account</span> is a normal member
            who gets every paid course and lecture for free — no admin access.
          </div>
        </div>

        <div className="relative mb-3">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, email, or phone…"
            className="w-full rounded-xl border border-border bg-card pl-11 pr-4 py-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {([
            ["all", "All"],
            ["admin", "Admins"],
            ["committee", "لجنة الطب والجراحة"],
            ["golden", "Golden accounts"],
            ["none", "No role"],
            ["unverified", "Not verified"],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="mb-6 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border text-sm font-semibold inline-flex items-center gap-2">
              <History size={15} /> Recent role changes
            </div>
            <ul className="divide-y divide-border">
              {recent.map((r, i) => {
                const target = users.find((u) => u.id === r.userId);
                return (
                  <li key={`${r.userId}-${r.role}-${i}`} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {r.granted ? "granted" : "removed"} {ROLE_LABEL[r.role]}
                      </span>
                    </span>
                    {target && (
                      <button
                        onClick={() => toggleRole(target, r.role)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Undo2 size={13} /> Undo
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {fetching ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No users found.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((u) => {
                const isEditing = editingPhone === u.id;
                const initial = (u.full_name || u.username || u.email || "?")
                  .trim()
                  .charAt(0)
                  .toUpperCase();
                return (
                  <li key={u.id} className="px-5 py-4 text-sm">
                    <div className="flex items-start gap-4">
                      <div className="grid place-items-center h-10 w-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{u.full_name || u.username}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{u.username}
                          {u.email ? ` · ${u.email}` : ""}
                        </div>
                      </div>
                      {u.locked_at && (
                        <span className="shrink-0 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          {u.lock_kind === "suspend" ? "Stopped" : "Blocked"}
                        </span>
                      )}
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                          u.email_confirmed_at
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {u.email_confirmed_at ? <MailCheck size={12} /> : <MailWarning size={12} />}
                        {u.email_confirmed_at ? "Verified" : "Not verified"}
                      </span>
                      {!u.email_confirmed_at && (
                        <>
                          <button
                            disabled={busyVerify === u.id}
                            onClick={() => verifyUser(u)}
                            className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 disabled:opacity-60"
                          >
                            Verify now
                          </button>
                          <button
                            disabled={busyVerify === u.id}
                            onClick={() => resendConfirmation(u)}
                            className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-60"
                          >
                            Resend
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setEditingUser(u)}
                        className="shrink-0 grid place-items-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-primary"
                        aria-label="Edit user details"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setModerating(u)}
                        className="shrink-0 grid place-items-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-red-600"
                        aria-label="Block or delete account"
                      >
                        <Ban size={14} />
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(u.email || u.username || "");
                          toast.success("Copied");
                        }}
                        className="shrink-0 grid place-items-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                        aria-label="Copy email"
                      >
                        <Copy size={14} />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
                      <RoleChip
                        label={ROLE_LABEL.admin}
                        icon={<Shield size={13} />}
                        active={u.roles.includes("admin")}
                        busy={busyRole === `${u.id}:admin`}
                        onClick={() => toggleRole(u, "admin")}
                      />
                      <RoleChip
                        label={ROLE_LABEL.committee}
                        icon={<UserCog size={13} />}
                        active={u.roles.includes("committee")}
                        busy={busyRole === `${u.id}:committee`}
                        onClick={() => toggleRole(u, "committee")}
                      />
                      <RoleChip
                        label={ROLE_LABEL.committee_head}
                        icon={<Star size={13} />}
                        active={u.roles.includes("committee_head")}
                        busy={busyRole === `${u.id}:committee_head`}
                        onClick={() => toggleRole(u, "committee_head")}
                      />
                      <RoleChip
                        label={ROLE_LABEL.golden}
                        icon={<Crown size={13} />}
                        active={u.roles.includes("golden")}
                        busy={busyRole === `${u.id}:golden`}
                        onClick={() => toggleRole(u, "golden")}
                      />
                      <span className="text-xs text-muted-foreground ms-auto">Phone:</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={phoneDraft}
                            onChange={(e) => setPhoneDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") savePhone(u.id);
                              if (e.key === "Escape") setEditingPhone(null);
                            }}
                            placeholder="+374…"
                            className="min-w-0 w-40 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                          />
                          <button
                            disabled={savingPhone}
                            onClick={() => savePhone(u.id)}
                            className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingPhone(null)}
                            className="grid place-items-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-muted"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingPhone(u.id);
                            setPhoneDraft(u.phone ?? "");
                          }}
                          className="inline-flex items-center gap-1.5 font-medium text-left hover:text-primary"
                        >
                          {u.phone || <span className="text-muted-foreground">— add</span>}
                          <Pencil size={11} className="opacity-40" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Showing {filtered.length} of {users.length} users
        </p>

        {moderating && (
          <UserModerationDialog
            user={moderating}
            onClose={() => setModerating(null)}
            onDone={(patch) => {
              setUsers((prev) =>
                patch === "deleted"
                  ? prev.filter((x) => x.id !== moderating.id)
                  : prev.map((x) => (x.id === moderating.id ? { ...x, ...patch } : x)),
              );
            }}
          />
        )}

        {editingUser && (
          <UserEditDialog
            user={editingUser}
            isSelf={editingUser.id === user?.id}
            onClose={() => setEditingUser(null)}
            onSaved={(patch) => {
              setUsers((prev) =>
                prev.map((x) => (x.id === editingUser.id ? { ...x, ...patch } : x)),
              );
            }}
          />
        )}

      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-border bg-card px-4 py-1.5 text-xs">
      <span className="font-bold text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function RoleChip({
  label,
  icon,
  active,
  busy,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
      }`}
    >
      {icon}
      {active ? `✓ ${label}` : `+ ${label}`}
    </button>
  );
}
