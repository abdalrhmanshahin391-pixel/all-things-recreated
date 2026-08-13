import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useLang } from "@/components/LanguageProvider";
import { SectionRenderer } from "@/components/pagebuilder/SectionRenderer";
import { fetchPageTree, type SitePage } from "@/lib/site-structure";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    try {
      const { data } = await (supabase.from as any)("site_pages")
        .select("title_en")
        .eq("slug", params.slug)
        .maybeSingle();
      return { title: (data?.title_en as string | undefined) ?? null };
    } catch {
      return { title: null };
    }
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.title ?? params.slug.replace(/-/g, " ");
    const title = `${name} — AquaQBank`;
    const description = `${name} on AquaQBank, the medical study platform.`;
    const url = `https://aquaqbank.com/p/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CustomPage,
});

function CustomPage() {
  const { slug } = Route.useParams();
  const { lang } = useLang();

  const { data, isLoading } = useQuery({
    queryKey: ["custom-page", slug],
    queryFn: async () => {
      const { data: page } = await (supabase.from as any)("site_pages")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (!page) return null;
      const tree = await fetchPageTree((page as SitePage).id);
      return { page: page as SitePage, tree };
    },
  });

  const title = data?.page
    ? (lang === "ar" ? data.page.title_ar : data.page.title_en) || data.page.title_en
    : "";

  return (
    <div className="bg-background text-foreground min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 md:px-8 pt-28 pb-24">
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !data?.page || (!data.page.published && !data.page.is_system) ? (
          <p className="text-muted-foreground">This page isn’t available.</p>
        ) : (
          <>
            <h1
              className="font-display font-black lowercase leading-[1.05]"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)" }}
            >
              {title}
            </h1>
            <div className="mt-10 space-y-12">
              {data.tree.map((node) => (
                <SectionRenderer key={node.id} node={node} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}