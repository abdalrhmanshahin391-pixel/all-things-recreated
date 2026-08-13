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

export const Route = createFileRoute("/ru/guides/$slug")({
  loader: async ({ params }): Promise<{ guide: LocalizedGuide | null }> => {
    try {
      const row = await fetchGuideBySlug(params.slug);
      return { guide: row ? localizeGuide(row, "ru") : null };
    } catch {
      return { guide: null };
    }
  },
  head: ({ params, loaderData }) => {
    const guide = loaderData?.guide ?? null;
    if (!guide) {
      return { meta: [{ title: "Руководство не найдено — AquaQBank" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${guide.title} — AquaQBank`;
    const description =
      guide.summary ||
      `${guide.title}: бесплатное учебное руководство для студентов Ереванского государственного медицинского университета.`;
    const url = `${SITE_URL}${guidePath("ru", params.slug)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: guideLinks("ru", params.slug),
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description,
            url,
            inLanguage: "ru",
            dateModified: guide.updatedAt ?? undefined,
            publisher: { "@type": "Organization", name: "AquaQBank", url: `${SITE_URL}/` },
          }),
        },
      ],
    };
  },
  component: () => <GuideArticle lang="ru" guide={Route.useLoaderData().guide} />,
});
