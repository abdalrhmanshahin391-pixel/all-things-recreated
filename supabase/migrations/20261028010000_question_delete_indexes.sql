-- Deleting questions (a subject, a question group) makes the database look, for every deleted question, for the rows
-- that point at it. These three links had no index, so each deleted question read the whole table (once per question).
-- With the indexes the lookup is instant. Nothing else changes.
CREATE INDEX IF NOT EXISTS question_flags_question_id_idx ON public.question_flags (question_id);
CREATE INDEX IF NOT EXISTS notes_question_id_idx ON public.notes (question_id);
CREATE INDEX IF NOT EXISTS amg_items_origin_question_id_idx ON public.amg_items (origin_question_id);
