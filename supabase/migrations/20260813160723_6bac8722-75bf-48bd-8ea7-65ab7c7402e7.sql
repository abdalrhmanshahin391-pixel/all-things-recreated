
CREATE TABLE public.patch_prox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid,
  group_id uuid,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  phase text NOT NULL DEFAULT 'created',
  cut_batch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  solve_batch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.patch_prox_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.patch_prox_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  crops jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, page_number)
);

CREATE TABLE public.patch_prox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.patch_prox_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  item_index integer NOT NULL,
  image_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  letters jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_letter text,
  stem text,
  explanation text,
  subject_index integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, page_number, item_index)
);

CREATE INDEX patch_prox_pages_job_idx ON public.patch_prox_pages(job_id);
CREATE INDEX patch_prox_items_job_idx ON public.patch_prox_items(job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_items TO authenticated;
GRANT ALL ON public.patch_prox_jobs TO service_role;
GRANT ALL ON public.patch_prox_pages TO service_role;
GRANT ALL ON public.patch_prox_items TO service_role;

ALTER TABLE public.patch_prox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_prox_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_prox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage prox jobs" ON public.patch_prox_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage prox pages" ON public.patch_prox_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage prox items" ON public.patch_prox_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
