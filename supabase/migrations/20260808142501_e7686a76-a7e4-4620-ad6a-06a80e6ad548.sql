CREATE OR REPLACE FUNCTION public.account_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id AND p.locked_at IS NOT NULL
      );
$$;
REVOKE EXECUTE ON FUNCTION public.account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_active(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "View questions if enrolled or admin" ON public.questions;
CREATE POLICY "View questions if enrolled or admin"
  ON public.questions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.account_active(auth.uid())
      AND EXISTS (
        SELECT 1 FROM subjects s
        JOIN subject_groups sg ON sg.id = s.group_id
        JOIN user_courses uc ON uc.course_id = sg.course_id
        WHERE s.id = questions.subject_id AND uc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "View question_options if enrolled or admin" ON public.question_options;
CREATE POLICY "View question_options if enrolled or admin"
  ON public.question_options FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.account_active(auth.uid())
      AND EXISTS (
        SELECT 1 FROM questions q
        JOIN subjects s ON s.id = q.subject_id
        JOIN subject_groups sg ON sg.id = s.group_id
        JOIN user_courses uc ON uc.course_id = sg.course_id
        WHERE q.id = question_options.question_id AND uc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "public read resources" ON public.committee_resources;
CREATE POLICY "public read resources"
  ON public.committee_resources FOR SELECT
  USING (auth.uid() IS NULL OR public.account_active(auth.uid()));

ALTER TABLE public.committee_resources
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_web_link text,
  ADD COLUMN IF NOT EXISTS drive_download_link text,
  ADD COLUMN IF NOT EXISTS file_size bigint;
CREATE INDEX IF NOT EXISTS committee_resources_storage_provider_idx
  ON public.committee_resources (storage_provider);

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_default_storage text NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS brand_style text NOT NULL DEFAULT 'aqua-flow',
  ADD COLUMN IF NOT EXISTS study_plan_path text,
  ADD COLUMN IF NOT EXISTS study_plan_title text,
  ADD COLUMN IF NOT EXISTS study_plan_subtitle text,
  ADD COLUMN IF NOT EXISTS transfer_code text NOT NULL DEFAULT 'Shadyx1234@Lucifer';

CREATE TABLE public.committee_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.committee_semesters(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'layers',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX committee_modules_semester_idx ON public.committee_modules(semester_id);
GRANT SELECT ON public.committee_modules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_modules TO authenticated;
GRANT ALL ON public.committee_modules TO service_role;
ALTER TABLE public.committee_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read modules" ON public.committee_modules FOR SELECT USING (true);
CREATE POLICY "committee manage modules" ON public.committee_modules FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid())) WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_committee_modules BEFORE UPDATE ON public.committee_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.committee_modules(id) ON DELETE CASCADE;
CREATE INDEX committee_subjects_module_idx ON public.committee_subjects(module_id);

CREATE TABLE public.committee_subject_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  offer_label text,
  original_price numeric(10,2),
  promo_price numeric(10,2),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX committee_subject_courses_subject_idx ON public.committee_subject_courses(subject_id);
GRANT SELECT ON public.committee_subject_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_subject_courses TO authenticated;
GRANT ALL ON public.committee_subject_courses TO service_role;
ALTER TABLE public.committee_subject_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read subject courses" ON public.committee_subject_courses FOR SELECT USING (true);
CREATE POLICY "committee manage subject courses" ON public.committee_subject_courses FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid())) WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_committee_subject_courses BEFORE UPDATE ON public.committee_subject_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_resources DROP CONSTRAINT IF EXISTS committee_resources_kind_check;
ALTER TABLE public.committee_resources ADD CONSTRAINT committee_resources_kind_check
  CHECK (kind = ANY (ARRAY['pdf'::text, 'link'::text, 'folder'::text, 'video'::text]));

ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS tag_label text,
  ADD COLUMN IF NOT EXISTS tag_color text NOT NULL DEFAULT 'amber';

ALTER TABLE public.committee_years
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_semesters
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_modules
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';

