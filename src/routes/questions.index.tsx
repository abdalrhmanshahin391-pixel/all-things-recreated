import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { rdb, useIsContributor, type RequestGroup } from "@/lib/question-requests";

export const Route = createFileRoute("/questions/")({
  head: () => ({
    meta: [
      { title: "My question groups — AquaQBank" },
      { name: "description", content: "Create question groups and send questions to the AquaQBank team." },
      { property: "og:title", content: "My question groups — AquaQBank" },
      { property: "og:description", content: "Create question groups and send questions to the AquaQBank team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyGroupsPage,
});

function MyGroupsPage() {
  const { user, isRealAdmin, loading } = useAuth();
  const isContributor = useIsContributor(user?.id);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useQuery({
    enabled: !!user,
    queryKey: ["my-request-groups", user?.id],
    queryFn: async () => {
      const { data, error } = await rdb("request_groups").select("*").eq("owner_id", user!.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as RequestGroup[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-request-groups"] });

  if (loading) return <Shell><Loader2 className="animate-spin" /></Shell>;
  if (!user || (!isContributor && !isRealAdmin))
    return <Shell><p className="text-muted-foreground">You don't have access to this page.</p></Shell>;

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await rdb("request_groups").insert({ name: name.trim(), owner_id: user!.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    refresh();
  }
  async function rename(g: RequestGroup) {
    const n = prompt("New group name", g.name)?.trim();
    if (!n) return;
    const { error } = await rdb("request_groups").update({ name: n }).eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function remove(g: RequestGroup) {
    if (!confirm(`Delete "${g.name}" and all its questions?`)) return;
    const { error } = await rdb("request_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <Shell>
      <h1 className="text-2xl font-black text-foreground">My question groups</h1>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <button onClick={create} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          <Plus size={16} /> Create group
        </button>
      </div>
      <div className="space-y-2">
        {(groups.data ?? []).map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            {g.completed ? <CheckCircle2 className="text-primary" size={18} /> : <Circle className="text-muted-foreground" size={18} />}
            <Link to="/questions/$groupId" params={{ groupId: g.id }} className="flex-1 font-bold text-foreground hover:underline">{g.name}</Link>
            <span className="text-xs text-muted-foreground">{g.completed ? "Completed" : "Not completed"}</span>
            <button onClick={() => rename(g)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
            <button onClick={() => remove(g)} className="p-1.5 text-destructive"><Trash2 size={15} /></button>
          </div>
        ))}
        {groups.data?.length === 0 && <p className="text-sm text-muted-foreground">No groups yet. Create your first one above.</p>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">{children}</main>
    </div>
  );
}
