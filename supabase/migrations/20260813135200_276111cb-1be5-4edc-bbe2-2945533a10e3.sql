CREATE TABLE public.aquavision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid,
  group_id uuid,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'created',
  status text NOT NULL DEFAULT 'pending',
  read_batch_id text,
  answer_batch_id text,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.aquavision_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.aquavision_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pdf_b64 text,
  question_count integer NOT NULL DEFAULT 0,
  raw_json jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aquavision_pages_job_idx ON public.aquavision_pages(job_id, page_number);

CREATE TABLE public.aquavision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.aquavision_jobs(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.aquavision_pages(id) ON DELETE CASCADE,
  item_index integer NOT NULL DEFAULT 0,
  number text,
  stem text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_letter text,
  concept text,
  explanation text,
  summary_table text,
  solved boolean NOT NULL DEFAULT false,
  imported boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'read',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aquavision_items_job_idx ON public.aquavision_items(job_id, item_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_jobs TO authenticated;
GRANT ALL ON public.aquavision_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_pages TO authenticated;
GRANT ALL ON public.aquavision_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_items TO authenticated;
GRANT ALL ON public.aquavision_items TO service_role;

ALTER TABLE public.aquavision_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aquavision_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aquavision_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aquavision_jobs_admin" ON public.aquavision_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "aquavision_pages_admin" ON public.aquavision_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "aquavision_items_admin" ON public.aquavision_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER aquavision_jobs_touch BEFORE UPDATE ON public.aquavision_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();