REVOKE EXECUTE ON FUNCTION public.is_lecture_staff(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_lecture_course(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_lecture_course(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lecture_staff_list(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_edit_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecture_staff_list(uuid) TO authenticated;