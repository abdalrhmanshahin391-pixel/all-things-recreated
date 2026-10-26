-- Scheduled notifications called an old internal address (project--….lovable.app), so a push scheduled for a
-- future time never reached the site. Point the one-time job at the real domain. No recurring cron job is added:
-- the database still wakes only at the minute a scheduled message is due.

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
      url := 'https://aquaqbank.com/api/public/push-dispatch',
      headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_AG466RguMgvqqLNtVFis2g_4DQl9pKU"}'::jsonb,
      body := '{}'::jsonb);$cmd$);
  RETURN NEW;
END $$;

-- Jobs for messages that were already scheduled still carry the old address.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job WHERE jobname LIKE 'push-%' AND command LIKE '%project--%' LOOP
    PERFORM cron.alter_job(
      j.jobid,
      command := replace(j.command,
        'https://project--fc9a842d-8878-47fb-b9e8-2935803c6436.lovable.app/api/public/push-dispatch',
        'https://aquaqbank.com/api/public/push-dispatch')
    );
  END LOOP;
END $$;
