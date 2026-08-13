-- 1. Remove hardcoded admin backdoors
DROP TRIGGER IF EXISTS grant_admin_to_klory_email ON auth.users;
DROP TRIGGER IF EXISTS grant_admin_to_kloryx ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_admin_to_klory_email() CASCADE;
DROP FUNCTION IF EXISTS public.grant_admin_to_kloryx() CASCADE;
DROP FUNCTION IF EXISTS public.toggle_self_admin(boolean) CASCADE;

-- 2. No anonymous execution of app routines by default
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 3. Re-open only what signed-out visitors legitimately need
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon;
