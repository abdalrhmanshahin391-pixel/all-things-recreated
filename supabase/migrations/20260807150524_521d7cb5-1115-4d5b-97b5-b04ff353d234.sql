CREATE TYPE public.coupon_discount_type AS ENUM ('percent', 'fixed');
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type public.coupon_discount_type NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 100,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coupons_code_ci ON public.coupons (lower(code));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupons"
  ON public.coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER coupons_touch_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.coupon_courses (
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  PRIMARY KEY (coupon_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_courses TO authenticated;
GRANT ALL ON public.coupon_courses TO service_role;
ALTER TABLE public.coupon_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupon_courses"
  ON public.coupon_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.coupon_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  amount_before NUMERIC(10, 2),
  amount_after NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own redemptions"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users record own redemptions"
  ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage redemptions"
  ON public.coupon_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.validate_coupon(_code TEXT, _course_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.coupons;
  _price numeric;
  _final numeric;
  _applies boolean;
  _already boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'sign_in_required');
  END IF;
  SELECT * INTO _c FROM public.coupons WHERE lower(code) = lower(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF NOT _c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;
  IF _c.starts_at IS NOT NULL AND _c.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_yet_active');
  END IF;
  IF _c.expires_at IS NOT NULL AND _c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  IF _c.max_uses IS NOT NULL AND _c.used_count >= _c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used_up');
  END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_courses WHERE coupon_id = _c.id) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.coupon_courses
      WHERE coupon_id = _c.id AND course_id = _course_id
    ) INTO _applies;
    IF NOT _applies THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'course_excluded');
    END IF;
  END IF;
  SELECT price INTO _price FROM public.courses WHERE id = _course_id LIMIT 1;
  IF _price IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'course_not_found');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coupon_redemptions
    WHERE coupon_id = _c.id AND user_id = _uid AND course_id = _course_id
  ) INTO _already;
  IF _already THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_redeemed');
  END IF;
  IF _c.discount_type = 'percent' THEN
    _final := GREATEST(0, _price - (_price * _c.discount_value / 100.0));
  ELSE
    _final := GREATEST(0, _price - _c.discount_value);
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', _c.id,
    'code', _c.code,
    'discount_type', _c.discount_type,
    'discount_value', _c.discount_value,
    'price_before', _price,
    'price_after', _final
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_coupon(_code TEXT, _course_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _v jsonb;
  _cid uuid;
  _final numeric;
  _before numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'sign_in_required'; END IF;
  _v := public.validate_coupon(_code, _course_id);
  IF NOT (_v->>'valid')::boolean THEN
    RETURN _v;
  END IF;
  _cid := (_v->>'coupon_id')::uuid;
  _final := (_v->>'price_after')::numeric;
  _before := (_v->>'price_before')::numeric;
  INSERT INTO public.coupon_redemptions (coupon_id, user_id, course_id, amount_before, amount_after)
  VALUES (_cid, _uid, _course_id, _before, _final)
  ON CONFLICT (coupon_id, user_id, course_id) DO NOTHING;
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _cid;
  IF _final <= 0 THEN
    INSERT INTO public.user_courses (user_id, course_id)
    VALUES (_uid, _course_id)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN jsonb_set(_v, '{redeemed}', 'true'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_coupon(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_coupon(TEXT, UUID) TO authenticated;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.question_options ALTER COLUMN text DROP NOT NULL;
CREATE POLICY "question images insert by admins"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images update by admins"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images delete by admins"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images readable by entitled users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'question-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.questions q
      JOIN public.subjects s ON s.id = q.subject_id
      JOIN public.subject_groups sg ON sg.id = s.group_id
      WHERE q.image_url = storage.objects.name
        AND (
          s.access_level IN ('free_public'::public.subject_access, 'free_logged_in'::public.subject_access)
          OR EXISTS (
            SELECT 1 FROM public.user_courses uc
            WHERE uc.user_id = auth.uid() AND uc.course_id = sg.course_id
          )
        )
    )
  )
);
CREATE TABLE public.site_content (
  key text PRIMARY KEY,
  group_key text NOT NULL,
  group_label text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  value_en text NOT NULL DEFAULT '',
  value_ar text NOT NULL DEFAULT '',
  default_en text NOT NULL DEFAULT '',
  default_ar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_content public read"
  ON public.site_content FOR SELECT
  USING (true);
CREATE POLICY "site_content admin write"
  ON public.site_content FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_content_touch_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX site_content_group_idx ON public.site_content (group_key, sort_order);
CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  seo_description_en text NOT NULL DEFAULT '',
  seo_description_ar text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published pages are public" ON public.site_pages FOR SELECT USING (published OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage pages" ON public.site_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_pages_touch BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.site_sections(id) ON DELETE CASCADE,
  builtin_key text,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  layout text NOT NULL DEFAULT 'stack',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_sections_page_idx ON public.site_sections(page_id, sort_order);
GRANT SELECT ON public.site_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_sections TO authenticated;
GRANT ALL ON public.site_sections TO service_role;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sections of published pages are public" ON public.site_sections FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (visible AND EXISTS (SELECT 1 FROM public.site_pages p WHERE p.id = page_id AND p.published))
);
CREATE POLICY "Admins manage sections" ON public.site_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_sections_touch BEFORE UPDATE ON public.site_sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.site_sections(id) ON DELETE CASCADE,
  kind text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_blocks_section_idx ON public.site_blocks(section_id, sort_order);
