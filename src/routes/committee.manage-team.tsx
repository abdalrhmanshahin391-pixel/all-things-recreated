import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus, UserMinus, History, Star, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { CommitteeVisibilityAdminToolbar } from "@/components/committee/CommitteeRecruitmentBanner";
import {
  getCommitteeRecruitmentSettings,
  DEFAULT_RECRUITMENT_SETTINGS,
  type CommitteeRecruitmentSettings,
} from "@/lib/committee-recruitment.functions";

export const Route = createFileRoute("/committee/manage-team")({
  head: () => ({
    meta: [
      { title: "Committee team — AquaQBank" },
      { name: "description", content: "Add or remove members of لجنة الطب والجراحة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManageTeamPage,
});

type Row = { user_id: string; username: string | null; full_name: string | null; email: string | null; is_head: boolean };
type Hit = { id: string; username: string; full_name: string; email: string };

function ManageTeamPage() {
  const { canManageMembers, isAdmin, loading } = useCommitteeRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const { data: recruitmentData } = useQuery({
    queryKey: ["committee-recruitment-settings"],
    queryFn: () => getCommitteeRecruitmentSettings(),
    staleTime: 10 * 1000,
  });
  const [localSettings, setLocalSettings] = useState<CommitteeRecruitmentSettings | null>(null);
  const settings: CommitteeRecruitmentSettings = localSettings || recruitmentData || DEFAULT_RECRUITMENT_SETTINGS;

  useEffect(() => {
    // Only decide access once roles are actually known, otherwise a head is
    // sent home during the first render.
    if (!loading && !canManageMembers) guardRedirect(navigate);
  }, [loading, canManageMembers, navigate]);

  const { data: members, error: listError, isLoading: listLoading } = useQuery({
    enabled: canManageMembers,
    queryKey: ["committee-team"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("committee_team_list");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Live user search — typing two letters lists everyone who matches.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const { data, error } = await (supabase.rpc as any)("head_search_users", { _query: q });
      setSearching(false);
      if (error) {
        setHits([]);
        return;
      }
      const already = new Set((members ?? []).map((m) => m.user_id));
      setHits(((data ?? []) as Hit[]).filter((h) => !already.has(h.id)));
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, members]);

  if (loading || !canManageMembers) return <div className="min-h-screen bg-muted/40" />;

  async function add(hit: Hit) {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("head_set_committee_role", {
      _user_id: hit.id,
      _grant: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setQuery("");
    setHits([]);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["committee-team"] });
    toast.success(`${hit.username || hit.full_name} added to the committee`);
  }

  async function remove(row: Row) {
    if (!confirm(`Remove ${row.username || row.full_name} from the committee?`)) return;
    const { error } = await (supabase.rpc as any)("committee_team_remove", { _user_id: row.user_id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["committee-team"] });
    toast.success("Removed");
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-28 pb-20">
        <h1 className="mb-2 inline-flex items-center gap-3 text-3xl font-black tracking-tight">
          <ShieldCheck size={26} className="text-primary" /> Committee team
        </h1>
        <p className="mb-6 text-muted-foreground" dir="rtl">
          إضافة أو إزالة أعضاء لجنة الطب والجراحة والتحكم في حالة ظهور الفريق للطلاب.
        </p>

        <CommitteeVisibilityAdminToolbar
          settings={settings}
          onUpdated={(newS) => {
            setLocalSettings(newS);
            qc.invalidateQueries({ queryKey: ["committee-recruitment-settings"] });
          }}
        />

        <div className="relative mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary">
            <Search size={15} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search by username, full name or email"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {(searching || busy) && <Loader2 size={15} className="animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Type at least 2 letters, then pick a student to add them.
          </p>

          {open && hits.length > 0 && (
            <div className="absolute inset-x-4 top-[4.6rem] z-20 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={busy}
                  onClick={() => add(h)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {h.username || h.full_name || h.email}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.full_name} · {h.email}
                    </span>
                  </span>
                  <UserPlus size={15} className="shrink-0 text-primary" />
                </button>
              ))}
            </div>
          )}
          {open && query.trim().length >= 2 && !searching && hits.length === 0 && (
            <div className="absolute inset-x-4 top-[4.6rem] z-20 rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground shadow-2xl">
              No users matched.
            </div>
          )}
        </div>

        {listError && (
          <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Could not load the team: {(listError as Error).message}
          </p>
        )}

        <div className="space-y-2">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {m.full_name || m.username}
                  {m.is_head && <Star size={13} className="ms-1 inline text-primary" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.username} · {m.email}</p>
              </div>
              {(!m.is_head || isAdmin) && (
                <button
                  onClick={() => remove(m)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-destructive"
                >
                  <UserMinus size={13} /> Remove
                </button>
              )}
            </div>
          ))}
          {!listLoading && !listError && (members ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No committee members yet.
            </p>
          )}
        </div>

        <Link to="/admin/committee-log" className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold">
          <History size={15} /> Committee change log
        </Link>
      </main>
    </div>
  );
}
