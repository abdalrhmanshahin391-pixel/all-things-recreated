CREATE TABLE public.question_contributors (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.question_contributors TO authenticated;
GRANT ALL ON public.question_contributors TO service_role;
ALTER TABLE public.question_contributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qc admin all" ON public.question_contributors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "qc self read" ON public.question_contributors FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_question_contributor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.question_contributors WHERE user_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION public.is_question_contributor(uuid) TO authenticated;

CREATE TABLE public.request_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_groups TO authenticated;
GRANT ALL ON public.request_groups TO service_role;
ALTER TABLE public.request_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rg admin all" ON public.request_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rg owner all" ON public.request_groups FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_question_contributor(auth.uid()))
  WITH CHECK (owner_id = auth.uid() AND public.is_question_contributor(auth.uid()));
CREATE TRIGGER rg_touch BEFORE UPDATE ON public.request_groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.can_edit_request_group(_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.request_groups g WHERE g.id = _group_id AND g.owner_id = auth.uid()
      AND public.is_question_contributor(auth.uid()))
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_request_group(uuid) TO authenticated;

CREATE TABLE public.request_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.request_groups(id) ON DELETE CASCADE,
  stem text NOT NULL,
  explanation text,
  answer_mode text NOT NULL DEFAULT 'single',
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_questions TO authenticated;
GRANT ALL ON public.request_questions TO service_role;
ALTER TABLE public.request_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rq edit" ON public.request_questions FOR ALL TO authenticated
  USING (public.can_edit_request_group(group_id)) WITH CHECK (public.can_edit_request_group(group_id));
CREATE TRIGGER rq_touch BEFORE UPDATE ON public.request_questions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.request_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.request_questions(id) ON DELETE CASCADE,
  label text NOT NULL,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_question_options TO authenticated;
GRANT ALL ON public.request_question_options TO service_role;
ALTER TABLE public.request_question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rqo edit" ON public.request_question_options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.request_questions q WHERE q.id = question_id AND public.can_edit_request_group(q.group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.request_questions q WHERE q.id = question_id AND public.can_edit_request_group(q.group_id)));

CREATE POLICY "contributors upload request images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-images' AND name LIKE 'requests/%' AND public.is_question_contributor(auth.uid()));
CREATE POLICY "contributors read request images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-images' AND name LIKE 'requests/%' AND public.is_question_contributor(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_list_question_contributors()
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.user_id, p.username, p.full_name, u.email::text
  FROM public.question_contributors c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN auth.users u ON u.id = c.user_id
  WHERE public.has_role(auth.uid(),'admin')
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_question_contributors() TO authenticated;