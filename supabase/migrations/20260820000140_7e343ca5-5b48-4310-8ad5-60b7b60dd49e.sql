CREATE TABLE public.committee_best_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'book',
  rating integer NOT NULL DEFAULT 5,
  note text,
  url text,
  resource_id uuid REFERENCES public.committee_resources(id) ON DELETE SET NULL,
  is_top boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX committee_best_sources_subject_idx ON public.committee_best_sources(subject_id);

GRANT SELECT ON public.committee_best_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_best_sources TO authenticated;
GRANT ALL ON public.committee_best_sources TO service_role;

ALTER TABLE public.committee_best_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read best sources" ON public.committee_best_sources FOR SELECT USING (true);
CREATE POLICY "committee manage best sources" ON public.committee_best_sources FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));

CREATE TRIGGER committee_best_sources_touch BEFORE UPDATE ON public.committee_best_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_subjects ADD COLUMN best_sources_enabled boolean NOT NULL DEFAULT false;