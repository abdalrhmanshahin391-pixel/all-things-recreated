ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS header_style text NOT NULL DEFAULT 'institutional';
GRANT SELECT (header_style) ON public.site_settings TO anon, authenticated;