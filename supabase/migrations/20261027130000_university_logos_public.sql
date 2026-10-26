-- University covers and logos: public bucket so each picture has one fixed URL that a browser
-- keeps for a year, and a one-year cache time on the pictures already uploaded.
UPDATE storage.buckets SET public = true WHERE id = 'university-logos';

UPDATE storage.objects
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cacheControl}', '"max-age=31536000"')
WHERE bucket_id = 'university-logos';
