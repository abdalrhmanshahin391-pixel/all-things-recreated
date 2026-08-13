-- Read: any signed-in user
CREATE POLICY "storage_read_signed_in"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos'));

-- Write: admins on every app bucket
CREATE POLICY "storage_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "storage_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "storage_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

-- Committee managers can manage committee content
CREATE POLICY "storage_committee_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('committee-files','committee-images')
  AND public.can_manage_committee(auth.uid())
);

CREATE POLICY "storage_committee_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()))
WITH CHECK (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()));

CREATE POLICY "storage_committee_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()));
