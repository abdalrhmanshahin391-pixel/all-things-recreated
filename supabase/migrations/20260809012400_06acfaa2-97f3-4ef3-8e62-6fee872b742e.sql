ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lock_kind text,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS lock_message text;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS terms_en text,
  ADD COLUMN IF NOT EXISTS terms_ar text,
  ADD COLUMN IF NOT EXISTS privacy_en text,
  ADD COLUMN IF NOT EXISTS privacy_ar text,
  ADD COLUMN IF NOT EXISTS study_hub_title text,
  ADD COLUMN IF NOT EXISTS study_hub_title_ar text,
  ADD COLUMN IF NOT EXISTS study_hub_subtitle text,
  ADD COLUMN IF NOT EXISTS study_hub_subtitle_ar text;

CREATE TABLE IF NOT EXISTS public.study_hub_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  label_ar text,
  description text,
  description_ar text,
  icon text NOT NULL DEFAULT 'Star',
  href text NOT NULL DEFAULT '',
  external boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.study_hub_tiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_hub_tiles TO authenticated;
GRANT ALL ON public.study_hub_tiles TO service_role;

ALTER TABLE public.study_hub_tiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_hub_tiles_read" ON public.study_hub_tiles;
CREATE POLICY "study_hub_tiles_read" ON public.study_hub_tiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "study_hub_tiles_admin_write" ON public.study_hub_tiles;
CREATE POLICY "study_hub_tiles_admin_write" ON public.study_hub_tiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS study_hub_tiles_touch ON public.study_hub_tiles;
CREATE TRIGGER study_hub_tiles_touch BEFORE UPDATE ON public.study_hub_tiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.account_active(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NULL
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id
          AND p.locked_at IS NOT NULL
          AND (p.lock_until IS NULL OR p.lock_until > now())
      );
$function$;
