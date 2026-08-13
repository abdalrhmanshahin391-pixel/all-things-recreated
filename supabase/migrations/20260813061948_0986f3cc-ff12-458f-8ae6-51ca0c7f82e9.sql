DROP POLICY IF EXISTS "Users record own redemptions" ON public.coupon_redemptions;

DROP POLICY IF EXISTS "Anon can view subjects of published courses" ON public.subjects;
DROP POLICY IF EXISTS "Authenticated can view subjects of published courses" ON public.subjects;

CREATE POLICY "Anon can view free public subjects"
ON public.subjects FOR SELECT TO anon
USING (
  access_level = 'free_public'::public.subject_access
  AND EXISTS (
    SELECT 1 FROM public.subject_groups sg
    JOIN public.courses c ON c.id = sg.course_id
    WHERE sg.id = subjects.group_id AND c.published = true
  )
);

CREATE POLICY "Authenticated can view free subjects"
ON public.subjects FOR SELECT TO authenticated
USING (
  access_level IN ('free_public'::public.subject_access, 'free_logged_in'::public.subject_access)
  AND EXISTS (
    SELECT 1 FROM public.subject_groups sg
    JOIN public.courses c ON c.id = sg.course_id
    WHERE sg.id = subjects.group_id AND c.published = true
  )
);