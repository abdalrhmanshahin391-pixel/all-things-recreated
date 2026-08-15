CREATE TABLE public.committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'JO',
  country_label text NOT NULL DEFAULT '',
  year_label text NOT NULL DEFAULT '',
  role_label text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  accent smallint NOT NULL DEFAULT 1,
  is_founder boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.committee_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_members TO authenticated;
GRANT ALL ON public.committee_members TO service_role;

ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "committee_members_public_read" ON public.committee_members
  FOR SELECT USING (true);

CREATE POLICY "committee_members_manage" ON public.committee_members
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));

CREATE TRIGGER committee_members_touch
  BEFORE UPDATE ON public.committee_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();