import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Circle, Pencil, Trash2, UserPlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { rdb, type RequestGroup } from "@/lib/question-requests";
import { searchUsers } from "@/lib/user-groups";

export const Route = createFileRoute("/admin/question-requests")({
  head: () => ({
    meta: [
      { title: "Questions Request — AquaQBank" },
      { name: "description", content: "Review question groups sent by contributors and add them to courses." },
      { property: "og:title", content: "Questions Request — AquaQBank" },
      { property: "og:description", content: "Review question groups sent by contributors and add them to courses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuestionRequestsPage,
});

type Person = { user_id: string; username: string | null; full_name: string | null; email: string | null };

function QuestionRequestsPage() {
  const { isRealAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; full_name: string; email: string }[]>([]);

  const people = useQuery({
    enabled: isRealAdmin,
    queryKey: ["question-contributors"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_question_contributors");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });
  const groups = useQuery({
    enabled: isRealAdmin,
    queryKey: ["all-request-groups"],
    queryFn: async () => {
      const { data, error } = await rdb("request_groups").select("*, request_questions(count)").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (RequestGroup & { request_questions: { count: number }[] })[];
    },
  });

  if (loading) return <Shell><Loader2 className="animate-spin" /></Shell>;
  if (!isRealAdmin) return <Shell><p className="text-muted-foreground">Admins only.</p></Shell>;

  const nameOf = (id: string) => {
    const p = people.data?.find((x) => x.user_id === id);
    return p ? p.full_name || p.username || p.email : "Former contributor";
  };

  async function search() {
    if (q.trim().length < 2) return;
    try { setResults(await searchUsers(q.trim())); } catch (e: any) { toast.error(e.message); }
  }
  async function add(id: string) {
    const { error } = await rdb("question_contributors").insert({ user_id: id });
    if (error && !/duplicate/i.test(error.message)) return toast.error(error.message);
    setResults([]); setQ("");
    qc.invalidateQueries({ queryKey: ["question-contributors"] });
  }
  async function removePerson(id: string) {
    if (!confirm("Remove this person's permission? Their groups stay for you to see.")) return;
    const { error } = await rdb("question_contributors").delete().eq("user_id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["question-contributors"] });
  }
  async function rename(g: RequestGroup) {
    const n = prompt("New group name", g.name)?.trim();
    if (!n) return;
    const { error } = await rdb("request_groups").update({ name: n }).eq("id", g.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["all-request-groups"] });
  }
  async function remove(g: RequestGroup) {
    if (!confirm(`Delete "${g.name}" and all its questions?`)) return;
    const { error } = await rdb("request_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["all-request-groups"] });
  }

  return (
    <Shell>
      <h1 className="text-2xl font-black text-foreground">Questions Request</h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-black text-foreground">People who can send questions</h2>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by name, username or email"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          <button onClick={search} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Search</button>
        </div>
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-foreground">{r.full_name || r.username} <span className="text-muted-foreground">{r.email}</span></span>
            <button onClick={() => add(r.id)} className="inline-flex items-center gap-1 font-bold text-primary"><UserPlus size={14} /> Allow</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {(people.data ?? []).map((p) => (
            <span key={p.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-foreground">
              {p.full_name || p.username || p.email}
              <button onClick={() => removePerson(p.user_id)} className="text-muted-foreground hover:text-destructive"><X size={13} /></button>
            </span>
          ))}
          {people.data?.length === 0 && <p className="text-sm text-muted-foreground">Nobody yet.</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-black text-foreground">Groups</h2>
        {(groups.data ?? []).map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            {g.completed ? <CheckCircle2 className="text-primary" size={18} /> : <Circle className="text-muted-foreground" size={18} />}
            <div className="flex-1">
              <Link to="/questions/$groupId" params={{ groupId: g.id }} className="font-bold text-foreground hover:underline">{g.name}</Link>
              <p className="text-xs text-muted-foreground">
                by {nameOf(g.owner_id)} · {g.request_questions?.[0]?.count ?? 0} questions · {g.completed ? "Completed" : "Not completed"}
              </p>
            </div>
            <button onClick={() => rename(g)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
            <button onClick={() => remove(g)} className="p-1.5 text-destructive"><Trash2 size={15} /></button>
          </div>
        ))}
        {groups.data?.length === 0 && <p className="text-sm text-muted-foreground">No groups yet.</p>}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">{children}</main>
    </div>
  );
}
