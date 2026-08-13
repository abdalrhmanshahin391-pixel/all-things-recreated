CREATE TABLE public.site_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.site_secrets TO service_role;
ALTER TABLE public.site_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage site secrets" ON public.site_secrets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_secrets TO authenticated;

CREATE TRIGGER site_secrets_touch BEFORE UPDATE ON public.site_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.site_secrets (key, value)
VALUES ('transfer_code', encode(extensions.gen_random_bytes(12), 'hex'));

ALTER TABLE public.site_settings DROP COLUMN transfer_code;

ALTER TABLE public.device_security_settings ALTER COLUMN unlock_code DROP DEFAULT;
UPDATE public.device_security_settings
SET unlock_code = encode(extensions.gen_random_bytes(9), 'hex')
WHERE unlock_code IS NULL OR unlock_code = 'Shadyx1234@';

DROP POLICY IF EXISTS "public read resources" ON public.committee_resources;
CREATE POLICY "members read resources" ON public.committee_resources
  FOR SELECT TO authenticated
  USING (public.account_active(auth.uid()));
REVOKE SELECT ON public.committee_resources FROM anon;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_group_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_committee_members() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_group_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_course_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_directory() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_insights() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_timeseries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_server_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_self_admin(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_coupon(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, uuid) FROM anon;

DROP FUNCTION IF EXISTS public.__restore_exec(text);