GRANT SELECT ON public.site_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_blocks TO authenticated;
GRANT ALL ON public.site_blocks TO service_role;
ALTER TABLE public.site_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Blocks of published pages are public" ON public.site_blocks FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (visible AND EXISTS (
    SELECT 1 FROM public.site_sections s JOIN public.site_pages p ON p.id = s.page_id
    WHERE s.id = section_id AND s.visible AND p.published
  ))
);
CREATE POLICY "Admins manage blocks" ON public.site_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_blocks_touch BEFORE UPDATE ON public.site_blocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement text NOT NULL DEFAULT 'header',
  label_en text NOT NULL DEFAULT '',
  label_ar text NOT NULL DEFAULT '',
  target_kind text NOT NULL DEFAULT 'route',
  target_value text NOT NULL DEFAULT '/',
  style text NOT NULL DEFAULT 'link',
  visibility text NOT NULL DEFAULT 'all',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_nav_items_placement_idx ON public.site_nav_items(placement, sort_order);
GRANT SELECT ON public.site_nav_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_nav_items TO authenticated;
GRANT ALL ON public.site_nav_items TO service_role;
ALTER TABLE public.site_nav_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nav items are public" ON public.site_nav_items FOR SELECT USING (true);
CREATE POLICY "Admins manage nav items" ON public.site_nav_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_nav_items_touch BEFORE UPDATE ON public.site_nav_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.site_pages (slug, title_en, title_ar, published, is_system, sort_order)
VALUES ('home', 'Home', 'الرئيسية', true, true, 0);
INSERT INTO public.site_sections (page_id, builtin_key, title_en, sort_order)
SELECT p.id, k.key, k.label, k.ord
FROM public.site_pages p,
  (VALUES ('hero','Hero',0),('feature1','Feature row 1',1),('courses','Courses strip',2),
          ('packages','Packages strip',3),('feature2','Feature row 2',4),
          ('universities','Universities strip',5),('footer_cta','Footer call to action',6)) AS k(key,label,ord)
WHERE p.slug = 'home';
CREATE POLICY "site-media readable" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'site-media');
CREATE POLICY "site-media admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site-media admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site-media admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default';
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_to_kloryx() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_to_klory_email() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
CREATE TABLE public.university_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'custom',
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  subtitle_en text NOT NULL DEFAULT '',
  subtitle_ar text NOT NULL DEFAULT '',
  badge_en text NOT NULL DEFAULT '',
  badge_ar text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'Sparkles',
  href text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  highlighted boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT university_tiles_kind_check CHECK (kind IN ('courses','lectures','resources','custom'))
);
CREATE INDEX university_tiles_university_idx ON public.university_tiles (university_id, sort_order);
GRANT SELECT ON public.university_tiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.university_tiles TO authenticated;
GRANT ALL ON public.university_tiles TO service_role;
ALTER TABLE public.university_tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view university tiles"
  ON public.university_tiles FOR SELECT
  USING (true);
CREATE POLICY "Admins manage university tiles"
  ON public.university_tiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER university_tiles_touch_updated_at
  BEFORE UPDATE ON public.university_tiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'courses', 'Courses', 'الكورسات',
       'Question banks · Year-by-year syllabus', 'بنوك الأسئلة · منهج سنة بسنة',
       'BookOpen', '/courses', true, true, 0
FROM public.universities u;
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'lectures', 'Lectures', 'المحاضرات',
       'Video lectures with quizzes', 'محاضرات مصوّرة مع اختبارات',
       'Video', '/lectures', COALESCE(u.lectures_visible, false), false, 1
FROM public.universities u;
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'resources', 'Resources', 'المصادر',
       'Free books, past papers & study material', 'كتب مجانية وأوراق سابقة ومواد دراسية',
       'Library', '/committee', true, true, 2
