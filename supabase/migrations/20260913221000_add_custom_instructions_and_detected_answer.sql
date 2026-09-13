-- Add detected_answer to aquavision_items (for answers printed or highlighted on question PDFs)
ALTER TABLE public.aquavision_items
  ADD COLUMN IF NOT EXISTS detected_answer text;

-- Add custom_instructions to aquavision_jobs (for administrator instructions/notes to AI before solving)
ALTER TABLE public.aquavision_jobs
  ADD COLUMN IF NOT EXISTS custom_instructions text;

COMMENT ON COLUMN public.aquavision_items.detected_answer IS 'Answer detected directly from the question PDF page (printed or highlighted).';
COMMENT ON COLUMN public.aquavision_jobs.custom_instructions IS 'Custom instructions and notes given by the administrator to Gemini before solving.';
