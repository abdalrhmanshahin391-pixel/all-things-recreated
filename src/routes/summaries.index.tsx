import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Plus, Sparkles, Trash2, Eye, EyeOff, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { deleteSummary, toggleSummaryPublic } from "@/lib/summaries.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";
import { toast } from "sonner";

export const Route = createFileRoute("/summaries/")({
  head: () => ({
    meta: [
      { title: "Summaries — AI Cheat Sheets" },
      { name: "description", content: "Beautiful AI-generated multi-page summaries for any subject." },
    ],
  }),
  component: SummariesHub,
});

type Row = {
  id: string;
  title: string;
  subtitle: string | null;
  source_type: string;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  author_name: string | null;
};

async function fetchMine(userId: string): Promise<Row[]> {
  const { data, error } = await (supabase.from as any)("summaries")
    .select("id,title,subtitle,source_type,is_public,share_slug,created_at,author_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

function SummariesHub() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);
  const { data: rows = [] } = useQuery({
    queryKey: ["my-summaries", user?.id],
    queryFn: () => fetchMine(user!.id),
    enabled: !!user?.id,
  });

  const delFn = useServerFn(deleteSummary);
  const togFn = useServerFn(toggleSummaryPublic);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-summaries"] });
      toast.success("Summary deleted.");
    },
  });

  const tog = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      togFn({ data: { id, isPublic } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-summaries"] }),
  });

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="max-w-2xl mx-auto px-6 py-32 text-center">
          <h1 className="font-display font-black text-4xl lowercase tracking-tight">sign in to create summaries.</h1>
          <p className="mt-3 text-muted-foreground">summaries are stored in your account.</p>
          <Link to="/login" className="btn-chunky btn-chunky--lg mt-6 inline-flex">
            sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* Hero — matches homepage */}
      <section className="relative bg-background pt-28 pb-16 md:pt-32 md:pb-20 overflow-hidden">
        <FloatingMedicalBackdrop />
        <div className="relative mx-auto max-w-4xl px-4 md:px-8 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ borderColor: "#dcfce7", color: "var(--primary)", boxShadow: "0 3px 0 #dcfce7" }}
          >
            <Sparkles size={12} strokeWidth={3} />
            ai cheat sheets
          </span>
          <h1
            className="mt-6 font-display font-black text-foreground leading-[1.05] tracking-tight lowercase"
            style={{ fontSize: "clamp(2.25rem, 6vw, 4.5rem)" }}
          >
            beautiful summaries, in seconds.
          </h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            pick a subject, paste text, or snap photos of your book — get back a stunning, brand-styled cheat sheet.
          </p>
          <button
            onClick={() => navigate({ to: "/summaries/new" })}
            className="btn-chunky btn-chunky--lg mt-10 inline-flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={3} /> create a summary
          </button>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-6xl mx-auto px-6 md:px-12 py-16">
        <div className="flex items-end justify-between mb-8">
          <h2 className="font-display font-black text-3xl lowercase tracking-tight">your summaries</h2>
          <span className="text-sm font-bold text-muted-foreground">{rows.length} total</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[#e5e5e5] bg-white p-16 text-center">
            <div
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white"
              style={{ background: "var(--primary)", boxShadow: "0 4px 0 color-mix(in oklab, var(--primary) 60%, black)" }}
            >
              <Sparkles size={22} strokeWidth={2.5} />
            </div>
            <p className="mt-4 font-display font-black text-xl lowercase">no summaries yet.</p>
            <p className="text-muted-foreground text-sm">create your first cheat sheet — it takes ~10 seconds.</p>
            <button
              onClick={() => navigate({ to: "/summaries/new" })}
              className="btn-chunky mt-6 inline-flex items-center gap-2"
            >
              <Plus size={14} strokeWidth={3} /> new summary
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map((r) => (
              <article
                key={r.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <Link to="/summaries/$summaryId" params={{ summaryId: r.id }} className="block">
                  <div className="relative aspect-[1/1.1] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-100 via-pink-50 to-orange-100" />
                    <div className="absolute -top-12 -left-12 h-40 w-40 rounded-full bg-indigo-300/40 blur-2xl" />
                    <div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-pink-300/40 blur-2xl" />
                    <div className="relative p-6 h-full flex flex-col justify-between">
                      <span className="text-[9px] font-extrabold tracking-[0.3em] uppercase text-indigo-700">
                        Cheat Sheet
                      </span>
                      <h3 className="text-2xl font-black tracking-tight text-slate-900 leading-tight line-clamp-3">
                        {r.title}
                      </h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()} · {r.author_name}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 p-3 border-t border-slate-100">
                  <button
                    onClick={() => tog.mutate({ id: r.id, isPublic: !r.is_public })}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600"
                  >
                    {r.is_public ? <Eye size={13} /> : <EyeOff size={13} />}
                    {r.is_public ? "Public" : "Private"}
                  </button>
                  <div className="flex items-center gap-1">
                    {r.is_public && r.share_slug && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/summaries/${r.id}`);
                          toast.success("Link copied!");
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                        title="Copy share link"
                        aria-label="Copy share link"
                      >
                        <Share2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm("Delete this summary?")) del.mutate(r.id);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"
                      title="Delete"
                      aria-label="Delete summary"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
