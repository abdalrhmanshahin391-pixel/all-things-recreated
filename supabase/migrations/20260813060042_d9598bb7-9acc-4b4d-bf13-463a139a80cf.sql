-- 1. Remove blanket signed-in read on storage
DROP POLICY IF EXISTS "storage_read_signed_in" ON storage.objects;
DROP POLICY IF EXISTS "committee members read" ON storage.objects;

-- Helper: can current user access a committee subject's materials?
CREATE OR REPLACE FUNCTION public.can_access_committee_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.account_active(auth.uid())
     AND (
       public.can_manage_committee(auth.uid())
       OR NOT EXISTS (
         SELECT 1 FROM public.committee_subject_courses csc
         WHERE csc.subject_id = _subject_id
       )
       OR EXISTS (
         SELECT 1 FROM public.committee_subject_courses csc
         JOIN public.user_courses uc
           ON uc.course_id = csc.course_id AND uc.user_id = auth.uid()
         WHERE csc.subject_id = _subject_id
       )
     );
$$;

REVOKE ALL ON FUNCTION public.can_access_committee_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_committee_subject(uuid) TO authenticated, service_role;

-- 2. committee_resources gated by subject entitlement
DROP POLICY IF EXISTS "members read resources" ON public.committee_resources;
CREATE POLICY "entitled members read resources"
ON public.committee_resources
FOR SELECT
TO authenticated
USING (
  public.can_manage_committee(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.committee_categories c
    WHERE c.id = committee_resources.category_id
      AND public.can_access_committee_subject(c.subject_id)
  )
);

-- 3. committee storage buckets: managers or entitled users only
CREATE POLICY "committee files readable by entitled users"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = ANY (ARRAY['committee-files','committee-images'])
  AND (
    public.can_manage_committee(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.committee_resources r
      JOIN public.committee_categories c ON c.id = r.category_id
      WHERE r.file_path = objects.name
        AND public.can_access_committee_subject(c.subject_id)
    )
  )
);

-- 4. admin hub layout: admins only
DROP POLICY IF EXISTS "Authenticated can read admin hub layout" ON public.admin_hub_layout;
CREATE POLICY "Admins read admin hub layout"
ON public.admin_hub_layout
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5. Revoke anon execution on all public functions, re-grant only public ones
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;