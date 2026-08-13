ALTER TABLE public.committee_resources
  ADD COLUMN IF NOT EXISTS allow_preview boolean NOT NULL DEFAULT true;