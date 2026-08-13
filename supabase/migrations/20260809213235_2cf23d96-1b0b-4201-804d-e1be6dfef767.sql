REVOKE EXECUTE ON FUNCTION public.admin_people_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_timeseries(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_retention() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_course_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_insights() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_directory() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_people_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_timeseries(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_retention() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_course_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_insights() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_directory() TO authenticated, service_role;