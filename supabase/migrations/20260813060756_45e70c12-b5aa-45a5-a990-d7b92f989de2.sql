DROP VIEW IF EXISTS public.support_settings_public;

CREATE POLICY "Anyone can view support settings"
ON public.support_settings FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.support_settings FROM anon, authenticated;
GRANT SELECT (id, page_enabled, form_enabled, channels_enabled,
  intro_title_en, intro_title_ar, intro_text_en, intro_text_ar,
  response_note_en, response_note_ar, categories, created_at, updated_at)
ON public.support_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_support_notify()
RETURNS TABLE(notify_enabled boolean, notify_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT s.notify_enabled, s.notify_email FROM public.support_settings s WHERE s.id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_support_notify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_notify() TO authenticated, service_role;