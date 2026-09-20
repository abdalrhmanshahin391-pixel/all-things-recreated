ALTER TABLE public.amg_items
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orig jsonb;

CREATE INDEX IF NOT EXISTS amg_items_group_archived_idx ON public.amg_items (group_id, archived);