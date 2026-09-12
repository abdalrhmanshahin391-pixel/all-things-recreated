-- Migration: Packages Center Enhancements
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2) CHECK (original_price IS NULL OR original_price >= 0),
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS package_kind text NOT NULL DEFAULT 'courses',
  ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS choice_count integer NOT NULL DEFAULT 3 CHECK (choice_count >= 1),
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;
