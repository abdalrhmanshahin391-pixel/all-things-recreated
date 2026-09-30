SELECT cron.unschedule('push-dispatch');

CREATE OR REPLACE FUNCTION public.schedule_push_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE
  t timestamptz;
  expr text;
BEGIN
  IF NEW.status <> 'scheduled' OR NEW.scheduled_at IS NULL THEN RETURN NEW; END IF;
  t := greatest(NEW.scheduled_at, now() + interval '1 minute') AT TIME ZONE 'UTC';
  expr := format('%s %s %s %s *',
    extract(minute from t)::int, extract(hour from t)::int,
    extract(day from t)::int, extract(month from t)::int);
  PERFORM cron.schedule('push-' || NEW.id::text, expr,
    $cmd$SELECT net.http_post(
      url := 'https://project--fc9a842d-8878-47fb-b9e8-2935803c6436.lovable.app/api/public/push-dispatch',
      headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_AG466RguMgvqqLNtVFis2g_4DQl9pKU"}'::jsonb,
      body := '{}'::jsonb);$cmd$);
  RETURN NEW;
END $$;

CREATE TRIGGER push_messages_schedule
AFTER INSERT ON public.push_messages
FOR EACH ROW EXECUTE FUNCTION public.schedule_push_job();

CREATE OR REPLACE FUNCTION public.unschedule_push_job(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-' || _id::text;
END $$;

REVOKE EXECUTE ON FUNCTION public.unschedule_push_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unschedule_push_job(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.schedule_push_job() FROM PUBLIC, anon, authenticated;