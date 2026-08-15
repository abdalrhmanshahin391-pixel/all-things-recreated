CREATE POLICY "member_photos_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'member-photos');

CREATE POLICY "member_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));

CREATE POLICY "member_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()))
  WITH CHECK (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));

CREATE POLICY "member_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));