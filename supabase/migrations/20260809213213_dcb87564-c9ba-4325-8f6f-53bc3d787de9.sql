CREATE TABLE IF NOT EXISTS public.admin_data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_data_exports TO authenticated;
GRANT ALL ON public.admin_data_exports TO service_role;

ALTER TABLE public.admin_data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view export audit"
ON public.admin_data_exports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_user_login_events_occurred_at ON public.user_login_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_user_login_events_user_occurred ON public.user_login_events (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON public.user_sessions (last_seen_at);

CREATE OR REPLACE FUNCTION public.admin_people_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'active_now', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= now() - interval '5 minutes'),
    'opened_today', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= date_trunc('day', now())),
    'total_users', (SELECT count(*) FROM public.profiles),
    'new_today', (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('day', now())),
    'new_week', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'new_month', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days'),
    'new_prev_week', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days'),
    'new_prev_month', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'),
    'logins_today', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= date_trunc('day', now())),
    'logins_week', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '7 days'),
    'logins_month', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '30 days'),
    'logins_prev_week', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '14 days' AND occurred_at < now() - interval '7 days'),
    'verified', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
    'unverified', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL),
    'blocked', (SELECT count(*) FROM public.profiles WHERE locked_at IS NOT NULL AND lock_until IS NULL),
    'suspended', (SELECT count(*) FROM public.profiles WHERE locked_at IS NOT NULL AND lock_until IS NOT NULL AND lock_until > now()),
    'never_logged_in', (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = p.id)),
    'dormant_30d', (SELECT count(*) FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = p.id)
                     AND NOT EXISTS (SELECT 1 FROM public.user_login_events e2 WHERE e2.user_id = p.id AND e2.occurred_at >= now() - interval '30 days')),
    'revenue_cents', COALESCE((SELECT sum(amount_cents) FROM public.payment_events WHERE status = 'completed'), 0)
                     + COALESCE((SELECT sum(amount_cents) FROM public.package_purchases), 0),
    'revenue_month_cents', COALESCE((SELECT sum(amount_cents) FROM public.payment_events WHERE status = 'completed' AND created_at >= now() - interval '30 days'), 0)
                     + COALESCE((SELECT sum(amount_cents) FROM public.package_purchases WHERE created_at >= now() - interval '30 days'), 0),
    'paying_users', (SELECT count(DISTINCT u) FROM (
        SELECT user_id AS u FROM public.payment_events WHERE status = 'completed' AND user_id IS NOT NULL
        UNION SELECT buyer_id FROM public.package_purchases WHERE buyer_id IS NOT NULL) x),
    'course_grants', (SELECT count(*) FROM public.user_courses),
    'owners', (SELECT count(DISTINCT user_id) FROM public.user_courses),
    'coupon_redemptions', (SELECT count(*) FROM public.coupon_redemptions),
    'coupon_discount', COALESCE((SELECT sum(amount_before - amount_after) FROM public.coupon_redemptions), 0),
    'generated_at', now()
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_timeseries(_days integer DEFAULT 30)
RETURNS TABLE(day date, signups bigint, logins bigint, active_users bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH d AS (
    SELECT generate_series(date_trunc('day', now()) - ((GREATEST(LEAST(_days, 365), 1) - 1) || ' days')::interval,
                           date_trunc('day', now()), interval '1 day')::date AS day
  )
  SELECT d.day,
    (SELECT count(*) FROM public.profiles p WHERE p.created_at::date = d.day),
    (SELECT count(*) FROM public.user_login_events e WHERE e.occurred_at::date = d.day),
    (SELECT count(DISTINCT e.user_id) FROM public.user_login_events e WHERE e.occurred_at::date = d.day)
  FROM d ORDER BY d.day;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_retention()
RETURNS TABLE(cohort date, size bigint, w0 bigint, w1 bigint, w2 bigint, w3 bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH c AS (
    SELECT p.id, date_trunc('week', p.created_at) AS wk
    FROM public.profiles p
    WHERE p.created_at >= now() - interval '8 weeks'
  )
  SELECT c.wk::date,
    count(*)::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk AND e.occurred_at < c.wk + interval '1 week'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '1 week' AND e.occurred_at < c.wk + interval '2 weeks'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '2 weeks' AND e.occurred_at < c.wk + interval '3 weeks'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '3 weeks' AND e.occurred_at < c.wk + interval '4 weeks'))::bigint
  FROM c GROUP BY c.wk ORDER BY c.wk DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_course_stats()
