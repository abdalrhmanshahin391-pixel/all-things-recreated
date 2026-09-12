import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export interface CommitteeRecruitmentSettings {
  teamVisible: boolean;
  applyLink: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
}

export const DEFAULT_RECRUITMENT_SETTINGS: CommitteeRecruitmentSettings = {
  teamVisible: true,
  applyLink: "",
  titleEn: "We will choose the team members soon",
  titleAr: "سيتم اختيار أعضاء اللجنة قريباً",
  subtitleEn: "Applications to join لجنة الطب والجراحة are now open. If you have resources to share or wish to help fellow students, apply now.",
  subtitleAr: "باب التقديم للانضمام إلى فريق لجنة الطب والجراحة مفتوح الآن. إذا كنت ترغب في المساهمة في تنظيم المكتبة الأكاديمية ومساعدة زملائك، يمكنك التقديم الآن.",
};

let cachedSettings: CommitteeRecruitmentSettings | null = null;
let lastFetchTime = 0;

export const getCommitteeRecruitmentSettings = createServerFn({ method: "GET" })
  .handler(async (): Promise<CommitteeRecruitmentSettings> => {
    // 5-second in-memory cache
    if (cachedSettings && Date.now() - lastFetchTime < 5000) {
      return cachedSettings;
    }

    try {
      const { data, error } = await (supabase.from as any)("site_settings")
        .select("committee_team_visible, committee_apply_link, committee_selection_title_en, committee_selection_title_ar, committee_selection_subtitle_en, committee_selection_subtitle_ar")
        .eq("id", true)
        .maybeSingle();

      if (!error && data && data.committee_team_visible !== undefined && data.committee_team_visible !== null) {
        cachedSettings = {
          teamVisible: Boolean(data.committee_team_visible),
          applyLink: data.committee_apply_link ?? DEFAULT_RECRUITMENT_SETTINGS.applyLink,
          titleEn: data.committee_selection_title_en || DEFAULT_RECRUITMENT_SETTINGS.titleEn,
          titleAr: data.committee_selection_title_ar || DEFAULT_RECRUITMENT_SETTINGS.titleAr,
          subtitleEn: data.committee_selection_subtitle_en || DEFAULT_RECRUITMENT_SETTINGS.subtitleEn,
          subtitleAr: data.committee_selection_subtitle_ar || DEFAULT_RECRUITMENT_SETTINGS.subtitleAr,
        };
        lastFetchTime = Date.now();
        return cachedSettings;
      }
    } catch {
      // fallback
    }

    // Try storage fallback
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: fileData, error: fileErr } = await supabaseAdmin.storage
        .from("committee-files")
        .download("config/recruitment_settings.json");
      if (!fileErr && fileData) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        cachedSettings = { ...DEFAULT_RECRUITMENT_SETTINGS, ...parsed };
        lastFetchTime = Date.now();
        return cachedSettings!;
      }
    } catch {
      // ignore
    }

    return cachedSettings || DEFAULT_RECRUITMENT_SETTINGS;
  });

export const updateCommitteeRecruitmentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: Partial<CommitteeRecruitmentSettings>) => data)
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
      throw new Error("Unauthorized: Only admins and committee heads can change recruitment settings");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Read current settings
    const current = await getCommitteeRecruitmentSettings();
    const updated: CommitteeRecruitmentSettings = {
      teamVisible: data.teamVisible !== undefined ? Boolean(data.teamVisible) : current.teamVisible,
      applyLink: data.applyLink !== undefined ? String(data.applyLink).trim() : current.applyLink,
      titleEn: data.titleEn !== undefined ? String(data.titleEn).trim() : current.titleEn,
      titleAr: data.titleAr !== undefined ? String(data.titleAr).trim() : current.titleAr,
      subtitleEn: data.subtitleEn !== undefined ? String(data.subtitleEn).trim() : current.subtitleEn,
      subtitleAr: data.subtitleAr !== undefined ? String(data.subtitleAr).trim() : current.subtitleAr,
    };

    // Update memory cache
    cachedSettings = updated;
    lastFetchTime = Date.now();

    // 1. Try updating site_settings table
    try {
      await (supabaseAdmin.from as any)("site_settings").update({
        committee_team_visible: updated.teamVisible,
        committee_apply_link: updated.applyLink,
        committee_selection_title_en: updated.titleEn,
        committee_selection_title_ar: updated.titleAr,
        committee_selection_subtitle_en: updated.subtitleEn,
        committee_selection_subtitle_ar: updated.subtitleAr,
      }).eq("id", true);
    } catch {
      // column may not exist yet in DB
    }

    // 2. Also write to storage backup
    try {
      const buffer = Buffer.from(JSON.stringify(updated, null, 2), "utf8");
      await supabaseAdmin.storage
        .from("committee-files")
        .upload("config/recruitment_settings.json", buffer, {
          contentType: "application/json",
          upsert: true,
        });
    } catch {
      // ignore
    }

    return { ok: true, settings: updated };
  });
