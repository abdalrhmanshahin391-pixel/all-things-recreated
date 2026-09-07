-- 1. Column additions
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS intro_image_url text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_subjects ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_items ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE public.lecture_items ADD COLUMN IF NOT EXISTS resource_kind text;

-- 2. Lecture staff
CREATE TABLE IF NOT EXISTS public.lecture_staff (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
GRANT SELECT ON public.lecture_staff TO authenticated;
GRANT ALL ON public.lecture_staff TO service_role;
ALTER TABLE public.lecture_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_lecture_staff(_course_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lecture_staff
    WHERE course_id = _course_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_lecture_course(_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_lecture_staff(_course_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_view_lecture_course(_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'golden'::app_role)
      OR public.is_lecture_staff(_course_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_lecture_courses ulc
        WHERE ulc.user_id = auth.uid() AND ulc.course_id = _course_id
      );
$$;

CREATE POLICY "Admins manage lecture staff" ON public.lecture_staff
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff read own assignments" ON public.lecture_staff
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT INSERT, UPDATE, DELETE ON public.lecture_staff TO authenticated;

-- 3. Staff write access on existing lecture tables
CREATE POLICY "subjects writable by course staff" ON public.lecture_subjects
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));

CREATE POLICY "items writable by course staff" ON public.lecture_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quizzes writable by course staff" ON public.lecture_quizzes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_items i JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE i.id = item_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_items i JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE i.id = item_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quiz questions writable by course staff" ON public.lecture_quiz_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_quizzes q JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE q.id = quiz_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_quizzes q JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE q.id = quiz_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quiz options writable by course staff" ON public.lecture_quiz_options
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_quiz_questions qq JOIN public.lecture_quizzes q ON q.id = qq.quiz_id JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE qq.id = question_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_quiz_questions qq JOIN public.lecture_quizzes q ON q.id = qq.quiz_id JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE qq.id = question_id AND public.can_edit_lecture_course(s.course_id)));

-- 4. Course-wide materials
CREATE TABLE public.lecture_course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'pdf',
  url text,
  storage_path text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_course_materials TO authenticated;
GRANT ALL ON public.lecture_course_materials TO service_role;
ALTER TABLE public.lecture_course_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course materials readable by course members" ON public.lecture_course_materials
  FOR SELECT TO authenticated USING (public.can_view_lecture_course(course_id));
CREATE POLICY "course materials writable by staff" ON public.lecture_course_materials
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));
CREATE TRIGGER lecture_course_materials_touch BEFORE UPDATE ON public.lecture_course_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Topic questions with show/hide
CREATE TABLE public.lecture_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.lecture_subjects(id) ON DELETE CASCADE,
  stem text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_index integer NOT NULL DEFAULT 0,
  explanation text,
  visible boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_questions TO authenticated;
GRANT ALL ON public.lecture_questions TO service_role;
ALTER TABLE public.lecture_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture questions readable by course members" ON public.lecture_questions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.lecture_subjects s
      WHERE s.id = subject_id
        AND (public.can_edit_lecture_course(s.course_id) OR (visible AND public.can_view_lecture_course(s.course_id)))
    )
  );
CREATE POLICY "lecture questions writable by staff" ON public.lecture_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)));
CREATE TRIGGER lecture_questions_touch BEFORE UPDATE ON public.lecture_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Live classes
CREATE TABLE public.lecture_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  meeting_url text,
  repeat_weekly boolean NOT NULL DEFAULT false,
  recording_url text,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lecture_classes_course_start_idx ON public.lecture_classes (course_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_classes TO authenticated;
GRANT ALL ON public.lecture_classes TO service_role;
ALTER TABLE public.lecture_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes readable by course members" ON public.lecture_classes
  FOR SELECT TO authenticated USING (public.can_view_lecture_course(course_id));
CREATE POLICY "classes writable by staff" ON public.lecture_classes
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));
CREATE TRIGGER lecture_classes_touch BEFORE UPDATE ON public.lecture_classes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Protection toggles
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS protect_lectures boolean NOT NULL DEFAULT true;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS protect_qbank boolean NOT NULL DEFAULT true;

-- 8. Staff directory helpers (admin adds staff by username/email)
CREATE OR REPLACE FUNCTION public.lecture_staff_list(_course_id uuid)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ls.user_id, p.username, p.full_name, p.email
  FROM public.lecture_staff ls
  LEFT JOIN public.profiles p ON p.id = ls.user_id
  WHERE ls.course_id = _course_id
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_lecture_staff(_course_id, auth.uid()));
$$;
GRANT EXECUTE ON FUNCTION public.lecture_staff_list(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_lecture_staff(uuid, uuid) FROM anon;
