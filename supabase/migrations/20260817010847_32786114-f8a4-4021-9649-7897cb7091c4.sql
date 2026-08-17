CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--fc9a842d-8878-47fb-b9e8-2935803c6436.lovable.app/api/public/push-dispatch',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_AG466RguMgvqqLNtVFis2g_4DQl9pKU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);