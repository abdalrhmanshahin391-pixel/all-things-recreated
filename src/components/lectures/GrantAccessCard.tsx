import { useEffect, useState } from "react";
import { Loader2, UserPlus, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type UserHit = { id: string; username: string; full_name: string; email: string };
type Member = { user_id: string; username: string; full_name: string; email: string };

export function GrantAccessCard({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadMembers() {
    const { data, error } = await (supabase.rpc as any)("admin_list_lecture_course_users", {
      _course_id: courseId,
    });
    if (error) setErr(error.message);
    else setMembers((data as Member[]) ?? []);
  }

  useEffect(() => {
    loadMembers();
  }, [courseId]);

  useEffect(() => {
    if (query.trim().length < 2) {
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
  }, [query]);

  async function grant(userId: string) {
    setBusy(userId);
    setErr(null);
    const { error } = await (supabase.rpc as any)("admin_grant_lecture_course", {
      _user_id: userId,
      _course_id: courseId,
    });
    setBusy(null);
    if (error) setErr(error.message);
    else {
      setQuery("");
      setHits([]);
      loadMembers();
    }
  }

  async function revoke(userId: string) {
    setBusy(userId);
    setErr(null);
    const { error } = await (supabase.rpc as any)("admin_revoke_lecture_course", {
      _user_id: userId,
      _course_id: courseId,
    });
    setBusy(null);
    if (error) setErr(error.message);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="text-primary" size={18} />
        <h2 className="font-semibold text-sm text-foreground">Grant this course to a user</h2>
      </div>
      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or email…"
          className="w-full pl-9 pr-3 py-2.5 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground outline-none focus:border-accent"
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
              onClick={() => grant(h.id)}
              disabled={busy === h.id}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="text-sm text-foreground font-semibold truncate">{h.username}</div>
                <div className="text-[11px] text-muted-foreground truncate">{h.full_name || h.email}</div>
              </div>
              <span className="text-[11px] font-semibold text-primary shrink-0">Grant →</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Currently has access ({members.length})
        </div>
        {members.length === 0 ? (
          <div className="text-xs text-muted-foreground">No one yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-2 rounded-md bg-background border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-semibold truncate">{m.username}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{m.full_name || m.email}</div>
                </div>
                <button
                  onClick={() => revoke(m.user_id)}
                  disabled={busy === m.user_id}
                  className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                  title="Revoke"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
