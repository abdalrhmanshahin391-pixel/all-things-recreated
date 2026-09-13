-- Add semester column to public.courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS semester smallint CHECK (semester IN (1, 2) OR semester IS NULL);

-- Explicitly ensure read access on semester column
GRANT SELECT (semester) ON public.courses TO anon, authenticated;
