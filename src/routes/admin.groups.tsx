import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Users, Search, X, Megaphone, Copy } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  GROUP_COLORS,
  GROUP_KINDS,
  addMember,
  createGroup,
  deleteGroup,
  removeMember,
  searchUsers,
  updateGroup,
  useGroupCounts,
  useGroupMembers,
  useUserGroups,
  type GroupKind,
  type UserGroup,
} from "@/lib/user-groups";

export const Route = createFileRoute("/admin/groups")({
  head: () => ({
    meta: [
      { title: "Groups — Administration Site" },
      {
        name: "description",
        content: "Build audience groups of users and target announcements at exactly the people you choose.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Groups — Administration Site" },
      { property: "og:description", content: "Target announcements at specific groups of users." },
    ],
  }),
  component: AdminGroups,
});

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm text-foreground";

function AdminGroups() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { data: groups, refetch, isLoading } = useUserGroups();
  const { data: counts, refetch: refetchCounts } = useGroupCounts();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  async function add() {
    const n = name.trim();
    if (!n) return toast.error("Give the group a name first");
    try {
      await createGroup(n);
      setName("");
      refetch();
      refetchCounts();
      toast.success("Group created");
    } catch (e: any) {
      toast.error(e?.message || "Could not create the group");
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administration Site
        </Link>
        <h1 className="mt-6 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
          <Users size={26} className="text-primary" /> Groups
        </h1>
        <p className="mt-2 text-muted-foreground">
          Put people into groups, then aim an announcement at just those groups. Hand-pick members,
          or let a group fill itself automatically (all users, admins, buyers of a course…).
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="New group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button onClick={add} className="btn-chunky">
            <Plus size={14} /> Create group
          </button>
        </div>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !groups?.length && (
          <p className="mt-6 text-sm text-muted-foreground">No groups yet — create your first one above.</p>
        )}

        <div className="mt-6 space-y-4">
          {(groups ?? []).map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              count={counts?.[g.id]}
              open={openId === g.id}
              onToggle={() => setOpenId(openId === g.id ? null : g.id)}
              onChanged={() => {
                refetch();
                refetchCounts();
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function useCourseOptions() {
  return useQuery({
    queryKey: ["admin-group-course-options"],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        (supabase.from as any)("courses").select("id,title").order("title"),
        (supabase.from as any)("packages").select("id,name").order("name"),
      ]);
      return {
        courses: (c.data ?? []) as { id: string; title: string }[],
        packages: (p.data ?? []) as { id: string; name: string }[],
      };
    },
  });
}

function GroupCard({
  group,
  count,
  open,
  onToggle,
  onChanged,
}: {
  group: UserGroup;
  count: number | undefined;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { data: options } = useCourseOptions();

  async function patch(values: Partial<UserGroup>) {
    try {
      await updateGroup(group.id, values);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    }
  }

  async function remove() {
    try {
      await deleteGroup(group.id);
      onChanged();
      toast.success("Group deleted");
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    }
  }

  const kind = GROUP_KINDS.find((k) => k.id === group.kind);

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4" style={{ boxShadow: "0 4px 0 var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: group.color }} />
        <input
          className={`${inputCls} max-w-[220px]`}
          defaultValue={group.name}
          onBlur={(e) => e.target.value !== group.name && patch({ name: e.target.value })}
        />
        <span className="rounded-full border-2 border-border px-3 py-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
          {count === undefined ? "…" : `${count} ${count === 1 ? "person" : "people"}`}
        </span>
        <button
          onClick={onToggle}
          className="rounded-full border-2 border-border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-foreground"
        >
          {open ? "Close" : "Manage"}
        </button>
        <Link
          to="/admin/theme"
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary/50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary"
        >
          <Megaphone size={12} /> Announce
        </Link>
        <button
          onClick={remove}
          className="ms-auto inline-flex items-center gap-1.5 rounded-full border-2 border-destructive/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-destructive"
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5 border-t-2 border-border pt-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">How it fills</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {GROUP_KINDS.map((k) => (
                <button
                  key={k.id}
                  title={k.note}
                  onClick={() => patch({ kind: k.id as GroupKind })}
                  className={`rounded-full border-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${
                    group.kind === k.id ? "border-primary text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {k.name}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{kind?.note}</p>
          </div>

          {group.kind === "course_owners" && (
            <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
              Course
              <select
                className={`${inputCls} mt-1`}
                value={group.course_id ?? ""}
                onChange={(e) => patch({ course_id: e.target.value || null })}
              >
                <option value="">Pick a course…</option>
                {(options?.courses ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
          )}

          {group.kind === "package_owners" && (
            <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
              Package
              <select
                className={`${inputCls} mt-1`}
                value={group.package_id ?? ""}
                onChange={(e) => patch({ package_id: e.target.value || null })}
              >
                <option value="">Pick a package…</option>
                {(options?.packages ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

          <div>
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Colour</p>
            <div className="mt-2 flex items-center gap-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Colour ${c}`}
                  onClick={() => patch({ color: c })}
                  className={`h-6 w-6 rounded-full border-2 ${group.color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <MemberManager groupId={group.id} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function MemberManager({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const { data: members, refetch } = useGroupMembers(groupId);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; full_name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const memberIds = useMemo(() => new Set((members ?? []).map((m) => m.user_id)), [members]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchUsers(term);
        if (!cancelled) setResults(rows);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || "Search failed");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  async function add(userId: string) {
    try {
      await addMember(groupId, userId);
      refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not add");
    }
  }

  async function drop(userId: string) {
    try {
      await removeMember(groupId, userId);
      refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    }
  }

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
        Hand-picked members
      </p>
      <div className="relative mt-2 max-w-md">
        <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className={`${inputCls} ps-9`}
          placeholder="Search by name, username or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {searching && <p className="mt-2 text-xs text-muted-foreground">Searching…</p>}

      {!!results.length && (
        <div className="mt-2 max-w-md space-y-1.5 rounded-xl border-2 border-border bg-background p-2">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-foreground">
                <span className="font-bold">{r.full_name || r.username}</span>{" "}
                <span className="text-muted-foreground">@{r.username}</span>
              </span>
              {memberIds.has(r.id) ? (
                <span className="text-[11px] font-black uppercase text-muted-foreground">Added</span>
              ) : (
                <button
                  onClick={() => add(r.id)}
                  className="rounded-full border-2 border-primary/50 px-2.5 py-1 text-[11px] font-black uppercase text-primary"
                >
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(members ?? []).map((m) => (
          <span
            key={m.user_id}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-background px-3 py-1 text-xs font-bold text-foreground"
          >
            {m.full_name || m.username}
            <button
              type="button"
              aria-label={`Copy ${m.email ?? ""}`}
              onClick={() => {
                navigator.clipboard?.writeText(m.email ?? m.username ?? "");
                toast.success("Copied");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy size={11} />
            </button>
            <button
              type="button"
              aria-label={`Remove ${m.username ?? ""}`}
              onClick={() => drop(m.user_id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!members?.length && (
          <p className="text-xs text-muted-foreground">Nobody hand-picked yet.</p>
        )}
      </div>
    </div>
  );
}
