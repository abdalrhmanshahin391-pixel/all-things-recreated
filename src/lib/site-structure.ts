import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TargetKind = "route" | "page" | "url";
export type NavVisibility = "all" | "auth" | "guest" | "admin";

export type NavItem = {
  id: string;
  placement: string;
  label_en: string;
  label_ar: string;
  target_kind: TargetKind;
  target_value: string;
  style: string;
  visibility: NavVisibility;
  visible: boolean;
  coming_soon?: boolean;
  sort_order: number;

};

export type SitePage = {
  id: string;
  slug: string;
  title_en: string;
  title_ar: string;
  seo_description_en: string;
  seo_description_ar: string;
  published: boolean;
  is_system: boolean;
  sort_order: number;
};

export type SiteSection = {
  id: string;
  page_id: string;
  parent_section_id: string | null;
  builtin_key: string | null;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  layout: "stack" | "grid" | "accordion" | string;
  visible: boolean;
  sort_order: number;
};

export type BlockKind =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "file"
  | "video"
  | "divider"
  | "cards";

export type SiteBlock = {
  id: string;
  section_id: string;
  kind: BlockKind | string;
  content: Record<string, any>;
  visible: boolean;
  sort_order: number;
};

/** Pages that already exist in the app and can be picked as a link target. */
export const BUILT_IN_ROUTES: Array<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/universities", label: "Universities" },
  { path: "/courses", label: "Courses" },
  { path: "/my/courses", label: "My Courses" },
  { path: "/my/lectures", label: "My Lectures" },
  { path: "/packages", label: "Packages" },
  { path: "/committee", label: "Committee / Resources" },
  { path: "/summaries", label: "Summaries" },
  { path: "/notes", label: "My Notes" },
  { path: "/profile", label: "Profile" },
  { path: "/support", label: "Support" },
  { path: "/about", label: "About us" },
  { path: "/study-hub", label: "Study Hub" },
  { path: "/study-hub/todo", label: "Study Hub — To do" },
  { path: "/study-hub/exams", label: "Study Hub — My exams & tests" },
  { path: "/study-hub/focus", label: "Study Hub — Study with me" },
  { path: "/login", label: "Sign in" },
  { path: "/register", label: "Register" },
];

/** Built-in home page sections, in their original order. */
export const HOME_BUILTINS: Array<{ key: string; label: string }> = [
  { key: "hero", label: "Hero" },
  { key: "feature1", label: "Feature row 1" },
  { key: "courses", label: "Courses strip" },
  { key: "exam_prep", label: "Exam prep panel" },
  { key: "packages", label: "Packages strip" },
  { key: "results", label: "Every question counts" },
  { key: "feature2", label: "Feature row 2" },
  { key: "universities", label: "Universities strip" },
  { key: "footer_cta", label: "Footer call to action" },
];

export const DEFAULT_HEADER_NAV: Array<Omit<NavItem, "id">> = [
  { placement: "header", label_en: "Universities", label_ar: "الجامعات", target_kind: "route", target_value: "/universities", style: "link", visibility: "all", visible: true, sort_order: 0 },
  { placement: "header", label_en: "My Courses", label_ar: "دوراتي", target_kind: "route", target_value: "/my/courses", style: "link", visibility: "auth", visible: true, sort_order: 1 },
  { placement: "header", label_en: "Packages", label_ar: "الباقات", target_kind: "route", target_value: "/packages", style: "link", visibility: "all", visible: true, sort_order: 2 },
  { placement: "header", label_en: "Resources", label_ar: "الموارد", target_kind: "route", target_value: "/committee", style: "pill", visibility: "all", visible: true, sort_order: 3 },
  { placement: "header", label_en: "Summaries", label_ar: "الملخصات", target_kind: "route", target_value: "/summaries", style: "link", visibility: "admin", visible: true, sort_order: 4 },
];

export const DEFAULT_HERO_NAV: Array<Omit<NavItem, "id">> = [
  { placement: "hero", label_en: "Go to my courses", label_ar: "اذهب إلى دوراتي", target_kind: "route", target_value: "/my/courses", style: "primary", visibility: "auth", visible: true, sort_order: 0 },
  { placement: "hero", label_en: "Get started", label_ar: "ابدأ الآن", target_kind: "route", target_value: "/register", style: "primary", visibility: "guest", visible: true, sort_order: 1 },
  { placement: "hero", label_en: "Sign in", label_ar: "تسجيل الدخول", target_kind: "route", target_value: "/login", style: "secondary", visibility: "guest", visible: true, sort_order: 2 },
];

