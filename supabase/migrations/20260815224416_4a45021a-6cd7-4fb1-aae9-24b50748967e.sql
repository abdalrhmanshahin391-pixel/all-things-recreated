ALTER TABLE public.user_courses ADD COLUMN IF NOT EXISTS granted_reason text;
ALTER TABLE public.user_lecture_courses ADD COLUMN IF NOT EXISTS granted_reason text;

CREATE OR REPLACE FUNCTION public.sync_golden_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_courses (user_id, course_id, granted_reason)
  SELECT _user_id, c.id, 'golden'
  FROM public.courses c
  WHERE COALESCE(c.kind, 'questions') <> 'lectures'
  ON CONFLICT (user_id, course_id) DO NOTHING;

  INSERT INTO public.user_lecture_courses (user_id, course_id, granted_reason)
  SELECT _user_id, c.id, 'golden'
  FROM public.courses c
  WHERE c.kind = 'lectures'
  ON CONFLICT (user_id, course_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_golden_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_courses WHERE user_id = _user_id AND granted_reason = 'golden';
  DELETE FROM public.user_lecture_courses WHERE user_id = _user_id AND granted_reason = 'golden';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_golden_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_golden_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_golden_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'golden' THEN
    PERFORM public.sync_golden_user(NEW.user_id);
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'golden' THEN
    PERFORM public.revoke_golden_user(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_golden_role_change ON public.user_roles;
CREATE TRIGGER trg_golden_role_change
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.on_golden_role_change();

CREATE OR REPLACE FUNCTION public.on_course_created_grant_golden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.kind, 'questions') = 'lectures' THEN
    INSERT INTO public.user_lecture_courses (user_id, course_id, granted_reason)
    SELECT ur.user_id, NEW.id, 'golden'
    FROM public.user_roles ur
    WHERE ur.role = 'golden'
    ON CONFLICT (user_id, course_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_courses (user_id, course_id, granted_reason)
    SELECT ur.user_id, NEW.id, 'golden'
    FROM public.user_roles ur
    WHERE ur.role = 'golden'
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_grant_golden ON public.courses;
CREATE TRIGGER trg_course_grant_golden
AFTER INSERT ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.on_course_created_grant_golden();