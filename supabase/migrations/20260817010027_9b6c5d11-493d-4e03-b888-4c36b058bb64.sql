CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  user_agent text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins read subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.push_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  audience_group_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX push_messages_pending_idx ON public.push_messages(status, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_messages TO authenticated;
GRANT ALL ON public.push_messages TO service_role;
ALTER TABLE public.push_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "senders manage messages" ON public.push_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role));

CREATE TABLE public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.push_messages(id) ON DELETE CASCADE,
  user_id uuid,
  endpoint text NOT NULL DEFAULT '',
  ok boolean NOT NULL DEFAULT false,
  status_code integer,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_deliveries_message_idx ON public.push_deliveries(message_id);
GRANT SELECT ON public.push_deliveries TO authenticated;
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deliveries" ON public.push_deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role));

CREATE TABLE public.notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  on_event boolean NOT NULL DEFAULT false,
  on_committee_resource boolean NOT NULL DEFAULT false,
  on_new_course boolean NOT NULL DEFAULT false,
  on_urgent_announcement boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read notification settings" ON public.notification_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write notification settings" ON public.notification_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
INSERT INTO public.notification_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER notification_settings_touch BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.push_audience_count(_group_ids uuid[])
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT (public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'committee_head'::public.app_role)) THEN 0::bigint
    ELSE (
      SELECT count(*)::bigint FROM public.push_subscriptions s
      WHERE s.enabled
        AND (
          coalesce(array_length(_group_ids, 1), 0) = 0
          OR EXISTS (SELECT 1 FROM unnest(_group_ids) g(id) WHERE public.user_in_group(s.user_id, g.id))
        )
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.push_audience_count(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_audience_count(uuid[]) TO authenticated, service_role;