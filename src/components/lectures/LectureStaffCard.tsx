import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, UserCog, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type UserHit = { id: string; username: string; full_name: string; email: string };
type Staff = { user_id: string; username: string | null; full_name: string | null; email: string | null };

/** Assign people as staff of one lecture course (admins only). */
export function LectureStaffCard({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("lecture_staff_list", { _course_id: courseId });
    if (error) setErr(error.message);
    else setStaff((data as Staff[]) ?? []);
  }, [courseId]);

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
    else load();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-1">
        <UserCog className="text-primary" size={18} />
        <h2 className="font-semibold text-sm text-foreground">Lecture staff</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Staff can edit this course's topics, lessons, materials, questions and classes — nothing else.
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      {canManage && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username or email…"
              className="w-full pl-9 pr-3 py-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-accent"
            />
          </div>
          {searching && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> searching…
            </div>
          )}
          {hits.length > 0 && (
            <div className="mt-2 rounded-md border border-border bg-background divide-y divide-border max-h-48 overflow-y-auto">
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => add(h.id)}
                  disabled={busy === h.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{h.username}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{h.full_name || h.email}</div>
                  </div>
                  <span className="text-[11px] font-semibold text-primary shrink-0">Add →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Staff on this course ({staff.length})
        </div>
        {staff.length === 0 ? (
          <div className="text-xs text-muted-foreground">No staff yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {staff.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-2 rounded-md bg-background border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{s.username ?? "user"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{s.full_name || s.email}</div>
                </div>
                {canManage && (
                  <button
                    onClick={() => remove(s.user_id)}
                    disabled={busy === s.user_id}
                    className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