RETURNS TABLE(course_id uuid, title text, price numeric, owners bigint, revenue_cents bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT co.id, co.title, co.price,
    (SELECT count(*) FROM public.user_courses uc WHERE uc.course_id = co.id)::bigint,
    COALESCE((SELECT sum(pe.amount_cents) FROM public.payment_events pe WHERE pe.course_id = co.id AND pe.status = 'completed'), 0)::bigint
  FROM public.courses co
  ORDER BY 4 DESC, co.title;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_insights()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH base AS (
    SELECT p.id,
      (SELECT count(*) FROM public.user_courses uc WHERE uc.user_id = p.id) AS courses,
      (SELECT count(*) FROM public.user_login_events e WHERE e.user_id = p.id) AS logins,
      (SELECT max(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = p.id) AS last_login,
      p.created_at
    FROM public.profiles p
  )
  SELECT jsonb_build_object(
    'avg_logins_with_courses', COALESCE(round(avg(logins) FILTER (WHERE courses > 0)::numeric, 1), 0),
    'avg_logins_without_courses', COALESCE(round(avg(logins) FILTER (WHERE courses = 0)::numeric, 1), 0),
    'avg_logins_overall', COALESCE(round(avg(logins)::numeric, 1), 0),
    'median_days_to_first_login', COALESCE((
      SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (fl - p2.created_at)) / 86400)::numeric, 1)
      FROM public.profiles p2
      CROSS JOIN LATERAL (SELECT min(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = p2.id) AS f(fl)
      WHERE fl IS NOT NULL), 0),
    'share_returning', CASE WHEN count(*) = 0 THEN 0
      ELSE round(100.0 * count(*) FILTER (WHERE logins > 1) / count(*), 1) END,
    'share_active_7d', CASE WHEN count(*) = 0 THEN 0
      ELSE round(100.0 * count(*) FILTER (WHERE last_login >= now() - interval '7 days') / count(*), 1) END,
    'peak_hour', COALESCE((SELECT EXTRACT(hour FROM occurred_at)::int FROM public.user_login_events
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), 0),
    'peak_weekday', COALESCE((SELECT to_char(occurred_at, 'Day') FROM public.user_login_events
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), '')
  ) INTO result FROM base;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_directory()
RETURNS TABLE(
  id uuid, full_name text, username text, email text, phone text,
  verified boolean, locked_at timestamptz, lock_until timestamptz, lock_reason text,
  roles text[], courses bigint, paid_cents bigint,
  created_at timestamptz, last_seen timestamptz, login_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', ''),
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)),
    COALESCE(p.email, u.email::text),
    COALESCE(p.phone, u.phone::text),
    (u.email_confirmed_at IS NOT NULL),
    p.locked_at, p.lock_until, p.lock_reason,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]),
    (SELECT count(*) FROM public.user_courses uc WHERE uc.user_id = u.id)::bigint,
    (COALESCE((SELECT sum(pe.amount_cents) FROM public.payment_events pe WHERE pe.user_id = u.id AND pe.status = 'completed'), 0)
     + COALESCE((SELECT sum(pp.amount_cents) FROM public.package_purchases pp WHERE pp.buyer_id = u.id), 0))::bigint,
    u.created_at,
    GREATEST(
      (SELECT max(s.last_seen_at) FROM public.user_sessions s WHERE s.user_id = u.id),
      (SELECT max(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = u.id)
    ),
    (SELECT count(*) FROM public.user_login_events e WHERE e.user_id = u.id)::bigint
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END; $$;