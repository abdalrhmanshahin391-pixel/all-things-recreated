import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import type { SitePage } from "@/lib/site-structure";

export const Route = createFileRoute("/admin/pages/")({
  head: () => ({
    meta: [
      { title: "Pages & Sections — Admin" },
      { name: "description", content: "Create your own pages and fill them with sections, text, images, files and buttons." },
    ],
  }),
  component: AdminPages,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function AdminPages() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState<SitePage[]>([]);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  async function reload() {
    const { data } = await (supabase.from as any)("site_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    setPages((data ?? []) as SitePage[]);
    setReady(true);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    const clean = title.trim();
    if (!clean) return;
    const { data, error } = await (supabase.from as any)("site_pages")
      .insert({
        slug: slugify(clean) || `page-${Date.now()}`,
        title_en: clean,
        title_ar: clean,
        published: false,
        is_system: false,
        sort_order: pages.length,
      })
      .select()
      .maybeSingle();
    if (error) return toast.error(error.message);
    setTitle("");
    await reload();
    if (data?.id) navigate({ to: "/admin/pages/$pageId", params: { pageId: data.id } });
  }

  async function remove(p: SitePage) {
    if (!confirm(`Delete “${p.title_en}” and everything inside it?`)) return;
    const { error } = await (supabase.from as any)("site_pages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await reload();
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-24">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Pages &amp; Sections</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Build your own pages out of sections. Each section can hold text, images, PDFs, videos,
          buttons and cards — and can contain sub-sections for things like course materials.
        </p>

        <div className="mt-6 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New page name, e.g. First Course"
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={create}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
          >
            <Plus size={15} /> Create
          </button>
        </div>

        {!ready ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {pages.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-black truncate">{p.title_en}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.is_system ? "Built-in page" : `/p/${p.slug}`} ·{" "}
                    {p.is_system ? "sections only" : p.published ? "Published" : "Draft"}
                  </div>
                </div>
                {!p.is_system && (
                  <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                    <ExternalLink size={16} />
                  </a>
                )}
                <Link
                  to="/admin/pages/$pageId"
                  params={{ pageId: p.id }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                >
                  Edit
                </Link>
                {!p.is_system && (
                  <button type="button" onClick={() => remove(p)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-500">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {pages.length === 0 && <p className="text-sm text-slate-500">No pages yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}