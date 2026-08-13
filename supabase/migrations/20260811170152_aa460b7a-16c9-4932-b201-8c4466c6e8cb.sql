GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_keys TO authenticated;
GRANT ALL ON public.admin_ai_keys TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_model_limits TO authenticated;
GRANT ALL ON public.admin_ai_model_limits TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_chunks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_chunks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_chunks TO service_role;