-- 1. Prevent self-escalation / self-unlock through profile updates
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.locked_at   := OLD.locked_at;
  NEW.lock_until  := OLD.lock_until;
  NEW.lock_reason := OLD.lock_reason;
  NEW.device_limit := OLD.device_limit;
  NEW.email       := OLD.email;
  NEW.id          := OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 2. Hide the internal notification email from public reads
DROP POLICY IF EXISTS "Anyone can view support settings" ON public.support_settings;

CREATE OR REPLACE VIEW public.support_settings_public AS
SELECT id, page_enabled, form_enabled, channels_enabled,
       intro_title_en, intro_title_ar, intro_text_en, intro_text_ar,
       response_note_en, response_note_ar, categories
FROM public.support_settings;

GRANT SELECT ON public.support_settings_public TO anon, authenticated;