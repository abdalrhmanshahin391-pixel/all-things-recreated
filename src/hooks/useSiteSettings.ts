import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteTheme =
  | "default"
  | "ramadan"
  | "eid"
  | "christmas"
  | "summer"
  | "winter"
  | "fireworks"
  | "stars"
  | "golden-age"
  | "parchment"
  | "andalus"
  | "desert-night"
  | "emerald-library"
  | "academy";

export type SiteSettings = {
  site_name: string;
  brand_style: string;
  header_style: string;
  tagline: string;
  logo_url: string | null;
  theme: SiteTheme;
  show_signature: boolean;
  protect_enabled: boolean;
  protect_watermark_opacity: number;
  protect_blur_on_blur: boolean;
  protect_block_print: boolean;
  protect_block_copy: boolean;
  protect_consent_required: boolean;
  protect_devtools_guard: boolean;
  protect_auto_lock_threshold: number;
  protect_terms_en: string | null;
  protect_terms_ar: string | null;
  terms_en: string | null;
  terms_ar: string | null;
  privacy_en: string | null;
  privacy_ar: string | null;
  refund_en: string | null;
  refund_ar: string | null;
  study_hub_title: string | null;
  study_hub_title_ar: string | null;
  study_hub_subtitle: string | null;
  study_hub_subtitle_ar: string | null;
};

const DEFAULTS: SiteSettings = {
  site_name: "AquaQBank",
  brand_style: "aqua-flow",
  header_style: "institutional",
  tagline: "Academy — Medical Question Bank & Study Materials",
  logo_url: null,
  theme: "default",
  show_signature: true,
  protect_enabled: true,
  protect_watermark_opacity: 0.1,
  protect_blur_on_blur: true,
  protect_block_print: true,
  protect_block_copy: true,
  protect_consent_required: true,
  protect_devtools_guard: true,
  protect_auto_lock_threshold: 12,
  protect_terms_en: null,
  protect_terms_ar: null,
  terms_en: null,
  terms_ar: null,
  privacy_en: null,
  privacy_ar: null,
  refund_en: null,
  refund_ar: null,
  study_hub_title: null,
  study_hub_title_ar: null,
  study_hub_subtitle: null,
  study_hub_subtitle_ar: null,
};

export function normalizeSettings(data: any | null): SiteSettings {
  if (!data) return DEFAULTS;
  return {
    ...DEFAULTS,
    ...data,
    site_name: data.site_name ?? DEFAULTS.site_name,
    brand_style: data.brand_style ?? DEFAULTS.brand_style,
    header_style: data.header_style ?? DEFAULTS.header_style,
    tagline: data.tagline ?? DEFAULTS.tagline,
    logo_url: data.logo_url ?? null,
    theme: (data.theme ?? "default") as SiteTheme,
    show_signature: data.show_signature ?? true,
    protect_watermark_opacity: Number(data.protect_watermark_opacity ?? 0.1),
    protect_auto_lock_threshold: Number(data.protect_auto_lock_threshold ?? 12),
  };
}

async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await (supabase.from as any)("site_settings").select("id,site_name,tagline,logo_url,updated_at,theme,show_signature,protect_enabled,protect_watermark_opacity,protect_blur_on_blur,protect_block_print,protect_block_copy,protect_consent_required,protect_devtools_guard,protect_auto_lock_threshold,protect_terms_en,protect_terms_ar,committee_default_storage,brand_style,header_style,study_plan_path,study_plan_title,study_plan_subtitle,terms_en,terms_ar,privacy_en,privacy_ar,refund_en,refund_ar,study_hub_title,study_hub_title_ar,study_hub_subtitle,study_hub_subtitle_ar")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return normalizeSettings(data);
}

export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: fetchSiteSettings,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  return data ?? DEFAULTS;
}
