import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    site_name?: string;
    brand_style?: string;
    header_style?: string;
    tagline?: string;
    logo_url?: string | null;
    theme?: string;
    show_signature?: boolean;
    protect_enabled?: boolean;
    protect_watermark_opacity?: number;
    protect_blur_on_blur?: boolean;
    protect_block_print?: boolean;
    protect_block_copy?: boolean;
    protect_consent_required?: boolean;
    protect_devtools_guard?: boolean;
    protect_auto_lock_threshold?: number;
    protect_terms_en?: string | null;
    protect_terms_ar?: string | null;
    terms_en?: string | null;
    terms_ar?: string | null;
    privacy_en?: string | null;
    privacy_ar?: string | null;
    refund_en?: string | null;
    refund_ar?: string | null;
    study_hub_title?: string | null;
    study_hub_title_ar?: string | null;
    study_hub_subtitle?: string | null;
    study_hub_subtitle_ar?: string | null;
  }) => {
    if (data.site_name !== undefined && !data.site_name.trim()) {
      throw new Error("site_name cannot be empty");
    }
    if (data.brand_style !== undefined) {
      const allowed = ["aqua-flow", "split-weight", "droplet-badge", "outline-wave", "platform-lock", "droplet-platform", "stacked-platform", "gradient-q-badge"];
      if (!allowed.includes(data.brand_style)) throw new Error("Unknown brand style");
    }
    if (data.header_style !== undefined) {
      const allowed = ["terminal", "institutional", "modern", "editorial"];
      if (!allowed.includes(data.header_style)) throw new Error("Unknown header design");
    }
    if (data.theme !== undefined) {
      const allowed = [
        "default",
        "ramadan",
        "eid",
        "christmas",
        "summer",
        "winter",
        "fireworks",
        "stars",
        "golden-age",
        "parchment",
        "andalus",
        "desert-night",
        "emerald-library",
        "academy",
      ];
      if (!allowed.includes(data.theme)) throw new Error("Unknown theme");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { id: true };
    if (data.site_name !== undefined) patch.site_name = data.site_name.trim();
    if (data.brand_style !== undefined) patch.brand_style = data.brand_style;
    if (data.header_style !== undefined) patch.header_style = data.header_style;
    if (data.tagline !== undefined) patch.tagline = data.tagline.trim();
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.show_signature !== undefined) patch.show_signature = data.show_signature;
    for (const key of [
      "protect_enabled",
      "protect_watermark_opacity",
      "protect_blur_on_blur",
      "protect_block_print",
      "protect_block_copy",
      "protect_consent_required",
      "protect_devtools_guard",
      "protect_auto_lock_threshold",
      "protect_terms_en",
      "protect_terms_ar",
      "terms_en",
      "terms_ar",
      "privacy_en",
      "privacy_ar",
      "refund_en",
      "refund_ar",
      "study_hub_title",
      "study_hub_title_ar",
      "study_hub_subtitle",
      "study_hub_subtitle_ar",
    ] as const) {
      if (data[key] !== undefined) patch[key] = data[key];
    }

    // Upsert so an empty settings table can never silently swallow a change.
    const { error } = await (supabaseAdmin.from as any)("site_settings")
      .upsert(patch, { onConflict: "id" });
    if (error) throw error;
    // Bust the short-lived bootstrap cache so the next render (and the theme
    // boot script) already carries the new value instead of the old one.
    try {
      const { invalidateSiteBootstrapCache } = await import("@/lib/site-bootstrap.server");
      invalidateSiteBootstrapCache();
    } catch {
      /* ignore */
    }
    return { ok: true };
  });
