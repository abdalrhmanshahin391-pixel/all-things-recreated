ALTER TABLE public.aquavision_jobs
  ADD COLUMN resource_kind text,
  ADD COLUMN resource_text text,
  ADD COLUMN resource_url text,
  ADD COLUMN resource_storage_path text,
  ADD COLUMN resource_name text,
  ADD COLUMN resource_mime text;

ALTER TABLE public.aquavision_items
  ADD COLUMN printed_choices jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.aquavision_jobs
  ADD CONSTRAINT aquavision_jobs_resource_kind_check
  CHECK (resource_kind IS NULL OR resource_kind IN ('text', 'link', 'pdf'));

CREATE POLICY "Admins manage AquaVisionX resource files"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'aquavision-resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'aquavision-resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);