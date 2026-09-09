ALTER TABLE public.aquavision_jobs
  ADD COLUMN IF NOT EXISTS sort_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sort_topics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.aquavision_items
  ADD COLUMN IF NOT EXISTS topic text;

CREATE INDEX IF NOT EXISTS aquavision_items_job_topic_idx ON public.aquavision_items (job_id, topic);