ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS refund_en text,
  ADD COLUMN IF NOT EXISTS refund_ar text;