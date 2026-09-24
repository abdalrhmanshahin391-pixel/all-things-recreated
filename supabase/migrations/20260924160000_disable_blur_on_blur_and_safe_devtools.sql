-- Make leaving the page and devtools safe and non-blocking by default.
-- Only recording, screenshots, and copying should be considered risky.
ALTER TABLE public.site_settings 
  ALTER COLUMN protect_blur_on_blur SET DEFAULT false,
  ALTER COLUMN protect_devtools_guard SET DEFAULT false;

UPDATE public.site_settings 
SET protect_blur_on_blur = false,
    protect_devtools_guard = false
WHERE id = true;
