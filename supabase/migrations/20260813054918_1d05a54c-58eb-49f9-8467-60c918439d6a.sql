REVOKE EXECUTE ON FUNCTION public.admin_group_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_group_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_announcements() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_group(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_committee_change() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_group_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_announcements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_group(uuid, uuid) TO authenticated;
