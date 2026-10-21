-- Lecture staff (a teacher assigned to a lecture course) could not upload a lesson video or PDF:
--  * the file path did not contain the course id, which their write rule requires (the page now puts it there), and
--  * they had no READ rule on the lecture-videos / lecture-pdfs buckets, so the upload could not be completed and
--    their own uploads could not be previewed.
-- This lets staff read the files of their own course: new ones (path contains the course id) and the old ones that a lesson
-- of their course points to.

DROP POLICY IF EXISTS "lecture staff read lecture files" ON storage.objects;
CREATE POLICY "lecture staff read lecture files" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id IN ('lecture-pdfs', 'lecture-videos')
  AND EXISTS (
    SELECT 1 FROM public.lecture_staff s
    WHERE s.user_id = auth.uid()
      AND (
        storage.objects.name LIKE '%' || s.course_id::text || '%'
        OR EXISTS (
          SELECT 1
          FROM public.lecture_items i
          JOIN public.lecture_subjects ls ON ls.id = i.subject_id
          WHERE ls.course_id = s.course_id
            AND (i.video_storage_path = storage.objects.name OR i.pdf_storage_path = storage.objects.name)
        )
      )
  )
);
