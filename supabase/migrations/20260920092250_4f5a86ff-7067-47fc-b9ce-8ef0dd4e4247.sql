ALTER TABLE public.amg_groups
  ADD COLUMN IF NOT EXISTS batch_name text,
  ADD COLUMN IF NOT EXISTS batch_stage text,
  ADD COLUMN IF NOT EXISTS batch_map jsonb NOT NULL DEFAULT '{}'::jsonb;