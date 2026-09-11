-- Seed default 100% test coupon if not present
INSERT INTO public.coupons (code, discount_type, discount_value, is_active)
VALUES ('FREE100', 'percent', 100, true)
ON CONFLICT (lower(code)) DO NOTHING;

-- Ensure apply_coupon handles both standard question bank courses and lecture courses
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
  _kind text;
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
    SELECT kind INTO _kind FROM public.courses WHERE id = _course_id LIMIT 1;
    IF _kind = 'lectures' THEN
      INSERT INTO public.user_lecture_courses (user_id, course_id)
      VALUES (_uid, _course_id)
      ON CONFLICT (user_id, course_id) DO NOTHING;
    ELSE
      INSERT INTO public.user_courses (user_id, course_id)
      VALUES (_uid, _course_id)
      ON CONFLICT (user_id, course_id) DO NOTHING;
    END IF;
  END IF;
  RETURN jsonb_set(_v, '{redeemed}', 'true'::jsonb);
END;
$$;
