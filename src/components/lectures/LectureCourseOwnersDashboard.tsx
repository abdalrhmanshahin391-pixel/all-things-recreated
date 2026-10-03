import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  Loader2,
  Crown,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  GraduationCap,
  Shield,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listLectureCourseOwnersServerFn,
  grantLectureCourseAccessServerFn,
  revokeLectureCourseAccessServerFn,
  type AnonymousLectureMember,
  type LectureCourseOwner,
  type LectureMemberSource,
} from "@/lib/lecture-management.functions";

const SOURCE_LABELS: Record<LectureMemberSource, string> = {
  purchase: "Purchased",
  golden: "Golden membership",
  coupon: "Coupon",
  package: "Package",
  granted: "Granted by staff",
};

type UserHit = { id: string; username: string; full_name: string; email: string };

interface Props {
  courseId: string;
  courseTitle?: string;
  isHead?: boolean;
  isAdmin?: boolean;
  onClose?: () => void;
}

export function LectureCourseOwnersDashboard({
  courseId,
  courseTitle,
  isHead = false,
  isAdmin = false,
  onClose,
}: Props) {
  const listOwnersFn = useServerFn(listLectureCourseOwnersServerFn);
  const grantAccessFn = useServerFn(grantLectureCourseAccessServerFn);
  const revokeAccessFn = useServerFn(revokeLectureCourseAccessServerFn);

  const [owners, setOwners] = useState<LectureCourseOwner[]>([]);
  // Course owners (Head of Staff) never see who the students are: only a count and how each got the course.
  const [anonymous, setAnonymous] = useState(!isAdmin);
  const [members, setMembers] = useState<AnonymousLectureMember[]>([]);
  const [breakdown, setBreakdown] = useState<Record<LectureMemberSource, number> | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Granting access state
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserHit | null>(null);
  const [grantReason, setGrantReason] = useState("");
  const [granting, setGranting] = useState(false);

  // Revoking state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadOwners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOwnersFn({ data: { courseId } });
      setOwners(res.owners ?? []);
      setAnonymous(Boolean(res.anonymous));
      setMembers(res.members ?? []);
      setBreakdown(res.breakdown ?? null);
      setTotalCount(res.totalCount ?? 0);
    } catch (err: any) {
      console.error("Failed to load course owners:", err);
      setError(err?.message || "Failed to load course owners");
    } finally {
      setLoading(false);
    }
  }, [courseId, listOwnersFn]);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  // Search users for granting access
  useEffect(() => {
    if (!showGrantModal || userSearch.trim().length < 2) {
      setUserHits([]);
      return;
    }
    let cancelled = false;
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await (supabase.rpc as any)("search_users_for_group", {
          _query: userSearch.trim(),
          _exclude: null,
        });
        if (!cancelled) {
          // Filter out users already enrolled
          const existingIds = new Set(owners.map((o) => o.user_id));
          const filtered = ((data as UserHit[]) ?? []).filter((u) => !existingIds.has(u.id));
          setUserHits(filtered);
        }
      } catch (err) {
        console.warn("User search error:", err);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userSearch, showGrantModal, owners]);

  async function handleGrantAccess() {
    if (!selectedUser) return;
    setGranting(true);
    try {
      await grantAccessFn({
        data: {
          courseId,
          targetUserId: selectedUser.id,
          reason: grantReason.trim() || undefined,
        },
      });
      toast.success(`Access granted to ${selectedUser.username || selectedUser.email}!`);
      setShowGrantModal(false);
      setSelectedUser(null);
      setUserSearch("");
      setGrantReason("");
      loadOwners();
    } catch (err: any) {
      toast.error(err?.message || "Failed to grant access");
    } finally {
      setGranting(false);
    }
  }

  async function handleRevokeAccess(owner: LectureCourseOwner) {
    const name = owner.full_name || owner.username || owner.email || "this student";
    if (!confirm(`Are you sure you want to revoke course access from ${name}?`)) return;

    setRevokingId(owner.user_id);
    try {
      await revokeAccessFn({
        data: {
          courseId,
          targetUserId: owner.user_id,
        },
      });
      toast.success(`Access revoked for ${name}`);
      setOwners((prev) => prev.filter((o) => o.user_id !== owner.user_id));
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke access");
    } finally {
      setRevokingId(null);
    }
  }

  const filteredOwners = useMemo(() => {
    if (!searchQuery.trim()) return owners;
    const q = searchQuery.toLowerCase().trim();
    return owners.filter(
      (o) =>
        (o.username && o.username.toLowerCase().includes(q)) ||
        (o.full_name && o.full_name.toLowerCase().includes(q)) ||
        (o.email && o.email.toLowerCase().includes(q)) ||
        (o.granted_reason && o.granted_reason.toLowerCase().includes(q)),
    );
  }, [owners, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-12 w-12 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Crown size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg md:text-xl text-foreground">
                {anonymous ? "Course members" : "Course Owners & Enrolled Students"}
              </h2>
              {isHead && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30">
                  <Crown size={12} /> Head of Staff View
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {anonymous
                ? `How many students are in ${courseTitle ? `"${courseTitle}"` : "this lecture course"} and how they got it. Student identities are private.`
                : `Roster of students with active ownership of ${courseTitle ? `"${courseTitle}"` : "this lecture course"}.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadOwners()}
            disabled={loading}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          {!anonymous && (
            <button
              onClick={() => setShowGrantModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-xs"
            >
              <UserPlus size={14} /> Grant Student Access
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Anonymous summary for course owners: totals by how the student got the course, no identities */}
      {anonymous && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-border bg-card col-span-2 sm:col-span-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total students</div>
              <div className="text-3xl font-black text-foreground mt-1 tabular-nums">{loading ? "…" : totalCount}</div>
            </div>
            {(Object.keys(SOURCE_LABELS) as LectureMemberSource[]).map((key) => (
              <div key={key} className="p-4 rounded-xl border border-border bg-card">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{SOURCE_LABELS[key]}</div>
                <div className="text-2xl font-black text-foreground mt-1 tabular-nums">{loading ? "…" : (breakdown?.[key] ?? 0)}</div>
              </div>
            ))}
          </div>

          {error && (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No students own this course yet.</div>
            ) : (
              <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
                {members.map((m, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <span className="h-7 w-7 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs">
                        <Users size={13} />
                      </span>
                      {m.label}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                      {SOURCE_LABELS[m.source]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Stats, search and the full roster (site admins only) */}
      {!anonymous && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Enrolled Students
          </div>
          <div className="text-2xl font-black text-foreground mt-1 tabular-nums">{owners.length}</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Standard Purchases
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
            {owners.filter((o) => !o.granted_reason || o.granted_reason === "purchase" || o.granted_reason === "checkout").length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Staff / Special Grants
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
            {owners.filter((o) => Boolean(o.granted_reason) && o.granted_reason !== "purchase" && o.granted_reason !== "checkout").length}
          </div>
        </div>
      </div>

      {/* Filter / Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter students by username, full name, or email..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Owners roster table / cards */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-xs">Loading course owners dashboard...</p>
          </div>
        ) : filteredOwners.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <GraduationCap size={32} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground">No students found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery ? "No enrolled students match your search." : "No students currently own this lecture course."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredOwners.map((owner) => {
              const isRevoking = revokingId === owner.user_id;
              const dateStr = owner.granted_at
                ? new Date(owner.granted_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "—";

              return (
                <div
                  key={owner.user_id}
                  className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
                      {owner.avatar_url ? (
                        <img
                          src={owner.avatar_url}
                          alt={owner.username || "student"}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        (owner.username?.[0] || owner.full_name?.[0] || "U").toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate">
                          {owner.full_name || owner.username || "Anonymous Student"}
                        </span>
                        {owner.username && owner.full_name && (
                          <span className="text-xs text-muted-foreground truncate">
                            (@{owner.username})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {owner.email || "No email on record"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar size={13} />
                      <span>{dateStr}</span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                        !owner.granted_reason || owner.granted_reason === "purchase" || owner.granted_reason === "checkout"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : owner.granted_reason === "golden"
                          ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                      }`}
                    >
                      {owner.granted_reason || "Purchased"}
                    </span>

                    <button
                      onClick={() => handleRevokeAccess(owner)}
                      disabled={isRevoking}
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Revoke course access"
                    >
                      {isRevoking ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>
      )}

      {/* Grant Student Access Modal */}
      {!anonymous && showGrantModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-primary" />
                <h3 className="font-bold text-base text-foreground">Grant Student Course Access</h3>
              </div>
              <button
                onClick={() => {
                  setShowGrantModal(false);
                  setSelectedUser(null);
                }}
                className="h-7 w-7 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Search by username or email to give a student immediate ownership of this course.
            </p>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search username or email..."
                className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:border-primary"
              />
              {searchingUsers && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                </div>
              )}
            </div>

            {userHits.length > 0 && !selectedUser && (
              <div className="rounded-xl border border-border bg-background divide-y divide-border max-h-48 overflow-y-auto">
                {userHits.map((hit) => (
                  <button
                    key={hit.id}
                    onClick={() => {
                      setSelectedUser(hit);
                      setUserSearch(hit.username || hit.email);
                    }}
                    className="w-full p-2.5 text-left hover:bg-muted flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-bold text-foreground">{hit.username}</div>
                      <div className="text-[11px] text-muted-foreground">{hit.full_name || hit.email}</div>
                    </div>
                    <span className="text-xs font-bold text-primary">Select →</span>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
                  <span>Selected Student:</span>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="text-muted-foreground hover:text-destructive underline text-[11px]"
                  >
                    Change
                  </button>
                </div>
                <div className="text-sm font-bold text-foreground">{selectedUser.username}</div>
                <div className="text-xs text-muted-foreground">{selectedUser.email || selectedUser.full_name}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                Grant Reason / Note (Optional)
              </label>
              <input
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="e.g. Scholarship, Group enrollment, Special grant"
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setShowGrantModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantAccess}
                disabled={!selectedUser || granting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {granting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Confirm &amp; Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
