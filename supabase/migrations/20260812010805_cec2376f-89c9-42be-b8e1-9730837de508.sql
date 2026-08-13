CREATE TABLE IF NOT EXISTS public.question_gen_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled batch',
  mode text NOT NULL DEFAULT 'extract',
  notes text,
  subject_id uuid,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_gen_batches TO authenticated;
GRANT ALL ON public.question_gen_batches TO service_role;

ALTER TABLE public.question_gen_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage question gen batches" ON public.question_gen_batches;
CREATE POLICY "Admins manage question gen batches"
ON public.question_gen_batches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS question_gen_batches_created_idx ON public.question_gen_batches (created_at DESC);