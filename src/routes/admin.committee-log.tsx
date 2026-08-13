import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History, Search, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/admin/committee-log")({
  head: () => ({
    meta: [
      { title: "Committee Log — Administration Site" },
      { name: "description", content: "See who added, edited or deleted anything in the committee library." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Committee Log — Administration Site" },
      { property: "og:description", content: "Full change history of the committee library." },
    ],
  }),
  component: CommitteeLogPage,
});

type Entry = {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  created_at: string;
};

const PAGE = 50;

const TYPE_LABEL: Record<string, string> = {
  committee_years: "Year",
  committee_semesters: "Semester",
  committee_modules: "Module",
  committee_subjects: "Subject",
  committee_categories: "Folder",
  committee_resources: "File / video",
  committee_subject_courses: "Linked course",
};

function actionStyle(action: string) {
  if (action === "added") return { cls: "bg-emerald-500/10 text-emerald-600", icon: <Plus size={12} /> };
  if (action === "deleted") return { cls: "bg-rose-500/10 text-rose-600", icon: <Trash2 size={12} /> };
  return { cls: "bg-amber-500/10 text-amber-600", icon: <Pencil size={12} /> };
}

function CommitteeLogPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<string>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => setPage(0), [action, q]);

  const { data, isFetching } = useQuery({
    queryKey: ["committee-log", action, page],
    queryFn: async (): Promise<Entry[]> => {
      let query = supabase
        .from("committee_activity_log")
        .select("id, actor_id, actor_label, action, entity_type, entity_id, entity_label, created_at")
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (action !== "all") query = query.eq("action", action);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) =>
      [r.actor_label, r.entity_label, TYPE_LABEL[r.entity_type] ?? r.entity_type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  if (loading || !isAdmin) return <div className="min-h-screen bg-muted/40" />;

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Administration Site
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <History size={20} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Committee log</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Every add, edit and delete inside the committee library — years, semesters, modules,
          subjects, folders, files, videos and linked courses.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search person or item…"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All actions</option>
            <option value="added">Added</option>
            <option value="edited">Edited</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {isFetching ? "Loading…" : "No changes recorded yet."}
            </div>
          )}
          {rows.map((r) => {
            const a = actionStyle(r.action);
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${a.cls}`}>
                  {a.icon} {r.action}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {TYPE_LABEL[r.entity_type] ?? r.entity_type}
                    {r.entity_label ? ` · ${r.entity_label}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.actor_label ?? "system"} · {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted-foreground">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(data?.length ?? 0) < PAGE}
            className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}