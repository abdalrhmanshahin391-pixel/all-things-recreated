CREATE TABLE public.question_translations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  lang text NOT NULL DEFAULT 'ar',
  stem text NOT NULL DEFAULT '',
  explanation text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, lang)
);

GRANT SELECT ON public.question_translations TO authenticated;
GRANT ALL ON public.question_translations TO service_role;

ALTER TABLE public.question_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read question translations"
ON public.question_translations FOR SELECT TO authenticated USING (true);

CREATE TRIGGER question_translations_touch
BEFORE UPDATE ON public.question_translations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX question_translations_question_idx ON public.question_translations(question_id);