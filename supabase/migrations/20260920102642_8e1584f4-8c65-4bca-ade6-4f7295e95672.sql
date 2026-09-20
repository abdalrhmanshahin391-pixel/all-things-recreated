CREATE OR REPLACE FUNCTION public.can_review_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.can_review_amg(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_amg(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_use_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role)
      OR public.has_role(_user_id, 'committee_head'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role);
$$;

DROP POLICY IF EXISTS amg_groups_staff ON public.amg_groups;
CREATE POLICY amg_groups_staff ON public.amg_groups FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_items_staff ON public.amg_items;
CREATE POLICY amg_items_staff ON public.amg_items FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_pages_staff ON public.amg_pages;
CREATE POLICY amg_pages_staff ON public.amg_pages FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_events_staff_read ON public.amg_events;
CREATE POLICY amg_events_staff_read ON public.amg_events FOR SELECT TO authenticated
  USING (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_events_staff_write ON public.amg_events;
CREATE POLICY amg_events_staff_write ON public.amg_events FOR INSERT TO authenticated
  WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_pages_read ON storage.objects;
DROP POLICY IF EXISTS amg_pages_write ON storage.objects;
CREATE POLICY amg_pages_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()));
CREATE POLICY amg_pages_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()));