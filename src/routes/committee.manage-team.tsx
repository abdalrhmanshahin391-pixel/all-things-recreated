import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus, UserMinus, History, Star } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";

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

function ManageTeamPage() {
  const { canManageMembers, isAdmin, loading } = useCommitteeRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !canManageMembers) guardRedirect(navigate);
  }, [loading, canManageMembers, navigate]);

  const { data: members } = useQuery({
    enabled: canManageMembers,
    queryKey: ["committee-team"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("committee_team_list");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (loading || !canManageMembers) return <div className="min-h-screen bg-muted/40" />;

  async function add() {
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("committee_team_add", { _username: name });
    setBusy(false);
    if (error) return toast.error(error.message);
    setUsername("");
    qc.invalidateQueries({ queryKey: ["committee-team"] });
    toast.success("Added to the committee");
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
        <p className="mb-8 text-muted-foreground" dir="rtl">
          إضافة أو إزالة أعضاء لجنة الطب والجراحة.
        </p>

        <div className="mb-6 flex gap-2 rounded-2xl border border-border bg-card p-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username of the student"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={add}
            disabled={busy || !username.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            <UserPlus size={15} /> Add
          </button>
        </div>

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
          {(members ?? []).length === 0 && (
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
