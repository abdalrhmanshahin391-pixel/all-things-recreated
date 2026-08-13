ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS compare_at_price numeric,
  ADD COLUMN IF NOT EXISTS discount_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;
CREATE POLICY "Anyone can view published courses"
ON public.courses FOR SELECT
TO anon, authenticated
USING (published = true AND admin_only = false);