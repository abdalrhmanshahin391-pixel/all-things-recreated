DROP POLICY IF EXISTS "Authenticated can view courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone can view published question options" ON public.question_options;
DROP POLICY IF EXISTS "Anyone can view published subjects" ON public.subjects;
CREATE POLICY "Authenticated can view subjects of published courses"
ON public.subjects FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.subject_groups sg
  JOIN public.courses c ON c.id = sg.course_id
  WHERE sg.id = subjects.group_id AND c.published = true
));
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM anon, PUBLIC;
CREATE OR REPLACE FUNCTION public.search_users_for_group(_query text, _exclude uuid)
RETURNS TABLE(id uuid, username text, full_name text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.email
  FROM public.profiles p
  WHERE p.id <> COALESCE(_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      p.username ILIKE _query || '%'
      OR p.email ILIKE _query || '%'
      OR p.full_name ILIKE '%' || _query || '%'
    )
  ORDER BY p.username
  LIMIT 8;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) TO authenticated;
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  user_agent text,
  platform text,
  ip text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX user_devices_user_id_idx ON public.user_devices(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users can insert own devices"
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devices"
  ON public.user_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete any device"
  ON public.user_devices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() = user_id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 2;
CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT email FROM public.profiles
  WHERE lower(username) = lower(trim(_username))
  LIMIT 1;
$function$;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'questions';
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_kind_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_kind_check CHECK (kind IN ('questions','lectures'));
CREATE INDEX IF NOT EXISTS courses_kind_idx ON public.courses(kind);
CREATE TABLE IF NOT EXISTS public.user_lecture_courses (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
GRANT SELECT ON public.user_lecture_courses TO authenticated;
GRANT ALL ON public.user_lecture_courses TO service_role;
ALTER TABLE public.user_lecture_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own lecture access" ON public.user_lecture_courses;
CREATE POLICY "Users read own lecture access"
  ON public.user_lecture_courses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins manage lecture access" ON public.user_lecture_courses;
CREATE POLICY "Admins manage lecture access"
  ON public.user_lecture_courses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS intro_video_storage_path text;
CREATE TABLE public.lecture_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lecture_subjects TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.lecture_subjects TO authenticated;
GRANT ALL ON public.lecture_subjects TO service_role;
ALTER TABLE public.lecture_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects readable for published courses"
  ON public.lecture_subjects FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.published = true)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "subjects writable by admin"
  ON public.lecture_subjects FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_lecture_subjects BEFORE UPDATE ON public.lecture_subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.lecture_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.lecture_subjects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lecture','quiz')),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  video_url text,
  video_storage_path text,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lecture_items TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.lecture_items TO authenticated;
GRANT ALL ON public.lecture_items TO service_role;
ALTER TABLE public.lecture_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable when subject is readable"
  ON public.lecture_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_subjects s
      JOIN public.courses c ON c.id = s.course_id
      WHERE s.id = subject_id AND (c.published = true OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "items writable by admin"
  ON public.lecture_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_lecture_items BEFORE UPDATE ON public.lecture_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.lecture_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.lecture_items(id) ON DELETE CASCADE,
  pass_score int NOT NULL DEFAULT 70,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quizzes TO authenticated;
GRANT ALL ON public.lecture_quizzes TO service_role;
ALTER TABLE public.lecture_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes writable by admin"
  ON public.lecture_quizzes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.lecture_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.lecture_quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_questions TO authenticated;
GRANT ALL ON public.lecture_quiz_questions TO service_role;
ALTER TABLE public.lecture_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.lecture_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.lecture_quiz_questions(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  body text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_options TO authenticated;
GRANT ALL ON public.lecture_quiz_options TO service_role;
ALTER TABLE public.lecture_quiz_options ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.lecture_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.lecture_quizzes(id) ON DELETE CASCADE,
  score int NOT NULL,
  total int NOT NULL,
  answers jsonb,
  finished_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_attempts TO authenticated;
GRANT ALL ON public.lecture_quiz_attempts TO service_role;
ALTER TABLE public.lecture_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own attempts"
  ON public.lecture_quiz_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user inserts own attempts"
  ON public.lecture_quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.user_owns_lecture_course(_course_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_lecture_courses
        WHERE user_id = auth.uid() AND course_id = _course_id
      );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) TO authenticated;
CREATE POLICY "lecture videos readable by owners"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lecture-videos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.lecture_items i
        JOIN public.lecture_subjects s ON s.id = i.subject_id
        JOIN public.user_lecture_courses ulc
          ON ulc.course_id = s.course_id AND ulc.user_id = auth.uid()
        WHERE i.video_storage_path = storage.objects.name
      )
    )
  );
