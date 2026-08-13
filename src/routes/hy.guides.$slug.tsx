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

export const Route = createFileRoute("/hy/guides/$slug")({
  loader: async ({ params }): Promise<{ guide: LocalizedGuide | null }> => {
    try {
      const row = await fetchGuideBySlug(params.slug);
      return { guide: row ? localizeGuide(row, "hy") : null };
    } catch {
      return { guide: null };
    }
  },
  head: ({ params, loaderData }) => {
    const guide = loaderData?.guide ?? null;
    if (!guide) {
      return { meta: [{ title: "Ուղեցույցը չի գտնվել — AquaQBank" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${guide.title} — AquaQBank`;
    const description =
      guide.summary ||
      `${guide.title}՝ անվճար ուսումնական ուղեցույց Երևանի պետական բժշկական համալսարանի ուսանողների համար։`;
    const url = `${SITE_URL}${guidePath("hy", params.slug)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: guideLinks("hy", params.slug),
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description,
            url,
            inLanguage: "hy",
            dateModified: guide.updatedAt ?? undefined,
            publisher: { "@type": "Organization", name: "AquaQBank", url: `${SITE_URL}/` },
          }),
        },
      ],
    };
  },
  component: () => <GuideArticle lang="hy" guide={Route.useLoaderData().guide} />,
});
