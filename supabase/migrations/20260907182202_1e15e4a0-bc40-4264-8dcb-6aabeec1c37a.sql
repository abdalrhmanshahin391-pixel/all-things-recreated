ALTER TABLE public.aquavision_items
  ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'single'
  CHECK (answer_mode IN ('single', 'multiple'));

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'single'
  CHECK (answer_mode IN ('single', 'multiple'));

ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS selected_labels text[];

COMMENT ON COLUMN public.aquavision_items.answer_mode IS 'Whether the extracted question accepts one answer or multiple answers.';
COMMENT ON COLUMN public.questions.answer_mode IS 'Whether students select one option or all applicable options.';
COMMENT ON COLUMN public.question_attempts.selected_labels IS 'All option labels selected for a multiple-answer attempt.';