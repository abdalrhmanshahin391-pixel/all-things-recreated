import { createFileRoute } from "@tanstack/react-router";
import { GuideArticle } from "@/components/guides/GuideViews";
import {
  fetchGuideBySlug,
  localizeGuide,
  guideLinks,
  SITE_URL,
  guidePath,
  type LocalizedGuide,
} from "@/lib/guides";

export const Route = createFileRoute("/guides/$slug")({
  loader: async ({ params }): Promise<{ guide: LocalizedGuide | null }> => {
    try {
      const row = await fetchGuideBySlug(params.slug);
      return { guide: row ? localizeGuide(row, "en") : null };
    } catch {
      return { guide: null };
    }
  },
  head: ({ params, loaderData }) => {
    const guide = loaderData?.guide ?? null;
    if (!guide) {
      return { meta: [{ title: "Guide not found — AquaQBank" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${guide.title} — AquaQBank`;
    const description =
      guide.summary || `${guide.title}: a free study guide for medical students.`;
    const url = `${SITE_URL}${guidePath("en", params.slug)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: guideLinks("en", params.slug),
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description,
            url,
            inLanguage: "en",
            dateModified: guide.updatedAt ?? undefined,
            publisher: { "@type": "Organization", name: "AquaQBank", url: `${SITE_URL}/` },
          }),
        },
      ],
    };
  },
  component: () => <GuideArticle lang="en" guide={Route.useLoaderData().guide} />,
});
