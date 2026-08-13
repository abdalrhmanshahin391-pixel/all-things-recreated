REVOKE SELECT ON public.site_settings FROM anon, authenticated;

GRANT SELECT (id, site_name, tagline, logo_url, updated_at, theme, show_signature, protect_enabled, protect_watermark_opacity, protect_blur_on_blur, protect_block_print, protect_block_copy, protect_consent_required, protect_devtools_guard, protect_auto_lock_threshold, protect_terms_en, protect_terms_ar, committee_default_storage, brand_style, study_plan_path, study_plan_title, study_plan_subtitle, terms_en, terms_ar, privacy_en, privacy_ar, study_hub_title, study_hub_title_ar, study_hub_subtitle, study_hub_subtitle_ar)
ON public.site_settings TO anon, authenticated;

GRANT ALL ON public.site_settings TO service_role;