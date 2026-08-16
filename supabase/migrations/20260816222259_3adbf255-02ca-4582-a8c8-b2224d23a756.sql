-- 1. Committee head can do everything a committee member can
CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role)
      OR public.has_role(_user_id, 'committee_head'::public.app_role);
$$;

-- 2. Heads may read the committee change log
DROP POLICY IF EXISTS "Admins can read the committee log" ON public.committee_activity_log;
CREATE POLICY "Admins and heads can read the committee log"
ON public.committee_activity_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'committee_head'::public.app_role)
);

-- 3. Heads may grant / revoke ONLY the committee role
CREATE OR REPLACE FUNCTION public.head_set_committee_role(_user_id uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'committee'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'committee'::public.app_role;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) TO authenticated;

-- 4. Heads may list committee members and search users
CREATE OR REPLACE FUNCTION public.head_list_committee_members()
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.username, split_part(COALESCE(p.email,''),'@',1)) AS username,
         COALESCE(p.full_name,'') AS full_name,
         COALESCE(p.email,'') AS email
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'committee'::public.app_role
  ORDER BY 2;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_list_committee_members() FROM anon;
GRANT EXECUTE ON FUNCTION public.head_list_committee_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.head_search_users(_query text)
RETURNS TABLE(id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _query IS NULL OR length(trim(_query)) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id,
         COALESCE(p.username,'') AS username,
         COALESCE(p.full_name,'') AS full_name,
         COALESCE(p.email,'') AS email
  FROM public.profiles p
  WHERE p.username ILIKE '%'||_query||'%'
     OR p.full_name ILIKE '%'||_query||'%'
     OR p.email ILIKE '%'||_query||'%'
  ORDER BY 2
  LIMIT 20;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_search_users(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.head_search_users(text) TO authenticated;

-- 5. Events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  subtitle_en text NOT NULL DEFAULT '',
  subtitle_ar text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'public',
  button_placement text NOT NULL DEFAULT 'home',
  button_style text NOT NULL DEFAULT 'hero',
  accent text NOT NULL DEFAULT 'emerald',
  cover_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_read ON public.events FOR SELECT
USING (
  (enabled AND visibility = 'public')
  OR (enabled AND visibility = 'auth' AND auth.uid() IS NOT NULL)
  OR public.can_manage_committee(auth.uid())
);
CREATE POLICY events_manage ON public.events FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'committee_head'::public.app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'committee_head'::public.app_role));
CREATE TRIGGER events_touch BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.event_visible(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND ( (e.enabled AND e.visibility = 'public')
         OR (e.enabled AND e.visibility = 'auth' AND auth.uid() IS NOT NULL)
         OR public.can_manage_committee(auth.uid()) )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_events()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'committee_head'::public.app_role);
$$;

CREATE TABLE public.event_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sections TO authenticated;
GRANT SELECT ON public.event_sections TO anon;
GRANT ALL ON public.event_sections TO service_role;
ALTER TABLE public.event_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_sections_read ON public.event_sections FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_sections_manage ON public.event_sections FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());

CREATE TABLE public.event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  role_label text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  photo_fit text NOT NULL DEFAULT 'cover',
  is_head boolean NOT NULL DEFAULT false,
  accent integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_members TO authenticated;
GRANT SELECT ON public.event_members TO anon;
GRANT ALL ON public.event_members TO service_role;
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_members_read ON public.event_members FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_members_manage ON public.event_members FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());

CREATE TABLE public.event_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'join',
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  note_en text NOT NULL DEFAULT '',
  note_ar text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  button_label text NOT NULL DEFAULT '',
  qr_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_contacts TO authenticated;
GRANT SELECT ON public.event_contacts TO anon;
GRANT ALL ON public.event_contacts TO service_role;
ALTER TABLE public.event_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_contacts_read ON public.event_contacts FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_contacts_manage ON public.event_contacts FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());