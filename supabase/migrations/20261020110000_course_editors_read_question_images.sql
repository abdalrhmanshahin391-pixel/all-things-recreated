-- Course editors could change the TEXT of a question but not its picture.
-- The question-images bucket had no read (SELECT) rule for them. Without it:
--   * the picture cannot be shown to them ("This question image could not be loaded"),
--   * an upload fails (the storage API reads the new row back after inserting it),
--   * deleting the old picture is refused.
-- Admins read through their own admin rule; students through the course rules. This gives the same read access to active course editors.

DROP POLICY IF EXISTS "Course editors read question pictures" ON storage.objects;
CREATE POLICY "Course editors read question pictures" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-images' AND (SELECT public.is_active_course_editor((SELECT auth.uid()))));