CREATE POLICY "lecture videos writable by admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lecture-videos'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "lecture videos updatable by admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "lecture videos deletable by admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.lecture_subjects TO anon;
GRANT SELECT ON public.lecture_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_lecture_courses TO authenticated;
ALTER TABLE public.lecture_items
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS intro_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_quiz_questions
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
CREATE POLICY "quizzes readable when item is free or owned"
  ON public.lecture_quizzes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_items i
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE i.id = lecture_quizzes.item_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "questions readable"
  ON public.lecture_quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_quizzes q
      JOIN public.lecture_items i ON i.id = q.item_id
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE q.id = lecture_quiz_questions.quiz_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "questions writable by admin"
  ON public.lecture_quiz_questions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "options readable"
  ON public.lecture_quiz_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_quiz_questions qq
      JOIN public.lecture_quizzes q ON q.id = qq.quiz_id
      JOIN public.lecture_items i ON i.id = q.item_id
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE qq.id = lecture_quiz_options.question_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "options writable by admin"
  ON public.lecture_quiz_options FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.admin_grant_lecture_course(_user_id uuid, _course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_lecture_courses (user_id, course_id)
  VALUES (_user_id, _course_id)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_revoke_lecture_course(_user_id uuid, _course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_lecture_courses
  WHERE user_id = _user_id AND course_id = _course_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_list_lecture_course_users(_course_id uuid)
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
  SELECT ulc.user_id, p.username, p.full_name, p.email
  FROM public.user_lecture_courses ulc
  JOIN public.profiles p ON p.id = ulc.user_id
  WHERE ulc.course_id = _course_id
  ORDER BY p.username;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) TO authenticated;
CREATE TABLE public.committee_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_number int NOT NULL UNIQUE CHECK (year_number BETWEEN 1 AND 6),
  display_name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'stethoscope',
  color_key text NOT NULL DEFAULT 'indigo',
  shape_key text NOT NULL DEFAULT 'circle',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_years TO authenticated;
GRANT SELECT ON public.committee_years TO anon;
GRANT ALL ON public.committee_years TO service_role;
ALTER TABLE public.committee_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read years" ON public.committee_years FOR SELECT USING (true);
CREATE TABLE public.committee_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.committee_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'book',
  color_key text NOT NULL DEFAULT 'indigo',
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_subjects(year_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_subjects TO authenticated;
GRANT SELECT ON public.committee_subjects TO anon;
GRANT ALL ON public.committee_subjects TO service_role;
ALTER TABLE public.committee_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read subjects" ON public.committee_subjects FOR SELECT USING (true);
CREATE TABLE public.committee_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_categories(subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_categories TO authenticated;
GRANT SELECT ON public.committee_categories TO anon;
GRANT ALL ON public.committee_categories TO service_role;
ALTER TABLE public.committee_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read categories" ON public.committee_categories FOR SELECT USING (true);
CREATE TABLE public.committee_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.committee_categories(id) ON DELETE CASCADE,
  parent_resource_id uuid REFERENCES public.committee_resources(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pdf','link','folder')),
  file_path text,
  url text,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_resources(category_id);
CREATE INDEX ON public.committee_resources(parent_resource_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_resources TO authenticated;
GRANT SELECT ON public.committee_resources TO anon;
GRANT ALL ON public.committee_resources TO service_role;
ALTER TABLE public.committee_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read resources" ON public.committee_resources FOR SELECT USING (true);
CREATE TRIGGER touch_committee_years BEFORE UPDATE ON public.committee_years FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_subjects BEFORE UPDATE ON public.committee_subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_categories BEFORE UPDATE ON public.committee_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_resources BEFORE UPDATE ON public.committee_resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.committee_years (year_number, display_name, icon_key, color_key, shape_key, sort_order) VALUES
  (1, 'Year 1', 'dna',         'mint',    'circle',   1),
  (2, 'Year 2', 'microscope',  'indigo',  'hexagon',  2),
  (3, 'Year 3', 'heart-pulse', 'rose',    'squircle', 3),
  (4, 'Year 4', 'stethoscope', 'amber',   'diamond',  4),
  (5, 'Year 5', 'brain',       'teal',    'ring',     5),
  (6, 'Year 6', 'cross',       'violet',  'shield',   6);
WITH y AS (SELECT id, year_number FROM public.committee_years)
INSERT INTO public.committee_subjects (year_id, name, icon_key, color_key, sort_order)
SELECT y.id, s.name, s.icon_key, s.color_key, s.sort_order
FROM y
JOIN (VALUES
  (1, 'Anatomy',         'bone',         'rose',    1),
  (1, 'Histology',       'microscope',   'indigo',  2),
  (1, 'Biochemistry',    'flask-conical','amber',   3),
  (1, 'Medical Biology', 'dna',          'mint',    4),
  (1, 'Latin',           'book-open',    'teal',    5),
  (2, 'Physiology',      'heart-pulse',  'rose',    1),
  (2, 'Biochemistry II', 'flask-conical','amber',   2),
  (2, 'Anatomy II',      'bone',         'indigo',  3),
  (2, 'Microbiology',    'bug',          'mint',    4),
  (2, 'Histology II',    'microscope',   'violet',  5),
  (3, 'Pathology',       'virus',        'rose',    1),
  (3, 'Pharmacology',    'pill',         'amber',   2),
  (3, 'Propedeutics',    'stethoscope',  'indigo',  3),
  (3, 'Microbiology II', 'bug',          'mint',    4),
  (4, 'Internal Medicine','stethoscope', 'indigo',  1),
  (4, 'Surgery',         'scissors',     'rose',    2),
  (4, 'OB-GYN',          'baby',         'mint',    3),
  (4, 'Pediatrics',      'baby',         'amber',   4),
  (5, 'Cardiology',      'heart-pulse',  'rose',    1),
  (5, 'Neurology',       'brain',        'violet',  2),
  (5, 'Psychiatry',      'brain',        'teal',    3),
  (5, 'Dermatology',     'sparkles',     'amber',   4),
  (6, 'State Exam Prep', 'graduation-cap','violet', 1),
  (6, 'Clinical Cases',  'clipboard-list','indigo', 2)
) AS s(year_number, name, icon_key, color_key, sort_order)
ON y.year_number = s.year_number;
CREATE POLICY "committee public read" ON storage.objects FOR SELECT
  USING (bucket_id IN ('committee-images','committee-files'));
ALTER TABLE public.committee_categories
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'resources';
ALTER TABLE public.committee_categories
  DROP CONSTRAINT IF EXISTS committee_categories_section_check;
ALTER TABLE public.committee_categories
  ADD CONSTRAINT committee_categories_section_check CHECK (section IN ('resources','books'));
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'committee';