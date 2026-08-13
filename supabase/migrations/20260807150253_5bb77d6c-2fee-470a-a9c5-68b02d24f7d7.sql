CREATE TABLE public.admin_ai_model_limits (
  model_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rpm INTEGER NOT NULL DEFAULT 5,
  rpd INTEGER NOT NULL DEFAULT 50,
  supports_vision BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  smooth_pacing BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 30,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_model_limits TO authenticated;
GRANT ALL ON public.admin_ai_model_limits TO service_role;
ALTER TABLE public.admin_ai_model_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai model limits"
ON public.admin_ai_model_limits
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_admin_ai_model_limits_updated_at
BEFORE UPDATE ON public.admin_ai_model_limits
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.admin_ai_model_limits
  ADD COLUMN IF NOT EXISTS max_concurrent integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_model_id text,
  ADD COLUMN IF NOT EXISTS use_json_mime boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
INSERT INTO public.admin_ai_model_limits
  (model_id, label, rpm, rpd, supports_vision, enabled, smooth_pacing, cooldown_seconds, sort_order, max_concurrent, api_model_id, use_json_mime)
VALUES
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 15, 1000, true, true, false, 30, 10, 4, 'gemini-2.5-flash-lite', true)
ON CONFLICT (model_id) DO NOTHING;
CREATE TABLE public.mentor_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dua','stoic')),
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_categories TO authenticated;
GRANT ALL ON public.mentor_categories TO service_role;
ALTER TABLE public.mentor_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_categories owner admin all"
ON public.mentor_categories FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_categories_updated BEFORE UPDATE ON public.mentor_categories
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_categories_user_kind ON public.mentor_categories(user_id, kind, sort_order);
CREATE TABLE public.mentor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.mentor_categories(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_entries TO authenticated;
GRANT ALL ON public.mentor_entries TO service_role;
ALTER TABLE public.mentor_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_entries owner admin all"
ON public.mentor_entries FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_entries_updated BEFORE UPDATE ON public.mentor_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_entries_cat ON public.mentor_entries(category_id, sort_order);
CREATE TABLE public.mentor_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('religious','stoic')),
  title text NOT NULL,
  is_daily boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_tasks TO authenticated;
GRANT ALL ON public.mentor_tasks TO service_role;
ALTER TABLE public.mentor_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_tasks owner admin all"
ON public.mentor_tasks FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_tasks_updated BEFORE UPDATE ON public.mentor_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_tasks_user_kind ON public.mentor_tasks(user_id, kind, sort_order);
CREATE TABLE public.mentor_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.mentor_tasks(id) ON DELETE CASCADE,
  completed_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, completed_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_task_completions TO authenticated;
GRANT ALL ON public.mentor_task_completions TO service_role;
ALTER TABLE public.mentor_task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_task_completions owner admin all"
ON public.mentor_task_completions FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX idx_mentor_completions_task_date ON public.mentor_task_completions(task_id, completed_on);
CREATE TABLE public.mentor_treasures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dua','stoic')),
  title text,
  body text NOT NULL,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  is_pinned_today boolean NOT NULL DEFAULT false,
  pinned_on date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_treasures TO authenticated;
GRANT ALL ON public.mentor_treasures TO service_role;
ALTER TABLE public.mentor_treasures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_treasures owner admin all"
ON public.mentor_treasures FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_mentor_treasures_updated BEFORE UPDATE ON public.mentor_treasures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_treasures_user_kind ON public.mentor_treasures(user_id, kind);
CREATE TABLE public.mentor_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  intention text,
  did_well text,
  fell_short text,
  tomorrow text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_journal TO authenticated;
