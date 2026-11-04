-- Answer options that are pictures (stored as the text [[img:path]]) could be read by admins only.
-- The only read rule left for students on the question-images bucket looks for the path in questions.image_url,
-- so the picture of an OPTION was refused ("This question image could not be loaded") for every student.
-- This gives students the same access to an option picture that they already have to the picture of its question:
-- the subject is free (public / logged in) or the student has the course.

CREATE OR REPLACE FUNCTION public.can_read_option_picture(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.question_options o
    JOIN public.questions q ON q.id = o.question_id
    JOIN public.subjects s ON s.id = q.subject_id
    JOIN public.subject_groups sg ON sg.id = s.group_id
    WHERE o.text = '[[img:' || _name || ']]'
      AND (
        s.access_level IN ('free_public'::public.subject_access, 'free_logged_in'::public.subject_access)
        OR EXISTS (
          SELECT 1 FROM public.user_courses uc
          WHERE uc.user_id = auth.uid() AND uc.course_id = sg.course_id
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_option_picture(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_option_picture(text) TO authenticated;

-- the lookup is by the exact option text, so give it an index
CREATE INDEX IF NOT EXISTS question_options_text_hash_idx ON public.question_options USING hash (text);

DROP POLICY IF EXISTS "option pictures readable by entitled users" ON storage.objects;
CREATE POLICY "option pictures readable by entitled users" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-images' AND public.can_read_option_picture(name));
