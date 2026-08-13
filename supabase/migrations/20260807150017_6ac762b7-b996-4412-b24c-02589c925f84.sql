CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT DO NOTHING;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_list_role_members(_role public.app_role)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, p.username, p.full_name, p.email
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = _role
  ORDER BY p.username;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_user_roles(_user_id uuid)
RETURNS TABLE(role public.app_role)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = _user_id;
END; $$;
CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role);
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_committee(uuid) TO authenticated;
CREATE POLICY "committee manage years" ON public.committee_years
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage subjects" ON public.committee_subjects
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage categories" ON public.committee_categories
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage resources" ON public.committee_resources
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE POLICY "committee manage update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE POLICY "committee manage delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE OR REPLACE FUNCTION public.admin_grant_committee_role(_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _uid FROM public.profiles WHERE lower(username) = lower(trim(_username)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'committee'::public.app_role)
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_revoke_committee_role(_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _uid FROM public.profiles WHERE lower(username) = lower(trim(_username)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _uid AND role = 'committee'::public.app_role;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_list_committee_members()
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, p.username, p.full_name, p.email
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'committee'::public.app_role
  ORDER BY p.username;
END;
$$;
CREATE TABLE public.german_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_path text,
  published boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_courses TO authenticated;
GRANT ALL ON public.german_courses TO service_role;
ALTER TABLE public.german_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_courses read auth" ON public.german_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_courses admin write" ON public.german_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.german_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_subjects TO authenticated;
GRANT ALL ON public.german_subjects TO service_role;
ALTER TABLE public.german_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_subjects read auth" ON public.german_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_subjects admin write" ON public.german_subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.german_subjects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lecture','quiz','words','sentences')),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  video_url text,
  video_storage_path text,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_items TO authenticated;
GRANT ALL ON public.german_items TO service_role;
ALTER TABLE public.german_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_items read auth" ON public.german_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_items admin write" ON public.german_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.german_items(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quizzes TO authenticated;
GRANT ALL ON public.german_quizzes TO service_role;
ALTER TABLE public.german_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_quizzes read auth" ON public.german_quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_quizzes admin write" ON public.german_quizzes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.german_quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  explanation text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quiz_questions TO authenticated;
GRANT ALL ON public.german_quiz_questions TO service_role;
ALTER TABLE public.german_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_qq read auth" ON public.german_quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_qq admin write" ON public.german_quiz_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.german_quiz_questions(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  body text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quiz_options TO authenticated;
GRANT ALL ON public.german_quiz_options TO service_role;
ALTER TABLE public.german_quiz_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_qo read auth" ON public.german_quiz_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_qo admin write" ON public.german_quiz_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_word_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  german text NOT NULL,
  english text NOT NULL,
  example text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_word_entries TO authenticated;
GRANT ALL ON public.german_word_entries TO service_role;
ALTER TABLE public.german_word_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_words read auth" ON public.german_word_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_words admin write" ON public.german_word_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_sentence_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  german text NOT NULL,
  english text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_sentence_entries TO authenticated;
GRANT ALL ON public.german_sentence_entries TO service_role;
ALTER TABLE public.german_sentence_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_sent read auth" ON public.german_sentence_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_sent admin write" ON public.german_sentence_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER german_courses_touch BEFORE UPDATE ON public.german_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.german_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL,
  is_correct BOOLEAN NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('study','session','exam','game')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX german_attempts_user_idx ON public.german_attempts (user_id, item_id);
GRANT SELECT, INSERT ON public.german_attempts TO authenticated;
GRANT ALL ON public.german_attempts TO service_role;
ALTER TABLE public.german_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts read" ON public.german_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "own attempts insert" ON public.german_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.german_subjects
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'mixed'
    CHECK (content_type IN ('words', 'sentences', 'mixed'));
CREATE TABLE IF NOT EXISTS public.german_voice_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.german_subjects(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.german_items(id) ON DELETE CASCADE,
  entry_id uuid,
  target_text text NOT NULL,
  transcript text,
  score numeric,
  mode text NOT NULL DEFAULT 'voice',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_voice_attempts TO authenticated;
GRANT ALL ON public.german_voice_attempts TO service_role;
ALTER TABLE public.german_voice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own voice attempts"
  ON public.german_voice_attempts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS german_voice_attempts_user_idx
  ON public.german_voice_attempts (user_id, created_at DESC);
ALTER TABLE public.german_courses
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'mixed'
    CHECK (content_type IN ('words', 'sentences', 'mixed'));
ALTER TABLE public.german_subjects ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES public.german_subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS german_subjects_parent_id_idx ON public.german_subjects(parent_id);
CREATE OR REPLACE FUNCTION public.identity_taken(_username text, _phone text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'username', EXISTS (
      SELECT 1 FROM public.profiles
      WHERE _username IS NOT NULL AND lower(username) = lower(trim(_username))
    ),
    'phone', EXISTS (
      SELECT 1 FROM public.profiles
      WHERE _phone IS NOT NULL AND _phone <> '' AND phone = trim(_phone)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.identity_taken(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
CREATE TABLE public.admin_ai_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_keys TO authenticated;
GRANT ALL ON public.admin_ai_keys TO service_role;
ALTER TABLE public.admin_ai_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai keys"
ON public.admin_ai_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  site_name text NOT NULL DEFAULT 'YSMU Vault',
  tagline text NOT NULL DEFAULT 'Yerevan State Medical University Question Bank',
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read site settings"
  ON public.site_settings FOR SELECT
  USING (true);
CREATE POLICY "admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins can insert site settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
INSERT INTO public.site_settings (id, site_name, tagline)
VALUES (true, 'YSMU Vault', 'Yerevan State Medical University Question Bank')
ON CONFLICT (id) DO NOTHING;
CREATE TABLE public.summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  author_name text,
  source_type text NOT NULL CHECK (source_type IN ('subject','text','photos','questions')),
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_scheme text NOT NULL DEFAULT 'aurora',
  length_preset text NOT NULL DEFAULT 'standard',
  tone text NOT NULL DEFAULT 'exam',
  is_public boolean NOT NULL DEFAULT false,
  share_slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_summaries_user ON public.summaries(user_id, created_at DESC);
CREATE INDEX idx_summaries_share ON public.summaries(share_slug) WHERE share_slug IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.summaries TO authenticated;
GRANT SELECT ON public.summaries TO anon;
GRANT ALL ON public.summaries TO service_role;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read their own summaries"
  ON public.summaries FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "anyone reads public summaries"
  ON public.summaries FOR SELECT
  USING (is_public = true);
CREATE POLICY "admins read all summaries"
  ON public.summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "users insert their own summaries"
  ON public.summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update their own summaries"
  ON public.summaries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete their own summaries"
  ON public.summaries FOR DELETE
  USING (auth.uid() = user_id);
CREATE TRIGGER trg_summaries_touch
  BEFORE UPDATE ON public.summaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_site_settings_touch
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.german_courses DROP CONSTRAINT IF EXISTS german_courses_content_type_check;
ALTER TABLE public.german_courses ADD CONSTRAINT german_courses_content_type_check
  CHECK (content_type = ANY (ARRAY['words'::text, 'sentences'::text, 'mixed'::text, 'shadowing'::text]));
CREATE TABLE public.german_shadowing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.german_courses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('words','sentences')),
  subject_ids uuid[] NOT NULL DEFAULT '{}',
  total_items integer NOT NULL DEFAULT 0,
  score_avg numeric(5,2) NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_shadowing_sessions TO authenticated;
GRANT ALL ON public.german_shadowing_sessions TO service_role;
ALTER TABLE public.german_shadowing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadowing own read" ON public.german_shadowing_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "shadowing own insert" ON public.german_shadowing_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shadowing own delete" ON public.german_shadowing_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX german_shadowing_sessions_user_idx ON public.german_shadowing_sessions(user_id, created_at DESC);
CREATE INDEX german_shadowing_sessions_course_idx ON public.german_shadowing_sessions(course_id);
CREATE POLICY "Anon can view subjects of published courses"
  ON public.subjects FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.subject_groups sg
      JOIN public.courses c ON c.id = sg.course_id
      WHERE sg.id = subjects.group_id AND c.published = true
    )
  );
GRANT SELECT ON public.subjects TO anon;
CREATE OR REPLACE FUNCTION public.get_subject_question_counts(_subject_ids uuid[])
RETURNS TABLE(subject_id uuid, cnt bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.subject_id, count(*)::bigint
  FROM public.questions q
  WHERE q.subject_id = ANY(_subject_ids)
  GROUP BY q.subject_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;
ALTER TABLE public.committee_years DROP CONSTRAINT IF EXISTS committee_years_year_number_check;
ALTER TABLE public.committee_years ADD CONSTRAINT committee_years_year_number_check CHECK (year_number BETWEEN 0 AND 7);
CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.universities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities TO authenticated;
GRANT ALL ON public.universities TO service_role;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER universities_touch BEFORE UPDATE ON public.universities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.universities_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  background_color text NOT NULL DEFAULT '#0B3B3C',
  scroll_speed_seconds int NOT NULL DEFAULT 30,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.universities_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities_settings TO authenticated;
GRANT ALL ON public.universities_settings TO service_role;
ALTER TABLE public.universities_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads slider settings" ON public.universities_settings FOR SELECT USING (true);
CREATE POLICY "admins manage slider settings" ON public.universities_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER universities_settings_touch BEFORE UPDATE ON public.universities_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.universities_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE POLICY "public read university-logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'university-logos');
CREATE POLICY "admins write university-logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update university-logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins delete university-logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.universities ADD COLUMN storage_path text;
ALTER TABLE public.summaries DROP CONSTRAINT IF EXISTS summaries_source_type_check;
ALTER TABLE public.summaries ADD CONSTRAINT summaries_source_type_check
  CHECK (source_type IN ('subject','text','photos','pdf','questions'));
CREATE OR REPLACE FUNCTION public.get_course_real_counts(_course_ids uuid[])
RETURNS TABLE(course_id uuid, subjects_count bigint, questions_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sg.course_id,
    count(DISTINCT s.id)::bigint AS subjects_count,
    count(q.id)::bigint AS questions_count
  FROM public.subject_groups sg
  LEFT JOIN public.subjects s ON s.group_id = sg.id
  LEFT JOIN public.questions q ON q.subject_id = s.id
  WHERE sg.course_id = ANY(_course_ids)
  GROUP BY sg.course_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated, service_role;
CREATE TABLE public.german_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('words','sentences')),
  german text NOT NULL,
  english text NOT NULL,
  course_id uuid REFERENCES public.german_courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_flags TO authenticated;
GRANT ALL ON public.german_flags TO service_role;
ALTER TABLE public.german_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_flags own read" ON public.german_flags FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "german_flags own insert" ON public.german_flags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "german_flags own delete" ON public.german_flags FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX german_flags_user_idx ON public.german_flags(user_id, created_at DESC);
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
INSERT INTO public.universities (name, slug, short_name, description, city, country, is_visible, is_active, sort_order, logo_url, storage_path)
SELECT 'Yerevan State Medical University', 'ysmu', 'YSMU',
       'The flagship medical university — original content collection.',
       'Yerevan', 'Armenia', true, true, 0, '', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.universities WHERE lower(name) LIKE 'yerevan%' OR slug = 'ysmu');
UPDATE public.universities
SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug IS NULL OR slug = '';
ALTER TABLE public.universities
  ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS universities_slug_unique ON public.universities (slug);
ALTER TABLE public.courses        ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
ALTER TABLE public.lecture_subjects ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
ALTER TABLE public.committee_years ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
DO $$
DECLARE ysmu_id uuid;
BEGIN
  SELECT id INTO ysmu_id FROM public.universities WHERE slug = 'ysmu' LIMIT 1;
  IF ysmu_id IS NULL THEN
    SELECT id INTO ysmu_id FROM public.universities ORDER BY sort_order LIMIT 1;
  END IF;
  IF ysmu_id IS NOT NULL THEN
    UPDATE public.courses          SET university_id = ysmu_id WHERE university_id IS NULL;
    UPDATE public.lecture_subjects SET university_id = ysmu_id WHERE university_id IS NULL;
    UPDATE public.committee_years  SET university_id = ysmu_id WHERE university_id IS NULL;
  END IF;
END $$;
ALTER TABLE public.courses          ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.lecture_subjects ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.committee_years  ALTER COLUMN university_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS courses_university_idx          ON public.courses(university_id);
CREATE INDEX IF NOT EXISTS lecture_subjects_university_idx ON public.lecture_subjects(university_id);
CREATE INDEX IF NOT EXISTS committee_years_university_idx  ON public.committee_years(university_id);
CREATE POLICY "Authenticated read active universities"
  ON public.universities FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Anon read active universities"
  ON public.universities FOR SELECT
  TO anon
  USING (is_active = true);
CREATE POLICY "Admins manage universities"
  ON public.universities FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.university_id_by_slug(_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.universities WHERE slug = _slug AND is_active = true LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS home_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_badge text,
  ADD COLUMN IF NOT EXISTS home_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_tagline text;
ALTER TABLE public.universities
  DROP CONSTRAINT IF EXISTS universities_home_badge_check;
ALTER TABLE public.universities
  ADD CONSTRAINT universities_home_badge_check
  CHECK (home_badge IS NULL OR home_badge IN ('NEW','POPULAR','COMING_SOON'));
ALTER TABLE public.admin_ai_keys
  ADD COLUMN IF NOT EXISTS slot SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preferred_model TEXT;
ALTER TABLE public.admin_ai_keys
  DROP CONSTRAINT IF EXISTS admin_ai_keys_pkey;
ALTER TABLE public.admin_ai_keys
  ADD CONSTRAINT admin_ai_keys_pkey PRIMARY KEY (provider, slot);
ALTER TABLE public.admin_ai_keys
  DROP CONSTRAINT IF EXISTS admin_ai_keys_slot_range_chk;
ALTER TABLE public.admin_ai_keys
  ADD CONSTRAINT admin_ai_keys_slot_range_chk CHECK (slot BETWEEN 1 AND 5);