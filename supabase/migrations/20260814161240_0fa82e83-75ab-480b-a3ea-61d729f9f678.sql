ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note_en text,
  ADD COLUMN IF NOT EXISTS closed_note_ar text,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;