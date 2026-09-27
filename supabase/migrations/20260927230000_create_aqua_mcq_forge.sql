-- Aqua MCQ Forge: Separate AI-powered MCQ generation tool from textbooks and reference sources.

CREATE TABLE IF NOT EXISTS public.amf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  source_mode text NOT NULL DEFAULT 'strict',
  style_mode text NOT NULL DEFAULT 'ai',
  style_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  style_sample_text text DEFAULT '',
  difficulty_easy int NOT NULL DEFAULT 34,
  difficulty_medium int NOT NULL DEFAULT 33,
  difficulty_hard int NOT NULL DEFAULT 33,
  type_standard int DEFAULT 50,
  type_combined int DEFAULT 50,
  ai_decides_type boolean NOT NULL DEFAULT false,
  total_questions int DEFAULT 20,
  coverage_mode boolean NOT NULL DEFAULT false,
  dup_threshold int NOT NULL DEFAULT 87,
  include_images boolean NOT NULL DEFAULT false,
  image_count int NOT NULL DEFAULT 0,
  source_fidelity_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_jobs TO authenticated;
GRANT ALL ON public.amf_jobs TO service_role;
ALTER TABLE public.amf_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_jobs_staff" ON public.amf_jobs FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  extracted_text text,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_sources TO authenticated;
GRANT ALL ON public.amf_sources TO service_role;
ALTER TABLE public.amf_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_sources_staff" ON public.amf_sources FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  min_questions int NOT NULL DEFAULT 1,
  max_questions int NOT NULL DEFAULT 10,
  target_questions int NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT true,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_topics TO authenticated;
GRANT ALL ON public.amf_topics TO service_role;
ALTER TABLE public.amf_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_topics_staff" ON public.amf_topics FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.amf_topics(id) ON DELETE SET NULL,
  topic_name text NOT NULL DEFAULT '',
  form text NOT NULL DEFAULT 'A',
  stem text NOT NULL DEFAULT '',
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  answer_mode text NOT NULL DEFAULT 'single',
  difficulty text NOT NULL DEFAULT 'medium',
  objective text NOT NULL DEFAULT 'recall',
  explanation text,
  raw_explanation jsonb,
  source_fidelity jsonb,
  image_url text,
  image_prompt text,
  has_image boolean NOT NULL DEFAULT false,
  dup_hash text NOT NULL DEFAULT '',
  dup_score real DEFAULT 0,
  validation_report jsonb DEFAULT '{}'::jsonb,
  validation_attempts int NOT NULL DEFAULT 0,
  validation_passed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text NOT NULL DEFAULT '',
  order_index int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amf_items_job_idx ON public.amf_items (job_id, order_index);
CREATE INDEX IF NOT EXISTS amf_items_status_idx ON public.amf_items (job_id, status);

GRANT ALL ON public.amf_items TO authenticated;
GRANT ALL ON public.amf_items TO service_role;
ALTER TABLE public.amf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_items_staff" ON public.amf_items FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  item_id uuid,
  actor uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_events TO authenticated;
GRANT ALL ON public.amf_events TO service_role;
ALTER TABLE public.amf_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_events_staff" ON public.amf_events FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

-- Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('amf-sources', 'amf-sources', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('amf-images', 'amf-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for amf-sources
CREATE POLICY "amf_sources_storage_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amf-sources' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amf-sources' AND public.can_use_amg(auth.uid()));

-- Storage policies for amf-images
CREATE POLICY "amf_images_storage_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amf-images' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amf-images' AND public.can_use_amg(auth.uid()));

CREATE POLICY "amf_images_public_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'amf-images');