CREATE TABLE public.committee_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.committee_activity_log TO authenticated;
GRANT ALL ON public.committee_activity_log TO service_role;
ALTER TABLE public.committee_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read the committee log"
  ON public.committee_activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX committee_activity_log_created_idx ON public.committee_activity_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_committee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _uid uuid := auth.uid();
  _label text;
  _actor text;
  _action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _row := to_jsonb(OLD);
    _action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    _row := to_jsonb(NEW);
    _action := 'added';
  ELSE
    _row := to_jsonb(NEW);
    _action := 'edited';
  END IF;
  _label := COALESCE(
    _row->>'title', _row->>'display_name', _row->>'name', _row->>'label',
    _row->>'promo_label', (_row->>'year_number'), ''
  );
  SELECT COALESCE(p.username, p.full_name, p.email) INTO _actor
  FROM public.profiles p WHERE p.id = _uid;
  INSERT INTO public.committee_activity_log
    (actor_id, actor_label, action, entity_type, entity_id, entity_label, details)
  VALUES (_uid, _actor, _action, TG_TABLE_NAME, (_row->>'id')::uuid, _label, _row);
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_committee_years AFTER INSERT OR UPDATE OR DELETE ON public.committee_years
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_semesters AFTER INSERT OR UPDATE OR DELETE ON public.committee_semesters
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_modules AFTER INSERT OR UPDATE OR DELETE ON public.committee_modules
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_subjects AFTER INSERT OR UPDATE OR DELETE ON public.committee_subjects
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_categories AFTER INSERT OR UPDATE OR DELETE ON public.committee_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_resources AFTER INSERT OR UPDATE OR DELETE ON public.committee_resources
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_subject_courses AFTER INSERT OR UPDATE OR DELETE ON public.committee_subject_courses
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();

GRANT EXECUTE ON FUNCTION public.account_active(uuid) TO anon;

CREATE TABLE public.admin_hub_layout (
  id boolean PRIMARY KEY DEFAULT true,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_hub_layout_singleton CHECK (id)
);
GRANT SELECT ON public.admin_hub_layout TO authenticated;
GRANT ALL ON public.admin_hub_layout TO service_role;
ALTER TABLE public.admin_hub_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read admin hub layout"
  ON public.admin_hub_layout FOR SELECT TO authenticated USING (true);
CREATE TRIGGER admin_hub_layout_touch BEFORE UPDATE ON public.admin_hub_layout
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.study_plan_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL,
  title_ar text,
  subtitle_en text,
  subtitle_ar text,
  has_semesters boolean NOT NULL DEFAULT true,
  has_finals boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.study_plan_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_stages TO authenticated;
GRANT ALL ON public.study_plan_stages TO service_role;
ALTER TABLE public.study_plan_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Study plan stages are viewable by everyone"
  ON public.study_plan_stages FOR SELECT USING (true);
CREATE POLICY "Committee managers manage study plan stages"
  ON public.study_plan_stages FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_study_plan_stages BEFORE UPDATE ON public.study_plan_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.study_plan_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.study_plan_stages(id) ON DELETE CASCADE,
  semester smallint,
  is_final boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  assessment text NOT NULL DEFAULT 'exam',
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_study_plan_subjects_stage ON public.study_plan_subjects(stage_id, semester, sort_order);
GRANT SELECT ON public.study_plan_subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_subjects TO authenticated;
GRANT ALL ON public.study_plan_subjects TO service_role;
ALTER TABLE public.study_plan_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Study plan subjects are viewable by everyone"
  ON public.study_plan_subjects FOR SELECT USING (true);
