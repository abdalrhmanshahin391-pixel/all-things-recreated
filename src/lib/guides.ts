import { supabase } from "@/integrations/supabase/client";

export type GuideLang = "en" | "ru" | "hy";

export const GUIDE_LANGS: GuideLang[] = ["en", "ru", "hy"];

export const GUIDE_LANG_LABEL: Record<GuideLang, string> = {
  en: "English",
  ru: "Русский",
  hy: "Հայերեն",
};

export const GUIDE_HTML_LANG: Record<GuideLang, string> = {
  en: "en",
  ru: "ru",
  hy: "hy",
};

export type GuideRow = {
  id: string;
  slug: string;
  published: boolean;
  position: number;
  course_id: string | null;
  title_en: string;
  summary_en: string;
  body_en: string;
  title_ru: string;
  summary_ru: string;
  body_ru: string;
  title_hy: string;
  summary_hy: string;
  body_hy: string;
  created_at?: string;
  updated_at?: string;
};

export type LocalizedGuide = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  courseId: string | null;
  updatedAt: string | null;
};

/** Falls back to the English text when a translation is empty. */
export function localizeGuide(row: GuideRow, lang: GuideLang): LocalizedGuide {
  const pick = (l: GuideLang, field: "title" | "summary" | "body") =>
    (row[`${field}_${l}` as keyof GuideRow] as string | undefined)?.trim() ?? "";
  return {
    id: row.id,
    slug: row.slug,
    title: pick(lang, "title") || pick("en", "title") || row.slug.replace(/-/g, " "),
    summary: pick(lang, "summary") || pick("en", "summary"),
    body: pick(lang, "body") || pick("en", "body"),
    courseId: row.course_id ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GUIDE_SELECT =
  "id,slug,published,position,course_id,title_en,summary_en,body_en,title_ru,summary_ru,body_ru,title_hy,summary_hy,body_hy,created_at,updated_at";

export async function fetchPublishedGuides(): Promise<GuideRow[]> {
  const { data } = await (supabase.from as any)("guides")
    .select(GUIDE_SELECT)
    .eq("published", true)
    .order("position", { ascending: true });
  return (data as GuideRow[] | null) ?? [];
}

export async function fetchGuideBySlug(slug: string): Promise<GuideRow | null> {
  const { data } = await (supabase.from as any)("guides")
    .select(GUIDE_SELECT)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data as GuideRow | null) ?? null;
}

export const SITE_URL = "https://aquaqbank.com";

export function guidePath(lang: GuideLang, slug?: string) {
  const prefix = lang === "en" ? "" : `/${lang}`;
  return slug ? `${prefix}/guides/${slug}` : `${prefix}/guides`;
}

/** hreflang alternates plus a self-referencing canonical for a guide page. */
export function guideLinks(lang: GuideLang, slug?: string) {
  const alternates = GUIDE_LANGS.map((l) => ({
    rel: "alternate",
    hrefLang: GUIDE_HTML_LANG[l],
    href: `${SITE_URL}${guidePath(l, slug)}`,
  }));
  return [
    { rel: "canonical", href: `${SITE_URL}${guidePath(lang, slug)}` },
    ...alternates,
    { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}${guidePath("en", slug)}` },
  ];
}

export const HUB_COPY: Record<
  GuideLang,
  { title: string; description: string; heading: string; intro: string; empty: string; read: string }
> = {
  en: {
    title: "Medical study guides — AquaQBank Academy",
    description:
      "Free study guides for medical students: how each course works, how exams are structured, and how to prepare.",
    heading: "ysmu study guides",
    intro:
      "Free, open guides for medical students — how each course is built, how the exams work, and how to prepare for them.",
    empty: "Guides are being written. Check back soon.",
    read: "Read guide",
  },
  ru: {
    title: "Учебные руководства ЕГМУ — AquaQBank",
    description:
      "Бесплатные учебные руководства для студентов Ереванского государственного медицинского университета: как устроен курс, как проходят экзамены и как к ним готовиться.",
    heading: "учебные руководства егму",
    intro:
      "Бесплатные открытые руководства для студентов Ереванского государственного медицинского университета — как устроен каждый предмет, как проходят экзамены и как к ним подготовиться.",
    empty: "Руководства ещё готовятся. Загляните позже.",
    read: "Читать",
  },
  hy: {
    title: "ԵՊԲՀ ուսումնական ուղեցույցներ — AquaQBank",
    description:
      "Անվճար ուսումնական ուղեցույցներ Երևանի պետական բժշկական համալսարանի ուսանողների համար՝ ինչպես է կառուցված դասընթացը, ինչպես են անցնում քննությունները և ինչպես պատրաստվել։",
    heading: "եպբհ ուսումնական ուղեցույցներ",
    intro:
      "Անվճար բաց ուղեցույցներ Երևանի պետական բժշկական համալսարանի ուսանողների համար՝ ինչպես է կառուցված յուրաքանչյուր առարկան, ինչպես են անցնում քննությունները և ինչպես պատրաստվել դրանց։",
    empty: "Ուղեցույցները դեռ պատրաստվում են։ Այցելեք ավելի ուշ։",
    read: "Կարդալ",
  },
};
