CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  phone TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.id::text),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
create type public.app_role as enum ('admin', 'user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from public.profiles where username = 'Kloryx1'
on conflict do nothing;
create or replace function public.grant_admin_to_kloryx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username = 'Kloryx1' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::public.app_role)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger grant_admin_kloryx_trigger
after insert on public.profiles
for each row execute function public.grant_admin_to_kloryx();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_kloryx() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  year smallint NOT NULL CHECK (year BETWEEN 1 AND 6),
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courses"
ON public.courses FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Authenticated can view courses"
ON public.courses FOR SELECT TO authenticated
USING (true);
CREATE TABLE public.user_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_courses TO authenticated;
GRANT ALL ON public.user_courses TO service_role;
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage user_courses"
ON public.user_courses FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users view own enrollments"
ON public.user_courses FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER courses_touch_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'major',
  ADD COLUMN IF NOT EXISTS exam_type text NOT NULL DEFAULT 'MINI-OSCE',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS subjects_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_count_mid integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_count_final integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_category_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_category_check CHECK (category IN ('major','minor'));
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;
CREATE POLICY "Anyone can view published courses"
  ON public.courses FOR SELECT
  TO anon, authenticated
  USING (published = true);
GRANT SELECT ON public.courses TO anon;
DROP POLICY IF EXISTS "Public can view course images" ON storage.objects;
CREATE POLICY "Public can view course images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'course-images');
DROP POLICY IF EXISTS "Admins can upload course images" ON storage.objects;
CREATE POLICY "Admins can upload course images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'course-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update course images" ON storage.objects;
CREATE POLICY "Admins can update course images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'course-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete course images" ON storage.objects;
CREATE POLICY "Admins can delete course images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'course-images' AND public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.subject_groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_groups TO authenticated;
GRANT ALL ON public.subject_groups TO service_role;
ALTER TABLE public.subject_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage subject_groups" ON public.subject_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "View subject_groups if enrolled or admin" ON public.subject_groups FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.user_courses uc WHERE uc.course_id = subject_groups.course_id AND uc.user_id = auth.uid())
  );
CREATE TRIGGER subject_groups_touch BEFORE UPDATE ON public.subject_groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.subjects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.subject_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage subjects" ON public.subjects FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "View subjects if enrolled or admin" ON public.subjects FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.subject_groups sg
      JOIN public.user_courses uc ON uc.course_id = sg.course_id
      WHERE sg.id = subjects.group_id AND uc.user_id = auth.uid()
    )
  );
CREATE TRIGGER subjects_touch BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  stem text not null,
  explanation text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage questions" ON public.questions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "View questions if enrolled or admin" ON public.questions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.subjects s
      JOIN public.subject_groups sg ON sg.id = s.group_id
      JOIN public.user_courses uc ON uc.course_id = sg.course_id
      WHERE s.id = questions.subject_id AND uc.user_id = auth.uid()
    )
  );
CREATE TRIGGER questions_touch BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  text text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;
GRANT ALL ON public.question_options TO service_role;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage question_options" ON public.question_options FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "View question_options if enrolled or admin" ON public.question_options FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.subjects s ON s.id = q.subject_id
      JOIN public.subject_groups sg ON sg.id = s.group_id
      JOIN public.user_courses uc ON uc.course_id = sg.course_id
      WHERE q.id = question_options.question_id AND uc.user_id = auth.uid()
    )
  );
DO $$
DECLARE
  c record;
  g_id uuid;
  s_id uuid;
  q_id uuid;
