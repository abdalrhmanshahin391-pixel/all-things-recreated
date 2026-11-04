-- Course pictures and the home page clips get a stable public URL so a browser can keep them
-- for a year (a signed URL changes every time, so nothing could be reused).

-- 1. Course pictures: public bucket, and a one-year cache on the pictures already uploaded.
UPDATE storage.buckets SET public = true WHERE id = 'course-images';

UPDATE storage.objects
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cacheControl}', '"max-age=31536000"')
WHERE bucket_id = 'course-images';

-- 2. Home page clips (qbank / lectures / resources): public bucket, only admins can write.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('showcase', 'showcase', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "showcase admin insert" ON storage.objects;
CREATE POLICY "showcase admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'showcase' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "showcase admin delete" ON storage.objects;
CREATE POLICY "showcase admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'showcase' AND public.has_role(auth.uid(), 'admin'));
