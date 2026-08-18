CREATE OR REPLACE FUNCTION public.set_committee_qr(_link text, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'committee_head')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.site_settings
     SET committee_qr_link = NULLIF(btrim(coalesce(_link, '')), ''),
         committee_qr_path = NULLIF(btrim(coalesce(_path, '')), '')
   WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_committee_qr(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_committee_qr(text, text) TO authenticated;