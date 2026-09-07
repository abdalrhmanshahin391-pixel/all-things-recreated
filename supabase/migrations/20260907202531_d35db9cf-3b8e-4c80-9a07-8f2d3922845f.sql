ALTER TABLE public.aquavision_items
  ADD COLUMN question_type text NOT NULL DEFAULT 'ordinary';

ALTER TABLE public.aquavision_items
  ADD CONSTRAINT aquavision_items_question_type_check
  CHECK (question_type IN ('ordinary', 'combination', 'multiple_select'));

UPDATE public.aquavision_items
SET question_type = CASE
  WHEN answer_mode = 'multiple' AND jsonb_array_length(combo_sets) >= 2 THEN 'combination'
  WHEN answer_mode = 'multiple' THEN 'multiple_select'
  ELSE 'ordinary'
END;