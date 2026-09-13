-- Add semester column to public.courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS semester smallint CHECK (semester IN (1, 2) OR semester IS NULL);

-- Explicitly ensure read & write access on semester column
GRANT ALL (semester) ON public.courses TO authenticated;
GRANT SELECT (semester) ON public.courses TO anon;

-- Prompt PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';
