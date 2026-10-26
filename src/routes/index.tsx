import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { IS_MAINTENANCE_MODE } from "@/config/maintenance";
import { SiteHeader } from "@/components/SiteHeader";
import { HeroShowcase } from "@/components/home/HeroShowcase";
import { useAuth } from "@/hooks/useAuth";
import { DuoFeatureRow } from "@/components/home/DuoFeatureRow";
import { homeCoursesQuery } from "@/components/home/CoursesStrip";
import { PackagesStrip, homePackagesQuery } from "@/components/home/PackagesStrip";
import { UniversityStrip } from "@/components/home/UniversityStrip";
import { FooterCTA } from "@/components/home/FooterCTA";
import { SectionRenderer } from "@/components/pagebuilder/SectionRenderer";
import { fetchPageTreeBySlug, HOME_BUILTINS, type SectionNode } from "@/lib/site-structure";
import { homeUniversitiesQuery } from "@/hooks/useHomeUniversities";
import { HomeFaq, HOME_FAQ } from "@/components/home/HomeFaq";
import { ExamPrepPanel } from "@/components/home/ExamPrepPanel";
import { QuestionCountsSection } from "@/components/home/QuestionCountsSection";
import { InstallAppBanner } from "@/components/InstallAppButton";
import { NotificationsPrompt } from "@/components/NotificationsPrompt";
import { AcademyHome } from "@/components/home/academy/AcademyHome";
import { EthicsBands } from "@/components/about/EthicsBands";
import { EventEntryButtons } from "@/components/events/EventButtons";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import ogImage from "@/assets/aquaqbank-og-gold.jpg.asset.json";


const homeSectionsQuery = queryOptions({
  queryKey: ["home-sections"],
  queryFn: () => fetchPageTreeBySlug("home"),
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
});

export const Route = createFileRoute("/")({
  // Warm every home query on the server so the page ships with its content.
  loader: async ({ context }) => {
    if (IS_MAINTENANCE_MODE) return;
    await Promise.all([
      context.queryClient.ensureQueryData(homeSectionsQuery),
      context.queryClient.ensureQueryData(homeCoursesQuery),
      context.queryClient.ensureQueryData(homePackagesQuery),
      context.queryClient.ensureQueryData(homeUniversitiesQuery),
    ]);
  },
  head: () => ({
    // Title/description/og:title/og:description come from the sitewide defaults
    // in __root.tsx — the homepage is the canonical home of that copy.
    meta: [
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aquaqbank.com/" },

      { property: "og:image", content: `https://aquaqbank.com${ogImage.url}` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "AquaQBank Academy — gold A emblem logo" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `https://aquaqbank.com${ogImage.url}` },
    ],
    links: [{ rel: "canonical", href: "https://aquaqbank.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HOME_FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],

  }),
  component: Index,
});

function Index() {
  const { t } = useTranslation();
  const { theme } = useSiteSettings();
  const { user } = useAuth();

  const { data: tree } = useQuery(homeSectionsQuery);

  if (theme === "academy") {
    return (
      <div className="bg-background text-foreground min-h-screen">
        <SiteHeader />
        <EventEntryButtons />
        <AcademyHome />
        <InstallAppBanner />
        <NotificationsPrompt />
      </div>
    );
  }

  const builtins: Record<string, ReactElement> = {
    hero: <HeroShowcase signedIn={!!user} />,
    feature1: (
      <DuoFeatureRow
        eyebrow={t("cms.home.feature1.eyebrow")}
        title={t("cms.home.feature1.title")}
        body={t("cms.home.feature1.body")}
        variant="subjects"
        accent="green"
      />
    ),
    exam_prep: <ExamPrepPanel />,
    results: <QuestionCountsSection />,
    packages: <PackagesStrip />,
    feature2: (
      <DuoFeatureRow
        eyebrow={t("cms.home.feature2.eyebrow")}
        title={t("cms.home.feature2.title")}
        body={t("cms.home.feature2.body")}
        variant="notebook"
        reverse
        accent="blue"
      />
    ),
    universities: <UniversityStrip />,
    footer_cta: <FooterCTA />,
  };

  const ordered: SectionNode[] | null = tree && tree.length > 0 ? tree : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <EventEntryButtons />
      <div className="relative z-10">
      {ordered
        ? ordered.map((node) =>
            node.visible === false ? null : node.builtin_key ? (
              <div key={node.id}>
                {/* The FAQ always sits directly above the closing call to action. */}
                {node.builtin_key === "footer_cta" && <HomeFaq />}
                {builtins[node.builtin_key] ?? null}
                {node.builtin_key === "feature1" && <HomeEthics />}
              </div>
            ) : (
              <div key={node.id} className="mx-auto max-w-5xl px-4 md:px-8 py-14">
                <SectionRenderer node={node} />
              </div>
            ),
          )
        : HOME_BUILTINS.map((b) => (
            <div key={b.key}>
              {b.key === "footer_cta" && <HomeFaq />}
              {builtins[b.key]}
              {b.key === "feature1" && <HomeEthics />}
            </div>
          ))}
      </div>

      <InstallAppBanner />
      <NotificationsPrompt />
    </div>
  );
}

/** The two Golden-Age paintings and their ethics, shared with the About page. */
function HomeEthics() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <EthicsBands />
      </div>
    </section>
  );
}
