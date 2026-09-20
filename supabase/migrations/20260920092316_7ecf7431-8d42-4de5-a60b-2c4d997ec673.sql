CREATE POLICY "amg_pages_objects_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amg-pages' AND public.can_use_amg(auth.uid()));