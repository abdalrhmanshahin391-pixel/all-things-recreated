-- A course can be marked coming soon: students see the card but cannot open it; admins still can.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS coming_soon boolean NOT NULL DEFAULT false;