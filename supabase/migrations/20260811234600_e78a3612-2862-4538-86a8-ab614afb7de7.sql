CREATE TABLE public.course_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('category','year','exam_type')),
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

GRANT SELECT ON public.course_options TO anon;
GRANT SELECT ON public.course_options TO authenticated;
GRANT ALL ON public.course_options TO service_role;

ALTER TABLE public.course_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_options public read"
  ON public.course_options FOR SELECT
  USING (true);

CREATE POLICY "course_options admin write"
  ON public.course_options FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER course_options_touch
  BEFORE UPDATE ON public.course_options
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.course_options (kind, value, label, sort_order) VALUES
  ('category','major','Major',0),
  ('category','minor','Minor',1),
  ('year','1','Year 1',0),
  ('year','2','Year 2',1),
  ('year','3','Year 3',2),
  ('year','4','Year 4',3),
  ('year','5','Year 5',4),
  ('year','6','Year 6',5),
  ('exam_type','MINI-OSCE','MINI-OSCE',0),
  ('exam_type','FINAL','FINAL',1),
  ('exam_type','MID','MID',2),
  ('exam_type','OSCE','OSCE',3);