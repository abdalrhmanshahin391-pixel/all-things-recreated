REVOKE EXECUTE ON FUNCTION public.clear_question_translation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_question_translation_q() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_committee_en(uuid) FROM PUBLIC, anon;