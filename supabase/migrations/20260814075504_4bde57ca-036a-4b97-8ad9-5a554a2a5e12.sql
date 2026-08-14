ALTER TABLE public.aquavision_jobs ADD COLUMN IF NOT EXISTS reference_book text;
ALTER TABLE public.patch_prox_jobs ADD COLUMN IF NOT EXISTS reference_book text;