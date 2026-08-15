CREATE TABLE public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled ad',
  template text not null default 'offer',
  design jsonb not null default '{}'::jsonb,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO authenticated;
GRANT ALL ON public.ad_creatives TO service_role;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ad creatives" ON public.ad_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ad_creatives_touch BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admins read ad media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write ad media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update ad media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete ad media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));