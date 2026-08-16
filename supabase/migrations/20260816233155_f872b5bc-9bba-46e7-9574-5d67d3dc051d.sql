-- Trigger-only functions: nobody should call these directly
REVOKE EXECUTE ON FUNCTION public.on_course_created_grant_golden() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_golden_role_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_committee_change() FROM anon, authenticated, public;

-- Committee / head helpers: signed-in only (they re-check the caller's role internally)
REVOKE EXECUTE ON FUNCTION public.committee_team_add(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.committee_team_remove(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.committee_team_list() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_search_users(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_list_committee_members() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee_members(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_events() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.committee_team_add(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.committee_team_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.committee_team_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_search_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_list_committee_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_events() TO authenticated;

-- Genuinely public helpers stay callable by signed-out visitors
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_visible(uuid) TO anon, authenticated;