GRANT ALL ON public.mentor_journal TO service_role;
ALTER TABLE public.mentor_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_journal owner admin all"
ON public.mentor_journal FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_mentor_journal_updated BEFORE UPDATE ON public.mentor_journal
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_journal_user_date ON public.mentor_journal(user_id, entry_date DESC);
CREATE OR REPLACE FUNCTION public.grant_admin_to_klory_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = lower('Klory.shaheen3@icloud.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS grant_admin_to_klory_email_trigger ON public.profiles;
CREATE TRIGGER grant_admin_to_klory_email_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_to_klory_email();
CREATE OR REPLACE FUNCTION public.toggle_self_admin(_enable boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS DISTINCT FROM lower('Klory.shaheen3@icloud.com') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _enable THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _uid AND role = 'admin'::public.app_role;
  END IF;
  RETURN _enable;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_self_admin(boolean) TO authenticated;
CREATE TABLE IF NOT EXISTS public.jarvis_batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdf_name TEXT NOT NULL,
  subject_id UUID NULL,
  auto_sort BOOLEAN NOT NULL DEFAULT false,
  batch_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  slice_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_summary JSONB NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_jobs TO service_role;
ALTER TABLE public.jarvis_batch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners and admins can read batch jobs"
ON public.jarvis_batch_jobs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can insert batch jobs"
ON public.jarvis_batch_jobs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can update batch jobs"
ON public.jarvis_batch_jobs FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can delete batch jobs"
ON public.jarvis_batch_jobs FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER jarvis_batch_jobs_touch
BEFORE UPDATE ON public.jarvis_batch_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS jarvis_batch_jobs_user_idx
ON public.jarvis_batch_jobs (user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_jobs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS pending_review jsonb,
  ADD COLUMN IF NOT EXISTS classifier_batch_id text,
  ADD COLUMN IF NOT EXISTS classifier_status text;
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS stem_hash text
  GENERATED ALWAYS AS (md5(lower(regexp_replace(coalesce(stem,''), '\s+', ' ', 'g')))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS questions_subject_stemhash_uniq
  ON public.questions(subject_id, stem_hash);
CREATE TABLE public.jarvis_batch_v2_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages int NOT NULL,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jarvis_batch_v2_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jarvis_batch_v2_jobs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_from int NOT NULL,
  page_to int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  batch_id text,
  results jsonb,
  imported_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_chunks TO service_role;
ALTER TABLE public.jarvis_batch_v2_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_batch_v2_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v2 jobs" ON public.jarvis_batch_v2_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins manage v2 chunks" ON public.jarvis_batch_v2_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_jbv2_jobs BEFORE UPDATE ON public.jarvis_batch_v2_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jbv2_chunks BEFORE UPDATE ON public.jarvis_batch_v2_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX jbv2_chunks_job_idx ON public.jarvis_batch_v2_chunks(job_id, chunk_index);
CREATE INDEX jbv2_jobs_user_idx ON public.jarvis_batch_v2_jobs(user_id, created_at DESC);
ALTER TABLE public.universities ADD COLUMN IF NOT EXISTS lectures_visible boolean NOT NULL DEFAULT false;
CREATE TABLE public.sonic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  provider text NOT NULL DEFAULT 'gemini',
  model text NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  hint text,
  skip_duplicates boolean NOT NULL DEFAULT false,
  auto_retry boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_jobs TO authenticated;
GRANT ALL ON public.sonic_jobs TO service_role;
ALTER TABLE public.sonic_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_jobs admin all" ON public.sonic_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_jobs_touch BEFORE UPDATE ON public.sonic_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.sonic_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.sonic_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_pdfs TO authenticated;
GRANT ALL ON public.sonic_pdfs TO service_role;
ALTER TABLE public.sonic_pdfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_pdfs admin all" ON public.sonic_pdfs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_pdfs_touch BEFORE UPDATE ON public.sonic_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX sonic_pdfs_job_idx ON public.sonic_pdfs(job_id, sort_order);
CREATE TABLE public.sonic_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_id uuid NOT NULL REFERENCES public.sonic_pdfs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  page_from integer NOT NULL,
  page_to integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  results jsonb,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_chunks TO authenticated;
GRANT ALL ON public.sonic_chunks TO service_role;
ALTER TABLE public.sonic_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_chunks admin all" ON public.sonic_chunks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_chunks_touch BEFORE UPDATE ON public.sonic_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX sonic_chunks_pdf_idx ON public.sonic_chunks(pdf_id, chunk_index);
CREATE TABLE public.jarvis_batch_v2_ipad_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages int NOT NULL,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jarvis_batch_v2_ipad_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jarvis_batch_v2_ipad_jobs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_from int NOT NULL,
  page_to int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  batch_id text,
  results jsonb,
  imported_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_chunks TO service_role;
ALTER TABLE public.jarvis_batch_v2_ipad_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_batch_v2_ipad_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v2 ipad jobs" ON public.jarvis_batch_v2_ipad_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins manage v2 ipad chunks" ON public.jarvis_batch_v2_ipad_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_jbv2_ipad_jobs BEFORE UPDATE ON public.jarvis_batch_v2_ipad_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jbv2_ipad_chunks BEFORE UPDATE ON public.jarvis_batch_v2_ipad_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX jbv2_ipad_chunks_job_idx ON public.jarvis_batch_v2_ipad_chunks(job_id, chunk_index);
CREATE INDEX jbv2_ipad_jobs_user_idx ON public.jarvis_batch_v2_ipad_jobs(user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_v2_ipad_jobs
  ADD COLUMN IF NOT EXISTS queue_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS jarvis_batch_v2_ipad_jobs_queue_idx
  ON public.jarvis_batch_v2_ipad_jobs (user_id, queue_order, created_at);
CREATE OR REPLACE FUNCTION public.admin_list_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  full_name text,
  username text,
  device_limit integer,
  created_at timestamptz,
  roles text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.phone, u.phone::text) AS phone,
    COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name'), '') AS full_name,
    COALESCE(p.username, (u.raw_user_meta_data->>'username'), split_part(u.email::text, '@', 1)) AS username,
    COALESCE(p.device_limit, 2) AS device_limit,
    u.created_at,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]) AS roles
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO authenticated;
CREATE TABLE public.jarvis_batch_german_ipad_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  pdf_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sentences',
  status TEXT NOT NULL DEFAULT 'pending',
  total_images INTEGER NOT NULL DEFAULT 0,
  processed_images INTEGER NOT NULL DEFAULT 0,
  imported_pairs INTEGER NOT NULL DEFAULT 0,
  queue_order INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_jobs TO service_role;
ALTER TABLE public.jarvis_batch_german_ipad_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage german ipad jobs" ON public.jarvis_batch_german_ipad_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_german_ipad_jobs_touch
BEFORE UPDATE ON public.jarvis_batch_german_ipad_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.jarvis_batch_german_ipad_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jarvis_batch_german_ipad_jobs(id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL,
  page_number INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  pairs_json JSONB,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_chunks TO service_role;
ALTER TABLE public.jarvis_batch_german_ipad_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage german ipad chunks" ON public.jarvis_batch_german_ipad_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_german_ipad_chunks_touch
BEFORE UPDATE ON public.jarvis_batch_german_ipad_chunks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_german_ipad_chunks_job ON public.jarvis_batch_german_ipad_chunks(job_id, image_index);
CREATE INDEX idx_german_ipad_jobs_user ON public.jarvis_batch_german_ipad_jobs(user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_german_ipad_jobs
  ADD COLUMN IF NOT EXISTS batch_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_status TEXT;
DROP POLICY IF EXISTS "german_courses read auth" ON public.german_courses;
DROP POLICY IF EXISTS "german_items read auth" ON public.german_items;
DROP POLICY IF EXISTS "german_qo read auth" ON public.german_quiz_options;
DROP POLICY IF EXISTS "german_qq read auth" ON public.german_quiz_questions;
DROP POLICY IF EXISTS "german_quizzes read auth" ON public.german_quizzes;
DROP POLICY IF EXISTS "german_sent read auth" ON public.german_sentence_entries;
DROP POLICY IF EXISTS "german_words read auth" ON public.german_word_entries;
CREATE OR REPLACE FUNCTION public.user_owns_any_german_course(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.courses c ON c.id = uc.course_id
    WHERE uc.user_id = _user_id AND c.kind = 'german'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_any_german_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_any_german_course(uuid) TO authenticated;
CREATE POLICY "german_courses read enrolled" ON public.german_courses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_items read enrolled" ON public.german_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_quizzes read enrolled" ON public.german_quizzes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_qq read enrolled" ON public.german_quiz_questions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_qo read enrolled" ON public.german_quiz_options
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_sent read enrolled" ON public.german_sentence_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_words read enrolled" ON public.german_word_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
REVOKE EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_committee_role(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_users() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_committee_members() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_self_admin(boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_kloryx() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_klory_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_committee_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_committee_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_self_admin(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) TO authenticated;