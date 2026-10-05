-- AQUA version of the committee page.
-- 1) Summaries live in the existing committee categories/resources, in categories whose section is 'aqua'.
-- 2) Every year / semester / module / subject is "coming soon" in the AQUA version until a row here opens it.

ALTER TABLE public.committee_categories DROP CONSTRAINT IF EXISTS committee_categories_section_check;
ALTER TABLE public.committee_categories
  ADD CONSTRAINT committee_categories_section_check CHECK (section IN ('resources', 'books', 'aqua'));

CREATE TABLE IF NOT EXISTS public.committee_aqua_state (
  node_type text NOT NULL CHECK (node_type IN ('year', 'semester', 'module', 'subject')),
  node_id uuid NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_type, node_id)
);

GRANT SELECT ON public.committee_aqua_state TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.committee_aqua_state TO authenticated;
GRANT ALL ON public.committee_aqua_state TO service_role;

ALTER TABLE public.committee_aqua_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aqua state readable by everyone" ON public.committee_aqua_state
  FOR SELECT TO anon, authenticated USING (true);

-- Opening a year follows the same rule as editing a year; everything below it follows the committee rule.
CREATE POLICY "committee manages aqua state" ON public.committee_aqua_state
  FOR ALL TO authenticated
  USING (
    CASE WHEN node_type = 'year'
      THEN public.can_manage_committee_years(auth.uid())
      ELSE public.can_manage_committee(auth.uid())
    END
  )
  WITH CHECK (
    CASE WHEN node_type = 'year'
      THEN public.can_manage_committee_years(auth.uid())
      ELSE public.can_manage_committee(auth.uid())
    END
  );