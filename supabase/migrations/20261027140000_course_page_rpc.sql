-- Course page in one request instead of four that wait for each other, and the student's
-- flagged / wrong-answer counts computed inside the database instead of downloading every
-- question of the course. Both run as the signed-in user (SECURITY INVOKER), so the row
-- security rules are exactly the ones the separate queries already went through.

CREATE OR REPLACE FUNCTION public.get_course_page(_course_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH c AS (
    SELECT * FROM public.courses WHERE id = _course_id
  ),
  g AS (
    SELECT id, name, sort_order FROM public.subject_groups
    WHERE course_id = _course_id ORDER BY sort_order
  ),
  s AS (
    SELECT s.id, s.group_id, s.name, s.sort_order, s.access_level, s.ordered
    FROM public.subjects s
    WHERE s.group_id IN (SELECT id FROM g)
    ORDER BY s.sort_order
  ),
  cnt AS (
    SELECT * FROM public.get_subject_question_counts(
      COALESCE((SELECT array_agg(id) FROM s), '{}'::uuid[])
    )
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM c) THEN
    jsonb_build_object(
      'course', (SELECT to_jsonb(c) FROM c),
      'groups', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.sort_order) FROM g), '[]'::jsonb),
      'subjects', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(s) || jsonb_build_object('question_count', COALESCE(cnt.cnt, 0))
          ORDER BY s.sort_order
        )
        FROM s LEFT JOIN cnt ON cnt.subject_id = s.id
      ), '[]'::jsonb)
    )
  ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.get_course_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_course_page(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_subject_pool_counts(_subject_ids uuid[])
RETURNS TABLE(subject_id uuid, flagged bigint, incorrect bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    sid,
    (SELECT count(*) FROM public.question_flags f
       JOIN public.questions q ON q.id = f.question_id
      WHERE f.user_id = auth.uid() AND q.subject_id = sid),
    (SELECT count(DISTINCT a.question_id) FROM public.question_attempts a
       JOIN public.questions q ON q.id = a.question_id
      WHERE a.user_id = auth.uid() AND a.is_correct = false AND q.subject_id = sid)
  FROM unnest(_subject_ids) AS sid;
$$;

REVOKE ALL ON FUNCTION public.get_my_subject_pool_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_subject_pool_counts(uuid[]) TO authenticated;