export const DEFAULT_FOOTER_NAV: Array<Omit<NavItem, "id">> = [
  { placement: "footer", label_en: "About us", label_ar: "من نحن", target_kind: "route", target_value: "/about", style: "link", visibility: "all", visible: true, sort_order: 0 },
  { placement: "footer", label_en: "Support", label_ar: "الدعم", target_kind: "route", target_value: "/support", style: "link", visibility: "all", visible: true, sort_order: 1 },
];

/** Resolve a nav/button target into an href the app can navigate to. */
export function targetHref(kind: string, value: string): string {
  if (kind === "page") return `/p/${value}`;
  if (kind === "url") return value;
  return value || "/";
}

export function isExternal(kind: string, value: string): boolean {
  return kind === "url" && /^(https?:)?\/\//i.test(value);
}

export function navLabel(item: { label_en: string; label_ar: string }, lang: string) {
  return (lang === "ar" ? item.label_ar : item.label_en) || item.label_en || item.label_ar;
}

export function canSee(item: NavItem, opts: { signedIn: boolean; isAdmin: boolean }) {
  if (!item.visible) return false;
  // A link with no destination would silently land on the home page — hide it
  // until an admin picks where it should go.
  if (!item.target_value) return false;
  if (item.visibility === "auth") return opts.signedIn;
  if (item.visibility === "guest") return !opts.signedIn;
  if (item.visibility === "admin") return opts.isAdmin;
  return true;
}

async function fetchNav(placement: string): Promise<NavItem[]> {
  const { data } = await (supabase.from as any)("site_nav_items")
    .select("*")
    .eq("placement", placement)
    .order("sort_order", { ascending: true });
  return (data ?? []) as NavItem[];
}

/** Nav items for a placement, falling back to the built-in defaults. */
export function useNavItems(placement: "header" | "hero" | "footer") {
  const { data, isPending } = useQuery({
    queryKey: ["site-nav", placement],
    queryFn: () => fetchNav(placement),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
  });
  // While the real menu is unknown, render nothing rather than the built-in
  // fallback — otherwise hidden items flash in for a moment on first paint.
  if (data === undefined || isPending) return [] as NavItem[];
  if (data.length > 0) return data;
  const defaults =
    placement === "header" ? DEFAULT_HEADER_NAV : placement === "hero" ? DEFAULT_HERO_NAV : DEFAULT_FOOTER_NAV;
  const fallback = defaults.map((n, i) => ({ ...n, id: `default-${placement}-${i}` }) as NavItem);
  return fallback;
}

export function useCustomPages(onlyPublished = true) {
  const { data } = useQuery({
    queryKey: ["site-pages", onlyPublished],
    queryFn: async () => {
      let q = (supabase.from as any)("site_pages").select("*").eq("is_system", false);
      if (onlyPublished) q = q.eq("published", true);
      const { data } = await q.order("sort_order", { ascending: true });
      return (data ?? []) as SitePage[];
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
  });
  return data ?? [];
}

/** Sections + blocks of a page, assembled into a tree. */
export type SectionNode = SiteSection & { blocks: SiteBlock[]; children: SectionNode[] };

export async function fetchPageTree(pageId: string): Promise<SectionNode[]> {
  // Single round trip: sections with their blocks embedded.
  const { data } = await (supabase.from as any)("site_sections")
    .select("*, site_blocks(*)")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  return splitAndBuild(data);
}

/** Page tree by slug in a single round trip (no page lookup waterfall). */
export async function fetchPageTreeBySlug(slug: string): Promise<SectionNode[]> {
  const { data } = await (supabase.from as any)("site_pages")
    .select("id, site_sections(*, site_blocks(*))")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return [];
  return splitAndBuild(data.site_sections);
}

function splitAndBuild(rows: any[] | null | undefined): SectionNode[] {
  const sections: SiteSection[] = [];
  const blocks: SiteBlock[] = [];
  for (const row of rows ?? []) {
    const { site_blocks, ...section } = row;
    sections.push(section as SiteSection);
    for (const b of site_blocks ?? []) blocks.push(b as SiteBlock);
  }
  blocks.sort((a, b) => a.sort_order - b.sort_order);
  return buildTree(sections, blocks);
}

export function buildTree(sections: SiteSection[], blocks: SiteBlock[]): SectionNode[] {
  const byId = new Map<string, SectionNode>();
  const ids = new Set(sections.map((s) => s.id));
  for (const s of sections) byId.set(s.id, { ...s, blocks: [], children: [] });
  for (const b of blocks) byId.get(b.section_id)?.blocks.push(b);
  const roots: SectionNode[] = [];
  for (const s of sections) {
    const node = byId.get(s.id)!;
    if (s.parent_section_id && ids.has(s.parent_section_id)) {
      byId.get(s.parent_section_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: SectionNode[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}