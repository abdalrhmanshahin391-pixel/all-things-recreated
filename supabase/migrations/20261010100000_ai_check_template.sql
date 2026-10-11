-- Final question approval: the words QA copy to an AI ("Copy for AI"). Admins edit it; everyone signed in can read it.
-- site_settings already lets everyone read and only admins update.
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS ai_check_template text;
