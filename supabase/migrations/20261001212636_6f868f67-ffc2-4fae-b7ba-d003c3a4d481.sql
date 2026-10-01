REVOKE EXECUTE ON FUNCTION public.is_question_contributor(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_request_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_question_contributors() FROM PUBLIC, anon;