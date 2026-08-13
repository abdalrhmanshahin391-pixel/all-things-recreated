GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_groups TO authenticated;
GRANT ALL ON public.user_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_group_members TO authenticated;
GRANT ALL ON public.user_group_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_announcements TO authenticated;
GRANT SELECT ON public.site_announcements TO anon;
GRANT ALL ON public.site_announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_audiences TO authenticated;
GRANT ALL ON public.announcement_audiences TO service_role;

ALTER TABLE public.site_announcements ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.site_announcements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%style%'
  LOOP
    EXECUTE format('ALTER TABLE public.site_announcements DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_announcements
  ADD CONSTRAINT site_announcements_style_check
  CHECK (style IN ('ribbon','floating','spotlight','modal','marquee','toast','strip','inline'));