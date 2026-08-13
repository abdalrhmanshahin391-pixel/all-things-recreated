ALTER TABLE public.university_tiles
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_note_en text NOT NULL DEFAULT 'Coming soon',
  ADD COLUMN IF NOT EXISTS lock_note_ar text NOT NULL DEFAULT 'قريبًا',
  ADD COLUMN IF NOT EXISTS lock_color text NOT NULL DEFAULT 'amber';