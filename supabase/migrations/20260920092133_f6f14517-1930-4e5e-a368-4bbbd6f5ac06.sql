CREATE OR REPLACE FUNCTION public.can_use_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.can_use_amg(uuid) FROM anon;

CREATE TABLE public.amg_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  provider text NOT NULL DEFAULT 'google',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  mode text NOT NULL DEFAULT 'standard',
  form_b_style text NOT NULL DEFAULT 'in_question',
  instructions text NOT NULL DEFAULT '',
  source_name text NOT NULL DEFAULT '',
  page_count integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  answer_source text NOT NULL DEFAULT 'ai',
  answer_key text NOT NULL DEFAULT '',
  prefer_source boolean NOT NULL DEFAULT false,
  source_storage_path text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_groups TO authenticated;
GRANT ALL ON public.amg_groups TO service_role;
ALTER TABLE public.amg_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_groups_staff" ON public.amg_groups FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  page_no integer NOT NULL,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, page_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_pages TO authenticated;
GRANT ALL ON public.amg_pages TO service_role;
ALTER TABLE public.amg_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_pages_staff" ON public.amg_pages FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.amg_pages(id) ON DELETE SET NULL,
  page_no integer NOT NULL DEFAULT 1,
  order_index integer NOT NULL DEFAULT 0,
  form text NOT NULL DEFAULT 'A',
  number_label text NOT NULL DEFAULT '',
  stem text NOT NULL DEFAULT '',
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  answer_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  answer_mode text NOT NULL DEFAULT 'single',
  explanation jsonb,
  solved boolean NOT NULL DEFAULT false,
  solve_error text,
  dup_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX amg_items_group_idx ON public.amg_items (group_id, page_no, order_index);
CREATE INDEX amg_items_dup_idx ON public.amg_items (group_id, dup_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_items TO authenticated;
GRANT ALL ON public.amg_items TO service_role;
ALTER TABLE public.amg_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_items_staff" ON public.amg_items FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  item_id uuid,
  actor uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX amg_events_group_idx ON public.amg_events (group_id, created_at DESC);
GRANT SELECT, INSERT ON public.amg_events TO authenticated;
GRANT ALL ON public.amg_events TO service_role;
ALTER TABLE public.amg_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_events_staff_read" ON public.amg_events FOR SELECT TO authenticated
  USING (public.can_use_amg(auth.uid()));
CREATE POLICY "amg_events_staff_write" ON public.amg_events FOR INSERT TO authenticated
  WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_keys (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_keys TO authenticated;
GRANT ALL ON public.amg_keys TO service_role;
ALTER TABLE public.amg_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_keys_admin" ON public.amg_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER amg_groups_touch BEFORE UPDATE ON public.amg_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER amg_pages_touch BEFORE UPDATE ON public.amg_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER amg_items_touch BEFORE UPDATE ON public.amg_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();