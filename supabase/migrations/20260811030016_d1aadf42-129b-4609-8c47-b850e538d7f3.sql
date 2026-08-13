CREATE TABLE public.study_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'aqua',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_subjects TO authenticated;
GRANT ALL ON public.study_subjects TO service_role;
ALTER TABLE public.study_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own study subjects" ON public.study_subjects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.study_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.study_subjects(id) on delete cascade,
  title text not null,
  note text,
  status text not null default 'todo',
  due_date date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_topics TO authenticated;
GRANT ALL ON public.study_topics TO service_role;
ALTER TABLE public.study_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own study topics" ON public.study_topics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX study_topics_subject_idx ON public.study_topics(subject_id);

CREATE TABLE public.study_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text,
  subject_id uuid references public.study_subjects(id) on delete set null,
  starts_at timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_exams TO authenticated;
GRANT ALL ON public.study_exams TO service_role;
ALTER TABLE public.study_exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own study exams" ON public.study_exams FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX study_exams_user_starts_idx ON public.study_exams(user_id, starts_at);

CREATE TABLE public.study_focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'pomodoro',
  minutes integer not null default 0,
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_focus_sessions TO authenticated;
GRANT ALL ON public.study_focus_sessions TO service_role;
ALTER TABLE public.study_focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own focus sessions" ON public.study_focus_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX study_focus_user_ended_idx ON public.study_focus_sessions(user_id, ended_at);

CREATE TRIGGER study_subjects_touch BEFORE UPDATE ON public.study_subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER study_topics_touch BEFORE UPDATE ON public.study_topics FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER study_exams_touch BEFORE UPDATE ON public.study_exams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.study_hub_tiles (label, label_ar, description, description_ar, icon, href, external, hidden, sort)
VALUES
  ('To do', 'المهام', 'Track your materials, topics and progress', 'تابع موادك ومواضيعك وتقدمك', 'ListChecks', '/study-hub/todo', false, false, 1),
  ('My exams & tests', 'اختباراتي', 'Add your exams and see the countdown', 'أضف اختباراتك وشاهد العد التنازلي', 'CalendarDays', '/study-hub/exams', false, false, 2),
  ('Study with me', 'ادرس معي', 'Focus timer with breaks and study systems', 'مؤقت تركيز مع فترات راحة وأنظمة دراسة', 'Timer', '/study-hub/focus', false, false, 3);