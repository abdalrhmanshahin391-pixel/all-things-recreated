ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS semester integer;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS about_sentence_en text;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS about_sentence_ar text;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS committee_team_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS original_price numeric;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.my_announcements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee_years(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_committee_en(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_content sc
    WHERE sc.key = 'committee_en_user_ids'
      AND COALESCE(sc.value_en, '') LIKE '%' || _user_id::text || '%'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_committee_en(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'committee')
      OR public.has_role(_user_id,'committee_head') OR public.is_committee_en(_user_id)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_committee_years(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'committee')
      OR public.has_role(_user_id,'committee_head') OR public.is_committee_en(_user_id)
$$;

-- Course material files readable by anyone who can view the course
CREATE POLICY "course material pdfs readable by course viewers" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'lecture-pdfs' AND EXISTS (
    SELECT 1 FROM public.lecture_course_materials m
    WHERE m.storage_path = storage.objects.name AND public.can_view_lecture_course(m.course_id)
  )
);

-- Lecture staff may upload/remove files under their course's folder (path contains the course id)
CREATE POLICY "lecture staff write lecture files" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id IN ('lecture-pdfs','lecture-videos') AND EXISTS (
    SELECT 1 FROM public.lecture_staff s
    WHERE s.user_id = auth.uid() AND storage.objects.name LIKE '%' || s.course_id::text || '%'
  )
);
CREATE POLICY "lecture staff update lecture files" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id IN ('lecture-pdfs','lecture-videos') AND EXISTS (
    SELECT 1 FROM public.lecture_staff s
    WHERE s.user_id = auth.uid() AND storage.objects.name LIKE '%' || s.course_id::text || '%'
  )
);
CREATE POLICY "lecture staff delete lecture files" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id IN ('lecture-pdfs','lecture-videos') AND EXISTS (
    SELECT 1 FROM public.lecture_staff s
    WHERE s.user_id = auth.uid() AND storage.objects.name LIKE '%' || s.course_id::text || '%'
  )
);

-- Invalidate cached Arabic translations when a question changes
CREATE OR REPLACE FUNCTION public.clear_question_translation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.question_translations
  WHERE question_id = COALESCE(NEW.question_id, OLD.question_id);
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.clear_question_translation_q()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stem IS DISTINCT FROM OLD.stem OR NEW.explanation IS DISTINCT FROM OLD.explanation THEN
    DELETE FROM public.question_translations WHERE question_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_clear_translation_q ON public.questions;
CREATE TRIGGER trg_clear_translation_q AFTER UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.clear_question_translation_q();
DROP TRIGGER IF EXISTS trg_clear_translation_opts ON public.question_options;
CREATE TRIGGER trg_clear_translation_opts AFTER INSERT OR UPDATE OR DELETE ON public.question_options
FOR EACH ROW EXECUTE FUNCTION public.clear_question_translation();