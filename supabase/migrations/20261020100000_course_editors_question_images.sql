-- QBank course editors can add, replace and remove question pictures.
-- The question-images bucket only let admins write, so "Replace picture" failed for them and an old picture could not be deleted.
-- They may write only inside the manual/ folder (pictures added by hand), and only while they are an active course editor.

CREATE OR REPLACE FUNCTION public.is_active_course_editor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'qbank'::public.app_role)
     AND EXISTS (SELECT 1 FROM public.course_question_editors e WHERE e.user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_course_editor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_course_editor(uuid) TO authenticated;

DROP POLICY IF EXISTS "Course editors upload question pictures" ON storage.objects;
CREATE POLICY "Course editors upload question pictures" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-images' AND name LIKE 'manual/%' AND (SELECT public.is_active_course_editor((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Course editors delete manual question pictures" ON storage.objects;
CREATE POLICY "Course editors delete manual question pictures" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-images' AND name LIKE 'manual/%' AND (SELECT public.is_active_course_editor((SELECT auth.uid()))));