BEGIN
  FOR c IN SELECT id FROM public.courses WHERE published = true LOOP
    SELECT id INTO g_id FROM public.subject_groups WHERE course_id = c.id AND name = 'GENERAL' LIMIT 1;
    IF g_id IS NULL THEN
      INSERT INTO public.subject_groups (course_id, name, sort_order) VALUES (c.id, 'GENERAL', 0) RETURNING id INTO g_id;
    END IF;
    SELECT id INTO s_id FROM public.subjects WHERE group_id = g_id AND name = 'Cardiopulmonary' LIMIT 1;
    IF s_id IS NULL THEN
      INSERT INTO public.subjects (group_id, name, sort_order) VALUES (g_id, 'Cardiopulmonary', 0) RETURNING id INTO s_id;
    END IF;
    SELECT id INTO q_id FROM public.questions WHERE subject_id = s_id AND stem LIKE 'A 58-year-old man%' LIMIT 1;
    IF q_id IS NULL THEN
      INSERT INTO public.questions (subject_id, stem, explanation, sort_order) VALUES (
        s_id,
        'A 58-year-old man presents to the emergency department with severe crushing chest pain radiating to his left arm, diaphoresis, and nausea for the past 45 minutes. ECG shows ST-segment elevation in leads II, III, and aVF. Which of the following is the most likely diagnosis?',
        'ST-elevation in leads II, III, and aVF is characteristic of an inferior wall myocardial infarction, most commonly caused by occlusion of the right coronary artery.',
        0
      ) RETURNING id INTO q_id;
      INSERT INTO public.question_options (question_id, label, text, is_correct, sort_order) VALUES
        (q_id, 'A', 'Stable angina pectoris', false, 0),
        (q_id, 'B', 'Pulmonary embolism', false, 1),
        (q_id, 'C', 'Inferior wall myocardial infarction', true, 2),
        (q_id, 'D', 'Pericarditis', false, 3),
        (q_id, 'E', 'Aortic dissection', false, 4);
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON public.subject_groups TO anon, authenticated;
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT SELECT ON public.questions TO anon, authenticated;
GRANT SELECT ON public.question_options TO anon, authenticated;
GRANT ALL ON public.subject_groups TO service_role;
GRANT ALL ON public.subjects TO service_role;
GRANT ALL ON public.questions TO service_role;
GRANT ALL ON public.question_options TO service_role;
CREATE POLICY "Anyone can view published subject groups"
ON public.subject_groups
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = subject_groups.course_id
      AND c.published = true
  )
);
CREATE POLICY "Anyone can view published subjects"
ON public.subjects
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.subject_groups sg
    JOIN public.courses c ON c.id = sg.course_id
    WHERE sg.id = subjects.group_id
      AND c.published = true
  )
);
CREATE POLICY "Anyone can view published questions"
ON public.questions
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.subject_groups sg ON sg.id = s.group_id
    JOIN public.courses c ON c.id = sg.course_id
    WHERE s.id = questions.subject_id
      AND c.published = true
  )
);
CREATE POLICY "Anyone can view published question options"
ON public.question_options
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.questions q
    JOIN public.subjects s ON s.id = q.subject_id
    JOIN public.subject_groups sg ON sg.id = s.group_id
    JOIN public.courses c ON c.id = sg.course_id
    WHERE q.id = question_options.question_id
      AND c.published = true
  )
);
CREATE TABLE public.question_flags (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_flags TO authenticated;
GRANT ALL ON public.question_flags TO service_role;
ALTER TABLE public.question_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flags select" ON public.question_flags FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own flags insert" ON public.question_flags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own flags delete" ON public.question_flags FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.question_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_label text,
  is_correct boolean NOT NULL DEFAULT false,
  mode text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_attempts_user_idx ON public.question_attempts(user_id, attempted_at DESC);
GRANT SELECT, INSERT ON public.question_attempts TO authenticated;
GRANT ALL ON public.question_attempts TO service_role;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts select" ON public.question_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own attempts insert" ON public.question_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TABLE public.user_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session select" ON public.user_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own session upsert" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own session update" ON public.user_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_login_events_time_idx ON public.user_login_events(occurred_at DESC);
GRANT SELECT, INSERT ON public.user_login_events TO authenticated;
GRANT ALL ON public.user_login_events TO service_role;
ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logins insert" ON public.user_login_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own logins select" ON public.user_login_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read logins" ON public.user_login_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins read sessions" ON public.user_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.admin_marketing_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'logins_last_month', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '1 month'),
    'logins_last_2_months', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '2 months'),
    'logins_last_3_months', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '3 months'),
    'logins_this_year', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= date_trunc('year', now())),
    'logins_all_time', (SELECT count(*) FROM public.user_login_events),
    'active_now', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= now() - interval '5 minutes'),
    'opened_today', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= date_trunc('day', now()))
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_marketing_stats() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE username = _username LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS paddle_price_id text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';
UPDATE public.courses
SET price = 10, paddle_price_id = 'course_anatomy', currency = 'usd'
WHERE title = 'anatomy';
DROP POLICY IF EXISTS "Users view own enrollments" ON public.user_courses;
CREATE POLICY "Users view own enrollments"
  ON public.user_courses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_courses TO authenticated;
GRANT ALL ON public.user_courses TO service_role;
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id text UNIQUE,
  paddle_transaction_id text,
  user_id uuid,
  course_id uuid,
  amount_cents integer,
  currency text,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  snippet_html text NOT NULL,
  snippet_text text NOT NULL DEFAULT '',
  user_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notes" ON public.notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON public.notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX notes_user_created_idx ON public.notes (user_id, created_at DESC);
CREATE INDEX notes_user_subject_idx ON public.notes (user_id, subject_id);
CREATE TRIGGER notes_touch_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TYPE public.subject_access AS ENUM ('paid','free_logged_in','free_public');
ALTER TABLE public.subjects ADD COLUMN access_level public.subject_access NOT NULL DEFAULT 'paid';
do $$ begin
  create type public.package_type as enum ('individual', 'group');
exception when duplicate_object then null; end $$;
CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'usd',
  package_type public.package_type NOT NULL DEFAULT 'individual',
  group_size integer NOT NULL DEFAULT 1 CHECK (group_size >= 1),
  paddle_price_id text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published packages"
  ON public.packages FOR SELECT
  USING (published = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage packages"
  ON public.packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER touch_packages_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE IF NOT EXISTS public.package_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, course_id)
);
GRANT SELECT ON public.package_courses TO anon, authenticated;
GRANT ALL ON public.package_courses TO service_role;
ALTER TABLE public.package_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view courses of published packages"
  ON public.package_courses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.packages p
      WHERE p.id = package_courses.package_id
      AND (p.published = true OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "Admins manage package_courses"
  ON public.package_courses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE IF NOT EXISTS public.package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_ids uuid[] NOT NULL DEFAULT '{}',
  paddle_transaction_id text UNIQUE,
  paddle_event_id text UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  amount_cents bigint,
  currency text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.package_purchases TO authenticated;
GRANT ALL ON public.package_purchases TO service_role;
ALTER TABLE public.package_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer or member can view own purchase"
  ON public.package_purchases FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = ANY(member_user_ids)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE OR REPLACE FUNCTION public.search_users_for_group(_query text, _exclude uuid)
RETURNS TABLE(id uuid, username text, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.full_name, p.email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> COALESCE(_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      p.username ILIKE _query || '%'
      OR p.email ILIKE _query || '%'
      OR p.full_name ILIKE '%' || _query || '%'
    )
  ORDER BY p.username
  LIMIT 8;
$$;
REVOKE ALL ON FUNCTION public.search_users_for_group(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) TO authenticated;