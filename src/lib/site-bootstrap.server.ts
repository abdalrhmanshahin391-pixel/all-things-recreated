import { createClient } from "@supabase/supabase-js";

export type BootstrapSettings = Record<string, string | number | boolean | null>;

export type BootstrapData = {
  settings: BootstrapSettings | null;
  content: Array<{ key: string; value_en: string | null; value_ar: string | null }>;
  nav: Array<Record<string, any>>;
};

const SETTINGS_COLUMNS =
  "id,site_name,tagline,logo_url,updated_at,theme,show_signature,protect_enabled,protect_watermark_opacity,protect_blur_on_blur,protect_block_print,protect_block_copy,protect_consent_required,protect_devtools_guard,protect_auto_lock_threshold,protect_terms_en,protect_terms_ar,committee_default_storage,brand_style,header_style,study_plan_path,study_plan_title,study_plan_subtitle,terms_en,terms_ar,privacy_en,privacy_ar,refund_en,refund_ar,study_hub_title,study_hub_title_ar,study_hub_subtitle,study_hub_subtitle_ar";

const EMPTY: BootstrapData = { settings: null, content: [], nav: [] };

/**
 * These three tables are tiny, identical for every visitor, and were being
 * re-queried on literally every server render (thousands of sequential scans).
 * A short in-instance cache turns that into ~1 query per minute per worker,
 * which is the single biggest backend saving as traffic grows.
 */
const CACHE_TTL_MS = 60_000;
let cached: { at: number; data: BootstrapData } | null = null;
let inFlight: Promise<BootstrapData> | null = null;

async function load(): Promise<BootstrapData> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return EMPTY;

  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const [settingsRes, contentRes, navRes] = await Promise.all([
    (client.from as any)("site_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle(),
    (client.from as any)("site_content").select("key,value_en,value_ar"),
    (client.from as any)("site_nav_items").select("*").order("sort_order", { ascending: true }),
  ]);

  return {
    settings: (settingsRes.data as BootstrapSettings | null) ?? null,
    content: (contentRes.data ?? []) as BootstrapData["content"],
    nav: (navRes.data ?? []) as BootstrapData["nav"],
  };
}

/** Drop the cache so the very next render sees a just-saved settings change. */
export function invalidateSiteBootstrapCache() {
  cached = null;
}

export async function loadSiteBootstrap(): Promise<BootstrapData> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.data;
  // Collapse concurrent misses into a single database round-trip.
  if (!inFlight) {
    inFlight = load()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .catch(() => cached?.data ?? EMPTY)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