FROM public.universities u;
CREATE TABLE public.committee_semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.committee_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  number integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.committee_semesters TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_semesters TO authenticated;
GRANT ALL ON public.committee_semesters TO service_role;
ALTER TABLE public.committee_semesters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read semesters" ON public.committee_semesters
FOR SELECT USING (true);
CREATE POLICY "committee manage semesters" ON public.committee_semesters
TO authenticated
USING (public.can_manage_committee(auth.uid()))
WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE INDEX committee_semesters_year_idx ON public.committee_semesters(year_id);
CREATE TRIGGER touch_committee_semesters BEFORE UPDATE ON public.committee_semesters
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.committee_subjects
  ADD COLUMN semester_id uuid REFERENCES public.committee_semesters(id) ON DELETE CASCADE;
CREATE INDEX committee_subjects_semester_idx ON public.committee_subjects(semester_id);
INSERT INTO public.committee_semesters (year_id, name, number, sort_order)
SELECT y.id, 'Semester ' || n, n, n
FROM public.committee_years y
CROSS JOIN generate_series(1, 2) AS n
WHERE y.year_number BETWEEN 1 AND 6;
UPDATE public.committee_subjects s
SET semester_id = sem.id
FROM public.committee_semesters sem
JOIN public.committee_years y ON y.id = sem.year_id
WHERE sem.year_id = s.year_id
  AND sem.number = 1
  AND y.year_number BETWEEN 1 AND 6
  AND s.semester_id IS NULL;
INSERT INTO public.profiles (id, full_name, username, email, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  COALESCE(NULLIF(u.raw_user_meta_data->>'username',''), split_part(u.email::text,'@',1), u.id::text),
  COALESCE(u.email::text, ''),
  NULLIF(COALESCE(u.raw_user_meta_data->>'phone', u.phone::text), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
CREATE OR REPLACE FUNCTION public.search_users_for_group(_query text, _exclude uuid)
 RETURNS TABLE(id uuid, username text, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)) AS username,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') AS full_name,
    COALESCE(p.email, u.email::text) AS email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id <> COALESCE(_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      COALESCE(p.username, u.raw_user_meta_data->>'username', '') ILIKE '%' || _query || '%'
      OR COALESCE(p.email, u.email::text, '') ILIKE '%' || _query || '%'
      OR COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') ILIKE '%' || _query || '%'
    )
  ORDER BY 2
  LIMIT 20;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_list_role_members(_role app_role)
 RETURNS TABLE(user_id uuid, username text, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    ur.user_id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)) AS username,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') AS full_name,
    COALESCE(p.email, u.email::text) AS email
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = _role
  ORDER BY 2;
END;
$function$;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reason text;
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS nickname text;
CREATE TABLE IF NOT EXISTS public.device_security_settings (
  id boolean NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  unlock_code text NOT NULL DEFAULT 'Shadyx1234@',
  telegram_url text NOT NULL DEFAULT 'https://t.me/',
  support_url text NOT NULL DEFAULT '',
  default_device_limit integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.device_security_settings TO authenticated;
GRANT ALL ON public.device_security_settings TO service_role;
ALTER TABLE public.device_security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read device security settings" ON public.device_security_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins insert device security settings" ON public.device_security_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update device security settings" ON public.device_security_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_device_security_settings_touch
  BEFORE UPDATE ON public.device_security_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.device_security_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.device_unlock_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  success boolean NOT NULL DEFAULT false,
  code_used text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_unlock_attempts_user ON public.device_unlock_attempts(user_id, created_at DESC);
GRANT SELECT ON public.device_unlock_attempts TO authenticated;
GRANT ALL ON public.device_unlock_attempts TO service_role;
ALTER TABLE public.device_unlock_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read unlock attempts" ON public.device_unlock_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS show_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS protect_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_watermark_opacity numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS protect_blur_on_blur boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_block_print boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_block_copy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_consent_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_devtools_guard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_auto_lock_threshold integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS protect_terms_en text,
  ADD COLUMN IF NOT EXISTS protect_terms_ar text;
CREATE TABLE IF NOT EXISTS public.content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  context text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  ua text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_events_user_idx ON public.content_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_events_created_idx ON public.content_events (created_at DESC);
GRANT SELECT ON public.content_events TO authenticated;
GRANT ALL ON public.content_events TO service_role;
ALTER TABLE public.content_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all content events"
  ON public.content_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE IF NOT EXISTS public.content_consents (
  user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  ua text,
  PRIMARY KEY (user_id, scope)
);
GRANT SELECT ON public.content_consents TO authenticated;
GRANT ALL ON public.content_consents TO service_role;
ALTER TABLE public.content_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own consents"
  ON public.content_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins read all consents"
  ON public.content_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));