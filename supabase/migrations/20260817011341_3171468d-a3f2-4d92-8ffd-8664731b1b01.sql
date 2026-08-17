CREATE OR REPLACE FUNCTION public.can_manage_committee_years(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id,'admin'::public.app_role)
      OR public.has_role(_user_id,'committee_head'::public.app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_committee_years(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_committee_years(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "committee manage years" ON public.committee_years;
CREATE POLICY "head manage years" ON public.committee_years
  FOR ALL TO authenticated
  USING (public.can_manage_committee_years(auth.uid()))
  WITH CHECK (public.can_manage_committee_years(auth.uid()));

DROP POLICY IF EXISTS "committee_members_manage" ON public.committee_members;
CREATE POLICY "head manage staff cards" ON public.committee_members
  FOR ALL TO authenticated
  USING (public.can_manage_committee_members(auth.uid()))
  WITH CHECK (public.can_manage_committee_members(auth.uid()));