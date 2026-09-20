REVOKE EXECUTE ON FUNCTION public.can_use_amg(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_amg(uuid) TO authenticated, service_role;