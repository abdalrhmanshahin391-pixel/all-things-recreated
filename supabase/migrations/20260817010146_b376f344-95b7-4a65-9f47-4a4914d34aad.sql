CREATE OR REPLACE FUNCTION public.push_audience_devices(_group_ids uuid[])
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text, lang text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.user_id, s.endpoint, s.p256dh, s.auth, s.lang
  FROM public.push_subscriptions s
  WHERE s.enabled
    AND (
      coalesce(array_length(_group_ids, 1), 0) = 0
      OR EXISTS (SELECT 1 FROM unnest(_group_ids) g(id) WHERE public.user_in_group(s.user_id, g.id))
    );
$$;
REVOKE ALL ON FUNCTION public.push_audience_devices(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_audience_devices(uuid[]) TO service_role;