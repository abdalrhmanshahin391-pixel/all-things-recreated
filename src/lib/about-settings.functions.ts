import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export interface AboutHeroSettings {
  sentenceEn: string;
  sentenceAr: string;
}

export const DEFAULT_ABOUT_SETTINGS: AboutHeroSettings = {
  sentenceEn: "Medical Question Bank & Clinical Cases — Empowering the next generation of physicians.",
  sentenceAr: "بنك الأسئلة والحالات السريرية الطبية — نحو تمكين جيل الأطباء القادم.",
};

let cachedAboutSettings: AboutHeroSettings | null = null;
let lastFetchTime = 0;

export const getAboutHeroSettings = createServerFn({ method: "GET" })
  .handler(async (): Promise<AboutHeroSettings> => {
    // 5-second in-memory cache
    if (cachedAboutSettings && Date.now() - lastFetchTime < 5000) {
      return cachedAboutSettings;
    }

    try {
      const { data, error } = await (supabase.from as any)("site_settings")
        .select("about_sentence_en, about_sentence_ar")
        .eq("id", true)
        .maybeSingle();

      if (!error && data && (data.about_sentence_en !== undefined || data.about_sentence_ar !== undefined)) {
        cachedAboutSettings = {
          sentenceEn: data.about_sentence_en || DEFAULT_ABOUT_SETTINGS.sentenceEn,
          sentenceAr: data.about_sentence_ar || DEFAULT_ABOUT_SETTINGS.sentenceAr,
        };
        lastFetchTime = Date.now();
        return cachedAboutSettings;
      }
    } catch {
      // fallback
    }

    // Try storage fallback
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: fileData, error: fileErr } = await supabaseAdmin.storage
        .from("committee-files")
        .download("config/about_settings.json");
      if (!fileErr && fileData) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        cachedAboutSettings = { ...DEFAULT_ABOUT_SETTINGS, ...parsed };
        lastFetchTime = Date.now();
        return cachedAboutSettings!;
      }
    } catch {
      // ignore
    }

    return cachedAboutSettings || DEFAULT_ABOUT_SETTINGS;
  });

export const updateAboutHeroSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: Partial<AboutHeroSettings>) => data)
  .handler(async ({ data, context }) => {
    // Check permission: Admin or Committee Head
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isCommitteeHead } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "committee_head",
    });
    if (!isAdmin && !isCommitteeHead) {
      throw new Error("Unauthorized: Only admins can change about settings");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Read current settings
    const current = await getAboutHeroSettings();
    const updated: AboutHeroSettings = {
      sentenceEn: data.sentenceEn !== undefined ? String(data.sentenceEn).trim() : current.sentenceEn,
      sentenceAr: data.sentenceAr !== undefined ? String(data.sentenceAr).trim() : current.sentenceAr,
    };

    // Update database table
    try {
      await (supabaseAdmin.from as any)("site_settings").upsert(
        {
          id: true,
          about_sentence_en: updated.sentenceEn,
          about_sentence_ar: updated.sentenceAr,
        },
        { onConflict: "id" }
      );
    } catch (e) {
      console.warn("Could not update site_settings table for about hero sentence:", e);
    }

    // Mirror to committee-files storage
    try {
      const payload = JSON.stringify(updated, null, 2);
      await supabaseAdmin.storage
        .from("committee-files")
        .upload("config/about_settings.json", new Blob([payload], { type: "application/json" }), {
          upsert: true,
          contentType: "application/json",
        });
    } catch (e) {
      console.warn("Could not write about_settings.json to storage:", e);
    }

    cachedAboutSettings = updated;
    lastFetchTime = Date.now();

    return { ok: true, settings: updated };
  });
