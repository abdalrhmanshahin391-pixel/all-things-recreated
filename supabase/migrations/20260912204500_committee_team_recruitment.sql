-- Migration: Committee team visibility and recruitment link
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_team_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS committee_apply_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS committee_selection_title_en text NOT NULL DEFAULT 'We will choose the team members soon',
  ADD COLUMN IF NOT EXISTS committee_selection_title_ar text NOT NULL DEFAULT 'سيتم اختيار أعضاء اللجنة قريباً',
  ADD COLUMN IF NOT EXISTS committee_selection_subtitle_en text NOT NULL DEFAULT 'Applications to join لجنة الطب والجراحة are now open. If you have resources to share or wish to help other students, apply now.',
  ADD COLUMN IF NOT EXISTS committee_selection_subtitle_ar text NOT NULL DEFAULT 'باب التقديم للانضمام إلى فريق لجنة الطب والجراحة مفتوح الآن. إذا كنت ترغب في المساهمة في تنظيم المكتبة الأكاديمية ومساعدة زملائك، يمكنك التقديم الآن.';

GRANT SELECT (committee_team_visible, committee_apply_link, committee_selection_title_en, committee_selection_title_ar, committee_selection_subtitle_en, committee_selection_subtitle_ar) ON public.site_settings TO anon, authenticated;