CREATE POLICY "Committee managers manage study plan subjects"
  ON public.study_plan_subjects FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_study_plan_subjects BEFORE UPDATE ON public.study_plan_subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.study_plan_stages (slug, title_en, title_ar, subtitle_en, has_semesters, has_finals, sort_order) VALUES
  ('zero',   'Zero Course',   'السنة التحضيرية', 'Preparatory year', false, false, 0),
  ('first',  'First Course',  'السنة الأولى',   NULL, true, false, 1),
  ('second', 'Second Course', 'السنة الثانية',  NULL, true, false, 2),
  ('third',  'Third Course',  'السنة الثالثة',  NULL, true, false, 3),
  ('fourth', 'Fourth Course', 'السنة الرابعة',  NULL, true, false, 4),
  ('fifth',  'Fifth Course',  'السنة الخامسة',  NULL, true, false, 5),
  ('sixth',  'Sixth Course',  'السنة السادسة',  NULL, true, true,  6);

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, note, sort_order)
SELECT s.id, NULL, v.name, v.assessment, v.note, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  ('Biology', 'exam', NULL, 0),
  ('Chemistry', 'test', NULL, 1),
  ('Physics', 'exam', NULL, 2),
  ('Foreign language', 'custom', 'Depends on the group', 3),
  ('Armenian language', 'pass', NULL, 4)
) AS v(name, assessment, note, ord) ON true
WHERE s.slug = 'zero';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Medical chemistry 1', 'exam', 0),
  (1, 'Human anatomy', 'exam', 1),
  (1, 'Physical training', 'pass', 2),
  (1, 'Latin', 'pass', 3),
  (1, 'Practical skills 1', 'pass', 4),
  (1, 'First aid with clinical skills', 'pass', 5),
  (1, 'Armenian language', 'pass', 6),
  (1, 'History of medicine', 'pass', 7),
  (1, 'History of Armenian civilization', 'pass', 8),
  (2, 'Medical chemistry 2', 'exam', 0),
  (2, 'Human anatomy', 'exam', 1),
  (2, 'Histology', 'exam', 2),
  (2, 'Clinical anatomy', 'exam', 3),
  (2, 'Medical biology', 'exam', 4),
  (2, 'Biophysics', 'exam', 5),
  (2, 'Medical physics', 'exam', 6),
  (2, 'Academic English', 'pass', 7),
  (2, 'Physical training', 'pass', 8),
  (2, 'Armenian language', 'pass', 9),
  (2, 'History of Armenian civilization', 'pass', 10),
  (2, 'Latin', 'pass', 11)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'first';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Psychology', 'exam', 0),
  (1, 'Human anatomy', 'exam', 1),
  (1, 'Histology', 'exam', 2),
  (1, 'Physiology', 'exam', 3),
  (1, 'Biochemistry', 'exam', 4),
  (1, 'Clinical anatomy', 'pass', 5),
  (1, 'Armenian language', 'pass', 6),
  (1, 'History of medicine', 'pass', 7),
  (1, 'History of Armenian civilization', 'pass', 8),
  (2, 'Parasitology', 'exam', 0),
  (2, 'Biostatistics', 'pass', 1),
  (2, 'Microbiology', 'exam', 2),
  (2, 'Physiology', 'exam', 3),
  (2, 'Biochemistry', 'exam', 4),
  (2, 'Armenian language', 'pass', 5),
  (2, 'Practical skills 2', 'pass', 6),
  (2, 'Bioethics', 'pass', 7),
  (2, 'Philosophy', 'pass', 8)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'second';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Pharmacology', 'exam', 0),
  (1, 'Microbiology', 'exam', 1),
  (1, 'Pathophysiology', 'exam', 2),
  (1, 'Pathoanatomy', 'exam', 3),
  (1, 'Internal medicine', 'exam', 4),
  (1, 'Surgery', 'exam', 5),
  (1, 'Pediatrics', 'exam', 6),
  (1, 'Surgical skills', 'practical', 7),
  (1, 'Medical law', 'test', 8),
  (1, 'Armenian language', 'pass', 9),
  (2, 'Pharmacology', 'exam', 0),
  (2, 'Pathophysiology', 'exam', 1),
  (2, 'Pathoanatomy', 'exam', 2),
  (2, 'Internal medicine', 'oral', 3),
  (2, 'Surgery', 'oral', 4),
  (2, 'Clinical skills', 'practical', 5),
  (2, 'Armenian language', 'pass', 6)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'third';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, note, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.note, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Internal medicine', 'exam', 'Cardiology, pulmonology, hematology', 0),
  (1, 'Obstetrics and gynaecology', 'oral', NULL, 1),
  (1, 'Surgery', 'exam', NULL, 2),
  (1, 'Urology', 'exam', NULL, 3),
  (1, 'Pediatrics', 'exam', 'Pediatrics, genetics, hygiene', 4),
  (1, 'Public health', 'exam', 'Public health, epidemiology', 5),
  (2, 'Internal medicine', 'exam', 'Cardiology, pulmonology, nephrology, gastroenterology, clinical radiology', 0),
  (2, 'Surgery', 'exam', NULL, 1),
  (2, 'Obstetrics and gynaecology', 'oral', NULL, 2),
  (2, 'Clinical neurology', 'exam', 'Neurology, neurosurgery', 3),
  (2, 'Organism and ecosystem', 'exam', NULL, 4)
) AS v(sem, name, assessment, note, ord) ON true
WHERE s.slug = 'fourth';