import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://aquaqbank.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const GUIDE_LANGS = ["en", "ru", "hy"] as const;
const guidePrefix = (lang: (typeof GUIDE_LANGS)[number]) => (lang === "en" ? "" : `/${lang}`);

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/universities", changefreq: "weekly", priority: "0.9" },
  { path: "/courses", changefreq: "weekly", priority: "0.9" },
  { path: "/lectures", changefreq: "weekly", priority: "0.7" },
  { path: "/committee", changefreq: "weekly", priority: "0.7" },
  { path: "/packages", changefreq: "monthly", priority: "0.6" },
  { path: "/study-hub", changefreq: "monthly", priority: "0.6" },
  ...GUIDE_LANGS.map((l) => ({
    path: `${guidePrefix(l)}/guides`,
    changefreq: "weekly" as const,
    priority: "0.8",
  })),
  { path: "/about", changefreq: "yearly", priority: "0.4" },
  { path: "/support", changefreq: "yearly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.3" },
];


async function dynamicEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  try {
    const { data: unis } = await supabase
      .from("universities")
      .select("slug")
      .eq("is_active", true);
    for (const u of unis ?? []) {
      if (u?.slug) entries.push({ path: `/u/${u.slug}`, changefreq: "weekly", priority: "0.8" });
    }
  } catch {
    // ignore — sitemap still serves static routes
  }
  try {
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("published", true);
    for (const c of courses ?? []) {
      if (c?.id) entries.push({ path: `/courses/${c.id}`, changefreq: "weekly", priority: "0.7" });
    }
  } catch {
    // ignore
  }
  try {
    const { data: guides } = await (supabase.from as any)("guides")
      .select("slug")
      .eq("published", true);
    for (const g of (guides as { slug: string }[] | null) ?? []) {
      if (!g?.slug) continue;
      for (const l of GUIDE_LANGS) {
        entries.push({ path: `${guidePrefix(l)}/guides/${g.slug}`, changefreq: "monthly", priority: "0.7" });
      }
    }
  } catch {
    // ignore
  }
  return entries;
}


export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [...STATIC_ENTRIES, ...(await dynamicEntries())];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
