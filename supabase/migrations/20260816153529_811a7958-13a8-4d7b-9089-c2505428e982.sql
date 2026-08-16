ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_qr_path text,
  ADD COLUMN IF NOT EXISTS committee_qr_link text;

UPDATE public.site_settings
SET committee_qr_link = COALESCE(committee_qr_link, 'https://t.me/aquaqbank')
WHERE id = true;