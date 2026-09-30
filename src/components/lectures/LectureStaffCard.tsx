import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, UserCog, X, Crown, Users } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getLectureHeadStaffServerFn,
  setLectureHeadStaffServerFn,
} from "@/lib/lecture-management.functions";
import { LectureOwnersModal } from "./LectureOwnersModal";

type UserHit = { id: string; username: string; full_name: string; email: string };
type Staff = { user_id: string; username: string | null; full_name: string | null; email: string | null };

/** Assign people as staff of one lecture course, designate Head of Staff, and view course owners. */
export function LectureStaffCard({
  courseId,
  canManage,
  courseTitle,
}: {
  courseId: string;
  canManage: boolean;
  courseTitle?: string;
}) {
  const getHeadStaffFn = useServerFn(getLectureHeadStaffServerFn);
  const setHeadStaffFn = useServerFn(setLectureHeadStaffServerFn);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [headUserIds, setHeadUserIds] = useState<string[]>([]);
  const [isCallerHead, setIsCallerHead] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showOwnersModal, setShowOwnersModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data, error }, headRes] = await Promise.all([
        (supabase.rpc as any)("lecture_staff_list", { _course_id: courseId }),
        getHeadStaffFn({ data: { courseId } }),
      ]);
      if (error) setErr(error.message);
      else setStaff((data as Staff[]) ?? []);

      if (headRes) {
        setHeadUserIds(headRes.headUserIds || []);
        setIsCallerHead(headRes.isCurrentCallerHead);
      }
    } catch (e: any) {
      console.warn("Failed to load staff/head info:", e);
    }
  }, [courseId, getHeadStaffFn]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canManage || query.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancel = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await (supabase.rpc as any)("search_users_for_group", {
        _query: query.trim(),
        _exclude: null,
      });
      if (!cancel) {
        setHits((data as UserHit[]) ?? []);
        setSearching(false);
      }
    }, 220);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [query, canManage]);

  async function add(userId: string) {
    setBusy(userId);
    setErr(null);
    const { error } = await (supabase.from as any)("lecture_staff").insert({
      course_id: courseId,
      user_id: userId,
    });
    setBusy(null);
    if (error && !/duplicate/i.test(error.message)) setErr(error.message);
    setQuery("");
    setHits([]);
    load();
  }

  async function remove(userId: string) {
    setBusy(userId);
    const { error } = await (supabase.from as any)("lecture_staff")
      .delete()
      .eq("course_id", courseId)
      .eq("user_id", userId);
    setBusy(null);
    if (error) setErr(error.message);
    else {
      // If was head, remove head status too
      if (headUserIds.includes(userId)) {
        try {
          await setHeadStaffFn({ data: { courseId, userId, isHead: false } });
        } catch (e) {
          console.warn("Error removing head status:", e);
        }
      }
      load();
    }
  }

  async function toggleHeadOfStaff(userId: string, currentIsHead: boolean) {
    setBusy(userId);
    try {
      await setHeadStaffFn({
        data: {
          courseId,
          userId,
          isHead: !currentIsHead,
        },
      });
      toast.success(
        !currentIsHead ? "Appointed as Head of Staff 👑" : "Removed Head of Staff status",
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update Head of Staff");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <UserCog className="text-primary" size={20} />
          <div>
            <h2 className="font-bold text-base text-foreground">Lecture Staff &amp; Leadership</h2>
            <p className="text-xs text-muted-foreground">
              Staff can edit topics, lessons, materials, questions and classes. The designated Head of Staff can view the Course Owners Dashboard.
            </p>
          </div>
        </div>

        {/* Course Owners Dashboard Button - Accessible to Admins and Head of Staff */}
        {(canManage || isCallerHead) && (
          <button
            onClick={() => setShowOwnersModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/20 transition-all shadow-2xs"
          >
            <Crown size={14} className="text-amber-600" />
            <Users size={13} />
            View Course Owners Dashboard
          </button>
        )}
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      {canManage && (
        <>
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by username or email to add to staff…"
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary transition-colors"
            />
          </div>
          {searching && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> searching…
            </div>
          )}
          {hits.length > 0 && (
            <div className="mt-2 rounded-xl border border-border bg-background divide-y divide-border max-h-48 overflow-y-auto">
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => add(h.id)}
                  disabled={busy === h.id}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{h.username}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{h.full_name || h.email}</div>
                  </div>
                  <span className="text-[11px] font-semibold text-primary shrink-0">Add to Staff →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
          <span>Staff Members ({staff.length})</span>
          {headUserIds.length > 0 && (
            <span className="text-amber-600 flex items-center gap-1 font-semibold">
              <Crown size={12} /> {headUserIds.length} Head{headUserIds.length === 1 ? "" : "s"} Assigned
            </span>
          )}
        </div>
        {staff.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-xl">
            No staff assigned to this course yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {staff.map((s) => {
              const isHead = headUserIds.includes(s.user_id);
              const isBusy = busy === s.user_id;

              return (
                <div
                  key={s.user_id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${
                    isHead ? "border-amber-500/40 bg-amber-500/5 shadow-2xs" : "border-border bg-background"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isHead ? "bg-amber-500/20 text-amber-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isHead ? <Crown size={15} /> : (s.username?.[0] || "U").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground truncate">{s.username ?? "user"}</span>
                        {isHead && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 border border-amber-500/30">
                            <Crown size={10} /> Head of Staff
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{s.full_name || s.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canManage && (
                      <button
                        onClick={() => toggleHeadOfStaff(s.user_id, isHead)}
                        disabled={isBusy}
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 ${
                          isHead
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20"
                            : "border-border text-muted-foreground hover:text-amber-600 hover:border-amber-500/30 hover:bg-amber-500/5"
                        }`}
                        title={isHead ? "Remove Head of Staff status" : "Designate as Head of Staff"}
                      >
                        {isBusy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Crown size={12} className={isHead ? "text-amber-600" : ""} />
                        )}
                        {isHead ? "Head Assigned" : "Make Head of Staff"}
                      </button>
                    )}

                    {canManage && (
                      <button
                        onClick={() => remove(s.user_id)}
                        disabled={isBusy}
                        className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="Remove from staff"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Course Owners Modal */}
      {showOwnersModal && (
        <LectureOwnersModal
          courseId={courseId}
          courseTitle={courseTitle}
          isHead={isCallerHead}
          isAdmin={canManage}
          onClose={() => setShowOwnersModal(false)}
        />
      )}
    </section>
  );
}
