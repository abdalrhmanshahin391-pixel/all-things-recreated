import { createFileRoute } from "@tanstack/react-router";
import { GuidesHub } from "@/components/guides/GuideViews";
import { fetchPublishedGuides, localizeGuide, HUB_COPY, guideLinks, SITE_URL, guidePath } from "@/lib/guides";

export const Route = createFileRoute("/hy/guides/")({
  loader: async () => {
    try {
      const rows = await fetchPublishedGuides();
      return { guides: rows.map((r) => localizeGuide(r, "hy")) };
    } catch {
      return { guides: [] };
    }
  },
  head: ({ loaderData }) => {
    const copy = HUB_COPY.hy;
    const url = `${SITE_URL}${guidePath("hy")}`;
    return {
      meta: [
        { title: copy.title },
        { name: "description", content: copy.description },
        { property: "og:title", content: copy.title },
        { property: "og:description", content: copy.description },
        { property: "og:url", content: url },
      ],
      links: guideLinks("hy"),
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: copy.title,
            description: copy.description,
            url,
            inLanguage: "hy",
            hasPart: (loaderData?.guides ?? []).map((g) => ({
              "@type": "Article",
              headline: g.title,
              url: `${SITE_URL}${guidePath("hy", g.slug)}`,
            })),
          }),
        },
      ],
    };
  },
  component: () => <GuidesHub lang="hy" guides={Route.useLoaderData().guides} />,
});
