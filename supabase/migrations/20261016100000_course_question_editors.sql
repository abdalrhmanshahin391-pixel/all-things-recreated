-- QBank members who may edit the questions of CERTAIN courses (assigned by an admin in Admin -> Users).
-- They can edit the stem, options, explanation and correct answer, move a question to another section of the
-- same course, add questions and delete questions, in session, study and exam mode. Only for the courses they are
-- assigned to, and only while they still have the QBank role.

CREATE TABLE IF NOT EXISTS public.course_question_editors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_question_editors TO authenticated;
GRANT ALL ON public.course_question_editors TO service_role;
ALTER TABLE public.course_question_editors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage course question editors" ON public.course_question_editors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Editors see their own assignments" ON public.course_question_editors FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_edit_course(_user_id uuid, _course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR (public.has_role(_user_id, 'qbank'::public.app_role)
          AND EXISTS (SELECT 1 FROM public.course_question_editors e WHERE e.user_id = _user_id AND e.course_id = _course_id))
$$;

CREATE OR REPLACE FUNCTION public.can_edit_subject(_user_id uuid, _subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subjects s
    JOIN public.subject_groups sg ON sg.id = s.group_id
    WHERE s.id = _subject_id AND public.can_edit_course(_user_id, sg.course_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_question(_user_id uuid, _question_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = _question_id AND public.can_edit_subject(_user_id, q.subject_id))
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_subject(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_question(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_edit_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_subject(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_question(uuid, uuid) TO authenticated;

-- Questions and options: read, add, change and delete inside the assigned courses.
-- WITH CHECK also stops moving a question into a course the person does not edit.
CREATE POLICY "Course editors manage questions" ON public.questions FOR ALL TO authenticated
  USING (public.can_edit_subject(auth.uid(), subject_id)) WITH CHECK (public.can_edit_subject(auth.uid(), subject_id));
CREATE POLICY "Course editors manage question options" ON public.question_options FOR ALL TO authenticated
  USING (public.can_edit_question(auth.uid(), question_id)) WITH CHECK (public.can_edit_question(auth.uid(), question_id));

-- Sections of the course (to open the course and to pick where to move a question). Read only.
CREATE POLICY "Course editors view subject groups" ON public.subject_groups FOR SELECT TO authenticated
  USING (public.can_edit_course(auth.uid(), course_id));
CREATE POLICY "Course editors view subjects" ON public.subjects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subject_groups sg WHERE sg.id = subjects.group_id AND public.can_edit_course(auth.uid(), sg.course_id)));
