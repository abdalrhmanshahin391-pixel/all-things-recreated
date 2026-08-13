DROP POLICY IF EXISTS "committee public read" ON storage.objects;
CREATE POLICY "committee members read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images'::text, 'committee-files'::text])
    AND public.account_active(auth.uid())
  );

DROP POLICY IF EXISTS "german_subjects read auth" ON public.german_subjects;
CREATE POLICY "german_subjects read owners" ON public.german_subjects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_owns_any_german_course(auth.uid())
  );