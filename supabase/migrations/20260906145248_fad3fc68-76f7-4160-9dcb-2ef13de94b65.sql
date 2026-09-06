ALTER TABLE public.lecture_items
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

CREATE POLICY "lecture pdfs writable by admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs updatable by admin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs deletable by admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs readable by owners"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lecture-pdfs'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.lecture_items i
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.user_lecture_courses ulc
        ON ulc.course_id = s.course_id AND ulc.user_id = auth.uid()
      WHERE i.pdf_storage_path = objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.lecture_items i
      WHERE i.pdf_storage_path = objects.name AND i.is_free = true
    )
  )
);