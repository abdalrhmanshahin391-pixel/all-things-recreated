import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SummaryView } from "@/components/summary/SummaryView";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import type { SummaryContent } from "@/lib/summaries.functions";
import { toast } from "sonner";
import { ProtectedContent } from "@/components/protect/ProtectedContent";

export const Route = createFileRoute("/summaries/$summaryId")({
  head: () => ({ meta: [{ title: "Summary · AI Cheat Sheet" }] }),
  component: () => (
    <ProtectedContent context="summary">
      <SummaryViewer />
    </ProtectedContent>
  ),
});

type Row = {
  id: string;
  title: string;
  subtitle: string | null;
  author_name: string | null;
  content: SummaryContent;
  created_at: string;
  is_public: boolean;
  share_slug: string | null;
};

function SummaryViewer() {
  const { summaryId } = Route.useParams();
  const settings = useSiteSettings();
  const { data, isLoading, error } = useQuery({
    queryKey: ["summary", summaryId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("summaries")
        .select("id,title,subtitle,author_name,content,created_at,is_public,share_slug")
        .eq("id", summaryId)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <SiteHeader />

      {/* Toolbar */}
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200 print:hidden">
        <div className="max-w-[920px] mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/summaries" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-indigo-600">
            <ArrowLeft size={14} /> All summaries
          </Link>
          <div className="flex items-center gap-2">
            {data?.is_public && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied!");
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                <Share2 size={12} /> Share
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-pink-500 px-4 py-2 text-xs font-bold text-white shadow"
            >
              <Printer size={12} /> Save as PDF
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="py-32 text-center text-slate-500">Loading…</div>}
      {error && <div className="py-32 text-center text-rose-600">Error loading summary.</div>}
      {!isLoading && !data && (
        <div className="py-32 text-center text-slate-500">Summary not found or you don't have access.</div>
      )}

      {data && (
        <SummaryView
          content={data.content}
          siteName={settings.site_name}
          tagline={settings.tagline}
          authorName={data.author_name ?? undefined}
          createdAt={data.created_at}
        />
      )}
    </div>
  );
}
