-- ========================================================
-- AquaQbank Consolidated Database Schema
-- Generated: 2026-09-29T15:42:00.945Z
-- ========================================================


-- MIGRATION: 20260807145528_73d7d61a-9ef0-48bf-bfdf-e4a94e29b57f.sql

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



-- MIGRATION: 20260807145745_ffc062ba-2150-41c9-96ef-58ee653374a2.sql

DROP POLICY IF EXISTS "Authenticated can view courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone can view published question options" ON public.question_options;
DROP POLICY IF EXISTS "Anyone can view published subjects" ON public.subjects;
CREATE POLICY "Authenticated can view subjects of published courses"
ON public.subjects FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.subject_groups sg
  JOIN public.courses c ON c.id = sg.course_id
  WHERE sg.id = subjects.group_id AND c.published = true
));
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM anon, PUBLIC;
CREATE OR REPLACE FUNCTION public.search_users_for_group(_query text, _exclude uuid)
RETURNS TABLE(id uuid, username text, full_name text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.email
  FROM public.profiles p
  WHERE p.id <> COALESCE(_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      p.username ILIKE _query || '%'
      OR p.email ILIKE _query || '%'
      OR p.full_name ILIKE '%' || _query || '%'
    )
  ORDER BY p.username
  LIMIT 8;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) TO authenticated;
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  user_agent text,
  platform text,
  ip text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX user_devices_user_id_idx ON public.user_devices(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users can insert own devices"
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devices"
  ON public.user_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete any device"
  ON public.user_devices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() = user_id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 2;
CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT email FROM public.profiles
  WHERE lower(username) = lower(trim(_username))
  LIMIT 1;
$function$;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'questions';
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_kind_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_kind_check CHECK (kind IN ('questions','lectures'));
CREATE INDEX IF NOT EXISTS courses_kind_idx ON public.courses(kind);
CREATE TABLE IF NOT EXISTS public.user_lecture_courses (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
GRANT SELECT ON public.user_lecture_courses TO authenticated;
GRANT ALL ON public.user_lecture_courses TO service_role;
ALTER TABLE public.user_lecture_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own lecture access" ON public.user_lecture_courses;
CREATE POLICY "Users read own lecture access"
  ON public.user_lecture_courses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins manage lecture access" ON public.user_lecture_courses;
CREATE POLICY "Admins manage lecture access"
  ON public.user_lecture_courses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS intro_video_storage_path text;
CREATE TABLE public.lecture_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lecture_subjects TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.lecture_subjects TO authenticated;
GRANT ALL ON public.lecture_subjects TO service_role;
ALTER TABLE public.lecture_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects readable for published courses"
  ON public.lecture_subjects FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.published = true)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "subjects writable by admin"
  ON public.lecture_subjects FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_lecture_subjects BEFORE UPDATE ON public.lecture_subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.lecture_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.lecture_subjects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lecture','quiz')),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  video_url text,
  video_storage_path text,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lecture_items TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.lecture_items TO authenticated;
GRANT ALL ON public.lecture_items TO service_role;
ALTER TABLE public.lecture_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable when subject is readable"
  ON public.lecture_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_subjects s
      JOIN public.courses c ON c.id = s.course_id
      WHERE s.id = subject_id AND (c.published = true OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "items writable by admin"
  ON public.lecture_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_lecture_items BEFORE UPDATE ON public.lecture_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.lecture_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.lecture_items(id) ON DELETE CASCADE,
  pass_score int NOT NULL DEFAULT 70,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quizzes TO authenticated;
GRANT ALL ON public.lecture_quizzes TO service_role;
ALTER TABLE public.lecture_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes writable by admin"
  ON public.lecture_quizzes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.lecture_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.lecture_quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_questions TO authenticated;
GRANT ALL ON public.lecture_quiz_questions TO service_role;
ALTER TABLE public.lecture_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.lecture_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.lecture_quiz_questions(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  body text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_options TO authenticated;
GRANT ALL ON public.lecture_quiz_options TO service_role;
ALTER TABLE public.lecture_quiz_options ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.lecture_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.lecture_quizzes(id) ON DELETE CASCADE,
  score int NOT NULL,
  total int NOT NULL,
  answers jsonb,
  finished_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_quiz_attempts TO authenticated;
GRANT ALL ON public.lecture_quiz_attempts TO service_role;
ALTER TABLE public.lecture_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own attempts"
  ON public.lecture_quiz_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user inserts own attempts"
  ON public.lecture_quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.user_owns_lecture_course(_course_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_lecture_courses
        WHERE user_id = auth.uid() AND course_id = _course_id
      );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) TO authenticated;
CREATE POLICY "lecture videos readable by owners"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lecture-videos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.lecture_items i
        JOIN public.lecture_subjects s ON s.id = i.subject_id
        JOIN public.user_lecture_courses ulc
          ON ulc.course_id = s.course_id AND ulc.user_id = auth.uid()
        WHERE i.video_storage_path = storage.objects.name
      )
    )
  );
CREATE POLICY "lecture videos writable by admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lecture-videos'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "lecture videos updatable by admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "lecture videos deletable by admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lecture-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.lecture_subjects TO anon;
GRANT SELECT ON public.lecture_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_lecture_courses TO authenticated;
ALTER TABLE public.lecture_items
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS intro_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_quiz_questions
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
CREATE POLICY "quizzes readable when item is free or owned"
  ON public.lecture_quizzes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_items i
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE i.id = lecture_quizzes.item_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "questions readable"
  ON public.lecture_quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_quizzes q
      JOIN public.lecture_items i ON i.id = q.item_id
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE q.id = lecture_quiz_questions.quiz_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "questions writable by admin"
  ON public.lecture_quiz_questions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "options readable"
  ON public.lecture_quiz_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lecture_quiz_questions qq
      JOIN public.lecture_quizzes q ON q.id = qq.quiz_id
      JOIN public.lecture_items i ON i.id = q.item_id
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE qq.id = lecture_quiz_options.question_id
        AND (
          i.is_free
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_lecture_courses ulc
            WHERE ulc.user_id = auth.uid() AND ulc.course_id = c.id
          )
        )
        AND (c.published OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
CREATE POLICY "options writable by admin"
  ON public.lecture_quiz_options FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.admin_grant_lecture_course(_user_id uuid, _course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_lecture_courses (user_id, course_id)
  VALUES (_user_id, _course_id)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_revoke_lecture_course(_user_id uuid, _course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_lecture_courses
  WHERE user_id = _user_id AND course_id = _course_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_list_lecture_course_users(_course_id uuid)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ulc.user_id, p.username, p.full_name, p.email
  FROM public.user_lecture_courses ulc
  JOIN public.profiles p ON p.id = ulc.user_id
  WHERE ulc.course_id = _course_id
  ORDER BY p.username;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) TO authenticated;
CREATE TABLE public.committee_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_number int NOT NULL UNIQUE CHECK (year_number BETWEEN 1 AND 6),
  display_name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'stethoscope',
  color_key text NOT NULL DEFAULT 'indigo',
  shape_key text NOT NULL DEFAULT 'circle',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_years TO authenticated;
GRANT SELECT ON public.committee_years TO anon;
GRANT ALL ON public.committee_years TO service_role;
ALTER TABLE public.committee_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read years" ON public.committee_years FOR SELECT USING (true);
CREATE TABLE public.committee_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.committee_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'book',
  color_key text NOT NULL DEFAULT 'indigo',
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_subjects(year_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_subjects TO authenticated;
GRANT SELECT ON public.committee_subjects TO anon;
GRANT ALL ON public.committee_subjects TO service_role;
ALTER TABLE public.committee_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read subjects" ON public.committee_subjects FOR SELECT USING (true);
CREATE TABLE public.committee_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_categories(subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_categories TO authenticated;
GRANT SELECT ON public.committee_categories TO anon;
GRANT ALL ON public.committee_categories TO service_role;
ALTER TABLE public.committee_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read categories" ON public.committee_categories FOR SELECT USING (true);
CREATE TABLE public.committee_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.committee_categories(id) ON DELETE CASCADE,
  parent_resource_id uuid REFERENCES public.committee_resources(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pdf','link','folder')),
  file_path text,
  url text,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.committee_resources(category_id);
CREATE INDEX ON public.committee_resources(parent_resource_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_resources TO authenticated;
GRANT SELECT ON public.committee_resources TO anon;
GRANT ALL ON public.committee_resources TO service_role;
ALTER TABLE public.committee_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read resources" ON public.committee_resources FOR SELECT USING (true);
CREATE TRIGGER touch_committee_years BEFORE UPDATE ON public.committee_years FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_subjects BEFORE UPDATE ON public.committee_subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_categories BEFORE UPDATE ON public.committee_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_committee_resources BEFORE UPDATE ON public.committee_resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.committee_years (year_number, display_name, icon_key, color_key, shape_key, sort_order) VALUES
  (1, 'Year 1', 'dna',         'mint',    'circle',   1),
  (2, 'Year 2', 'microscope',  'indigo',  'hexagon',  2),
  (3, 'Year 3', 'heart-pulse', 'rose',    'squircle', 3),
  (4, 'Year 4', 'stethoscope', 'amber',   'diamond',  4),
  (5, 'Year 5', 'brain',       'teal',    'ring',     5),
  (6, 'Year 6', 'cross',       'violet',  'shield',   6);
WITH y AS (SELECT id, year_number FROM public.committee_years)
INSERT INTO public.committee_subjects (year_id, name, icon_key, color_key, sort_order)
SELECT y.id, s.name, s.icon_key, s.color_key, s.sort_order
FROM y
JOIN (VALUES
  (1, 'Anatomy',         'bone',         'rose',    1),
  (1, 'Histology',       'microscope',   'indigo',  2),
  (1, 'Biochemistry',    'flask-conical','amber',   3),
  (1, 'Medical Biology', 'dna',          'mint',    4),
  (1, 'Latin',           'book-open',    'teal',    5),
  (2, 'Physiology',      'heart-pulse',  'rose',    1),
  (2, 'Biochemistry II', 'flask-conical','amber',   2),
  (2, 'Anatomy II',      'bone',         'indigo',  3),
  (2, 'Microbiology',    'bug',          'mint',    4),
  (2, 'Histology II',    'microscope',   'violet',  5),
  (3, 'Pathology',       'virus',        'rose',    1),
  (3, 'Pharmacology',    'pill',         'amber',   2),
  (3, 'Propedeutics',    'stethoscope',  'indigo',  3),
  (3, 'Microbiology II', 'bug',          'mint',    4),
  (4, 'Internal Medicine','stethoscope', 'indigo',  1),
  (4, 'Surgery',         'scissors',     'rose',    2),
  (4, 'OB-GYN',          'baby',         'mint',    3),
  (4, 'Pediatrics',      'baby',         'amber',   4),
  (5, 'Cardiology',      'heart-pulse',  'rose',    1),
  (5, 'Neurology',       'brain',        'violet',  2),
  (5, 'Psychiatry',      'brain',        'teal',    3),
  (5, 'Dermatology',     'sparkles',     'amber',   4),
  (6, 'State Exam Prep', 'graduation-cap','violet', 1),
  (6, 'Clinical Cases',  'clipboard-list','indigo', 2)
) AS s(year_number, name, icon_key, color_key, sort_order)
ON y.year_number = s.year_number;
CREATE POLICY "committee public read" ON storage.objects FOR SELECT
  USING (bucket_id IN ('committee-images','committee-files'));
ALTER TABLE public.committee_categories
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'resources';
ALTER TABLE public.committee_categories
  DROP CONSTRAINT IF EXISTS committee_categories_section_check;
ALTER TABLE public.committee_categories
  ADD CONSTRAINT committee_categories_section_check CHECK (section IN ('resources','books'));
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'committee';



-- MIGRATION: 20260807150017_6ac762b7-b996-4412-b24c-02589c925f84.sql

CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT DO NOTHING;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_list_role_members(_role public.app_role)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, p.username, p.full_name, p.email
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = _role
  ORDER BY p.username;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_user_roles(_user_id uuid)
RETURNS TABLE(role public.app_role)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = _user_id;
END; $$;
CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role);
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_committee(uuid) TO authenticated;
CREATE POLICY "committee manage years" ON public.committee_years
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage subjects" ON public.committee_subjects
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage categories" ON public.committee_categories
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage resources" ON public.committee_resources
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE POLICY "committee manage write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE POLICY "committee manage update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE POLICY "committee manage delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images','committee-files'])
    AND public.can_manage_committee(auth.uid())
  );
CREATE OR REPLACE FUNCTION public.admin_grant_committee_role(_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _uid FROM public.profiles WHERE lower(username) = lower(trim(_username)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'committee'::public.app_role)
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_revoke_committee_role(_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _uid FROM public.profiles WHERE lower(username) = lower(trim(_username)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _uid AND role = 'committee'::public.app_role;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_list_committee_members()
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, p.username, p.full_name, p.email
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'committee'::public.app_role
  ORDER BY p.username;
END;
$$;
CREATE TABLE public.german_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_path text,
  published boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_courses TO authenticated;
GRANT ALL ON public.german_courses TO service_role;
ALTER TABLE public.german_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_courses read auth" ON public.german_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_courses admin write" ON public.german_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.german_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_subjects TO authenticated;
GRANT ALL ON public.german_subjects TO service_role;
ALTER TABLE public.german_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_subjects read auth" ON public.german_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_subjects admin write" ON public.german_subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.german_subjects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lecture','quiz','words','sentences')),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  video_url text,
  video_storage_path text,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_items TO authenticated;
GRANT ALL ON public.german_items TO service_role;
ALTER TABLE public.german_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_items read auth" ON public.german_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_items admin write" ON public.german_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.german_items(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quizzes TO authenticated;
GRANT ALL ON public.german_quizzes TO service_role;
ALTER TABLE public.german_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_quizzes read auth" ON public.german_quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_quizzes admin write" ON public.german_quizzes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.german_quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  explanation text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quiz_questions TO authenticated;
GRANT ALL ON public.german_quiz_questions TO service_role;
ALTER TABLE public.german_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_qq read auth" ON public.german_quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_qq admin write" ON public.german_quiz_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.german_quiz_questions(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  body text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_quiz_options TO authenticated;
GRANT ALL ON public.german_quiz_options TO service_role;
ALTER TABLE public.german_quiz_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_qo read auth" ON public.german_quiz_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_qo admin write" ON public.german_quiz_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_word_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  german text NOT NULL,
  english text NOT NULL,
  example text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_word_entries TO authenticated;
GRANT ALL ON public.german_word_entries TO service_role;
ALTER TABLE public.german_word_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_words read auth" ON public.german_word_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_words admin write" ON public.german_word_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TABLE public.german_sentence_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  german text NOT NULL,
  english text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_sentence_entries TO authenticated;
GRANT ALL ON public.german_sentence_entries TO service_role;
ALTER TABLE public.german_sentence_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_sent read auth" ON public.german_sentence_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "german_sent admin write" ON public.german_sentence_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER german_courses_touch BEFORE UPDATE ON public.german_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.german_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.german_items(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL,
  is_correct BOOLEAN NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('study','session','exam','game')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX german_attempts_user_idx ON public.german_attempts (user_id, item_id);
GRANT SELECT, INSERT ON public.german_attempts TO authenticated;
GRANT ALL ON public.german_attempts TO service_role;
ALTER TABLE public.german_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts read" ON public.german_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "own attempts insert" ON public.german_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.german_subjects
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'mixed'
    CHECK (content_type IN ('words', 'sentences', 'mixed'));
CREATE TABLE IF NOT EXISTS public.german_voice_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.german_subjects(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.german_items(id) ON DELETE CASCADE,
  entry_id uuid,
  target_text text NOT NULL,
  transcript text,
  score numeric,
  mode text NOT NULL DEFAULT 'voice',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_voice_attempts TO authenticated;
GRANT ALL ON public.german_voice_attempts TO service_role;
ALTER TABLE public.german_voice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own voice attempts"
  ON public.german_voice_attempts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS german_voice_attempts_user_idx
  ON public.german_voice_attempts (user_id, created_at DESC);
ALTER TABLE public.german_courses
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'mixed'
    CHECK (content_type IN ('words', 'sentences', 'mixed'));
ALTER TABLE public.german_subjects ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES public.german_subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS german_subjects_parent_id_idx ON public.german_subjects(parent_id);
CREATE OR REPLACE FUNCTION public.identity_taken(_username text, _phone text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'username', EXISTS (
      SELECT 1 FROM public.profiles
      WHERE _username IS NOT NULL AND lower(username) = lower(trim(_username))
    ),
    'phone', EXISTS (
      SELECT 1 FROM public.profiles
      WHERE _phone IS NOT NULL AND _phone <> '' AND phone = trim(_phone)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.identity_taken(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
CREATE TABLE public.admin_ai_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_keys TO authenticated;
GRANT ALL ON public.admin_ai_keys TO service_role;
ALTER TABLE public.admin_ai_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai keys"
ON public.admin_ai_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  site_name text NOT NULL DEFAULT 'YSMU Vault',
  tagline text NOT NULL DEFAULT 'Yerevan State Medical University Question Bank',
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read site settings"
  ON public.site_settings FOR SELECT
  USING (true);
CREATE POLICY "admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins can insert site settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
INSERT INTO public.site_settings (id, site_name, tagline)
VALUES (true, 'YSMU Vault', 'Yerevan State Medical University Question Bank')
ON CONFLICT (id) DO NOTHING;
CREATE TABLE public.summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  author_name text,
  source_type text NOT NULL CHECK (source_type IN ('subject','text','photos','questions')),
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_scheme text NOT NULL DEFAULT 'aurora',
  length_preset text NOT NULL DEFAULT 'standard',
  tone text NOT NULL DEFAULT 'exam',
  is_public boolean NOT NULL DEFAULT false,
  share_slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_summaries_user ON public.summaries(user_id, created_at DESC);
CREATE INDEX idx_summaries_share ON public.summaries(share_slug) WHERE share_slug IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.summaries TO authenticated;
GRANT SELECT ON public.summaries TO anon;
GRANT ALL ON public.summaries TO service_role;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read their own summaries"
  ON public.summaries FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "anyone reads public summaries"
  ON public.summaries FOR SELECT
  USING (is_public = true);
CREATE POLICY "admins read all summaries"
  ON public.summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "users insert their own summaries"
  ON public.summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update their own summaries"
  ON public.summaries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete their own summaries"
  ON public.summaries FOR DELETE
  USING (auth.uid() = user_id);
CREATE TRIGGER trg_summaries_touch
  BEFORE UPDATE ON public.summaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_site_settings_touch
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.german_courses DROP CONSTRAINT IF EXISTS german_courses_content_type_check;
ALTER TABLE public.german_courses ADD CONSTRAINT german_courses_content_type_check
  CHECK (content_type = ANY (ARRAY['words'::text, 'sentences'::text, 'mixed'::text, 'shadowing'::text]));
CREATE TABLE public.german_shadowing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.german_courses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('words','sentences')),
  subject_ids uuid[] NOT NULL DEFAULT '{}',
  total_items integer NOT NULL DEFAULT 0,
  score_avg numeric(5,2) NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_shadowing_sessions TO authenticated;
GRANT ALL ON public.german_shadowing_sessions TO service_role;
ALTER TABLE public.german_shadowing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadowing own read" ON public.german_shadowing_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "shadowing own insert" ON public.german_shadowing_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shadowing own delete" ON public.german_shadowing_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX german_shadowing_sessions_user_idx ON public.german_shadowing_sessions(user_id, created_at DESC);
CREATE INDEX german_shadowing_sessions_course_idx ON public.german_shadowing_sessions(course_id);
CREATE POLICY "Anon can view subjects of published courses"
  ON public.subjects FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.subject_groups sg
      JOIN public.courses c ON c.id = sg.course_id
      WHERE sg.id = subjects.group_id AND c.published = true
    )
  );
GRANT SELECT ON public.subjects TO anon;
CREATE OR REPLACE FUNCTION public.get_subject_question_counts(_subject_ids uuid[])
RETURNS TABLE(subject_id uuid, cnt bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.subject_id, count(*)::bigint
  FROM public.questions q
  WHERE q.subject_id = ANY(_subject_ids)
  GROUP BY q.subject_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;
ALTER TABLE public.committee_years DROP CONSTRAINT IF EXISTS committee_years_year_number_check;
ALTER TABLE public.committee_years ADD CONSTRAINT committee_years_year_number_check CHECK (year_number BETWEEN 0 AND 7);
CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.universities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities TO authenticated;
GRANT ALL ON public.universities TO service_role;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER universities_touch BEFORE UPDATE ON public.universities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.universities_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  background_color text NOT NULL DEFAULT '#0B3B3C',
  scroll_speed_seconds int NOT NULL DEFAULT 30,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.universities_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities_settings TO authenticated;
GRANT ALL ON public.universities_settings TO service_role;
ALTER TABLE public.universities_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads slider settings" ON public.universities_settings FOR SELECT USING (true);
CREATE POLICY "admins manage slider settings" ON public.universities_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER universities_settings_touch BEFORE UPDATE ON public.universities_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.universities_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE POLICY "public read university-logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'university-logos');
CREATE POLICY "admins write university-logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update university-logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins delete university-logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'university-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.universities ADD COLUMN storage_path text;
ALTER TABLE public.summaries DROP CONSTRAINT IF EXISTS summaries_source_type_check;
ALTER TABLE public.summaries ADD CONSTRAINT summaries_source_type_check
  CHECK (source_type IN ('subject','text','photos','pdf','questions'));
CREATE OR REPLACE FUNCTION public.get_course_real_counts(_course_ids uuid[])
RETURNS TABLE(course_id uuid, subjects_count bigint, questions_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sg.course_id,
    count(DISTINCT s.id)::bigint AS subjects_count,
    count(q.id)::bigint AS questions_count
  FROM public.subject_groups sg
  LEFT JOIN public.subjects s ON s.group_id = sg.id
  LEFT JOIN public.questions q ON q.subject_id = s.id
  WHERE sg.course_id = ANY(_course_ids)
  GROUP BY sg.course_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated, service_role;
CREATE TABLE public.german_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('words','sentences')),
  german text NOT NULL,
  english text NOT NULL,
  course_id uuid REFERENCES public.german_courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.german_flags TO authenticated;
GRANT ALL ON public.german_flags TO service_role;
ALTER TABLE public.german_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "german_flags own read" ON public.german_flags FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "german_flags own insert" ON public.german_flags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "german_flags own delete" ON public.german_flags FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX german_flags_user_idx ON public.german_flags(user_id, created_at DESC);
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
INSERT INTO public.universities (name, slug, short_name, description, city, country, is_visible, is_active, sort_order, logo_url, storage_path)
SELECT 'Yerevan State Medical University', 'ysmu', 'YSMU',
       'The flagship medical university — original content collection.',
       'Yerevan', 'Armenia', true, true, 0, '', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.universities WHERE lower(name) LIKE 'yerevan%' OR slug = 'ysmu');
UPDATE public.universities
SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug IS NULL OR slug = '';
ALTER TABLE public.universities
  ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS universities_slug_unique ON public.universities (slug);
ALTER TABLE public.courses        ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
ALTER TABLE public.lecture_subjects ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
ALTER TABLE public.committee_years ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE RESTRICT;
DO $$
DECLARE ysmu_id uuid;
BEGIN
  SELECT id INTO ysmu_id FROM public.universities WHERE slug = 'ysmu' LIMIT 1;
  IF ysmu_id IS NULL THEN
    SELECT id INTO ysmu_id FROM public.universities ORDER BY sort_order LIMIT 1;
  END IF;
  IF ysmu_id IS NOT NULL THEN
    UPDATE public.courses          SET university_id = ysmu_id WHERE university_id IS NULL;
    UPDATE public.lecture_subjects SET university_id = ysmu_id WHERE university_id IS NULL;
    UPDATE public.committee_years  SET university_id = ysmu_id WHERE university_id IS NULL;
  END IF;
END $$;
ALTER TABLE public.courses          ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.lecture_subjects ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.committee_years  ALTER COLUMN university_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS courses_university_idx          ON public.courses(university_id);
CREATE INDEX IF NOT EXISTS lecture_subjects_university_idx ON public.lecture_subjects(university_id);
CREATE INDEX IF NOT EXISTS committee_years_university_idx  ON public.committee_years(university_id);
CREATE POLICY "Authenticated read active universities"
  ON public.universities FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Anon read active universities"
  ON public.universities FOR SELECT
  TO anon
  USING (is_active = true);
CREATE POLICY "Admins manage universities"
  ON public.universities FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.university_id_by_slug(_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.universities WHERE slug = _slug AND is_active = true LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS home_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_badge text,
  ADD COLUMN IF NOT EXISTS home_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_tagline text;
ALTER TABLE public.universities
  DROP CONSTRAINT IF EXISTS universities_home_badge_check;
ALTER TABLE public.universities
  ADD CONSTRAINT universities_home_badge_check
  CHECK (home_badge IS NULL OR home_badge IN ('NEW','POPULAR','COMING_SOON'));
ALTER TABLE public.admin_ai_keys
  ADD COLUMN IF NOT EXISTS slot SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preferred_model TEXT;
ALTER TABLE public.admin_ai_keys
  DROP CONSTRAINT IF EXISTS admin_ai_keys_pkey;
ALTER TABLE public.admin_ai_keys
  ADD CONSTRAINT admin_ai_keys_pkey PRIMARY KEY (provider, slot);
ALTER TABLE public.admin_ai_keys
  DROP CONSTRAINT IF EXISTS admin_ai_keys_slot_range_chk;
ALTER TABLE public.admin_ai_keys
  ADD CONSTRAINT admin_ai_keys_slot_range_chk CHECK (slot BETWEEN 1 AND 5);



-- MIGRATION: 20260807150253_5bb77d6c-2fee-470a-a9c5-68b02d24f7d7.sql

CREATE TABLE public.admin_ai_model_limits (
  model_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rpm INTEGER NOT NULL DEFAULT 5,
  rpd INTEGER NOT NULL DEFAULT 50,
  supports_vision BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  smooth_pacing BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 30,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_model_limits TO authenticated;
GRANT ALL ON public.admin_ai_model_limits TO service_role;
ALTER TABLE public.admin_ai_model_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ai model limits"
ON public.admin_ai_model_limits
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_admin_ai_model_limits_updated_at
BEFORE UPDATE ON public.admin_ai_model_limits
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.admin_ai_model_limits
  ADD COLUMN IF NOT EXISTS max_concurrent integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_model_id text,
  ADD COLUMN IF NOT EXISTS use_json_mime boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
INSERT INTO public.admin_ai_model_limits
  (model_id, label, rpm, rpd, supports_vision, enabled, smooth_pacing, cooldown_seconds, sort_order, max_concurrent, api_model_id, use_json_mime)
VALUES
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 15, 1000, true, true, false, 30, 10, 4, 'gemini-2.5-flash-lite', true)
ON CONFLICT (model_id) DO NOTHING;
CREATE TABLE public.mentor_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dua','stoic')),
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_categories TO authenticated;
GRANT ALL ON public.mentor_categories TO service_role;
ALTER TABLE public.mentor_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_categories owner admin all"
ON public.mentor_categories FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_categories_updated BEFORE UPDATE ON public.mentor_categories
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_categories_user_kind ON public.mentor_categories(user_id, kind, sort_order);
CREATE TABLE public.mentor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.mentor_categories(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_entries TO authenticated;
GRANT ALL ON public.mentor_entries TO service_role;
ALTER TABLE public.mentor_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_entries owner admin all"
ON public.mentor_entries FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_entries_updated BEFORE UPDATE ON public.mentor_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_entries_cat ON public.mentor_entries(category_id, sort_order);
CREATE TABLE public.mentor_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('religious','stoic')),
  title text NOT NULL,
  is_daily boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_tasks TO authenticated;
GRANT ALL ON public.mentor_tasks TO service_role;
ALTER TABLE public.mentor_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_tasks owner admin all"
ON public.mentor_tasks FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_mentor_tasks_updated BEFORE UPDATE ON public.mentor_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_tasks_user_kind ON public.mentor_tasks(user_id, kind, sort_order);
CREATE TABLE public.mentor_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.mentor_tasks(id) ON DELETE CASCADE,
  completed_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, completed_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_task_completions TO authenticated;
GRANT ALL ON public.mentor_task_completions TO service_role;
ALTER TABLE public.mentor_task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_task_completions owner admin all"
ON public.mentor_task_completions FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX idx_mentor_completions_task_date ON public.mentor_task_completions(task_id, completed_on);
CREATE TABLE public.mentor_treasures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dua','stoic')),
  title text,
  body text NOT NULL,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  is_pinned_today boolean NOT NULL DEFAULT false,
  pinned_on date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_treasures TO authenticated;
GRANT ALL ON public.mentor_treasures TO service_role;
ALTER TABLE public.mentor_treasures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_treasures owner admin all"
ON public.mentor_treasures FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_mentor_treasures_updated BEFORE UPDATE ON public.mentor_treasures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_treasures_user_kind ON public.mentor_treasures(user_id, kind);
CREATE TABLE public.mentor_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  intention text,
  did_well text,
  fell_short text,
  tomorrow text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_journal TO authenticated;
GRANT ALL ON public.mentor_journal TO service_role;
ALTER TABLE public.mentor_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_journal owner admin all"
ON public.mentor_journal FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_mentor_journal_updated BEFORE UPDATE ON public.mentor_journal
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_mentor_journal_user_date ON public.mentor_journal(user_id, entry_date DESC);
CREATE OR REPLACE FUNCTION public.grant_admin_to_klory_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = lower('Klory.shaheen3@icloud.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS grant_admin_to_klory_email_trigger ON public.profiles;
CREATE TRIGGER grant_admin_to_klory_email_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_to_klory_email();
CREATE OR REPLACE FUNCTION public.toggle_self_admin(_enable boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS DISTINCT FROM lower('Klory.shaheen3@icloud.com') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _enable THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _uid AND role = 'admin'::public.app_role;
  END IF;
  RETURN _enable;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_self_admin(boolean) TO authenticated;
CREATE TABLE IF NOT EXISTS public.jarvis_batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdf_name TEXT NOT NULL,
  subject_id UUID NULL,
  auto_sort BOOLEAN NOT NULL DEFAULT false,
  batch_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  slice_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_summary JSONB NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_jobs TO service_role;
ALTER TABLE public.jarvis_batch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners and admins can read batch jobs"
ON public.jarvis_batch_jobs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can insert batch jobs"
ON public.jarvis_batch_jobs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can update batch jobs"
ON public.jarvis_batch_jobs FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "owners and admins can delete batch jobs"
ON public.jarvis_batch_jobs FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER jarvis_batch_jobs_touch
BEFORE UPDATE ON public.jarvis_batch_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS jarvis_batch_jobs_user_idx
ON public.jarvis_batch_jobs (user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_jobs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS pending_review jsonb,
  ADD COLUMN IF NOT EXISTS classifier_batch_id text,
  ADD COLUMN IF NOT EXISTS classifier_status text;
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS stem_hash text
  GENERATED ALWAYS AS (md5(lower(regexp_replace(coalesce(stem,''), '\s+', ' ', 'g')))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS questions_subject_stemhash_uniq
  ON public.questions(subject_id, stem_hash);
CREATE TABLE public.jarvis_batch_v2_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages int NOT NULL,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jarvis_batch_v2_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jarvis_batch_v2_jobs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_from int NOT NULL,
  page_to int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  batch_id text,
  results jsonb,
  imported_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_chunks TO service_role;
ALTER TABLE public.jarvis_batch_v2_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_batch_v2_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v2 jobs" ON public.jarvis_batch_v2_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins manage v2 chunks" ON public.jarvis_batch_v2_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_jbv2_jobs BEFORE UPDATE ON public.jarvis_batch_v2_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jbv2_chunks BEFORE UPDATE ON public.jarvis_batch_v2_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX jbv2_chunks_job_idx ON public.jarvis_batch_v2_chunks(job_id, chunk_index);
CREATE INDEX jbv2_jobs_user_idx ON public.jarvis_batch_v2_jobs(user_id, created_at DESC);
ALTER TABLE public.universities ADD COLUMN IF NOT EXISTS lectures_visible boolean NOT NULL DEFAULT false;
CREATE TABLE public.sonic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  provider text NOT NULL DEFAULT 'gemini',
  model text NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  hint text,
  skip_duplicates boolean NOT NULL DEFAULT false,
  auto_retry boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_jobs TO authenticated;
GRANT ALL ON public.sonic_jobs TO service_role;
ALTER TABLE public.sonic_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_jobs admin all" ON public.sonic_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_jobs_touch BEFORE UPDATE ON public.sonic_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.sonic_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.sonic_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_pdfs TO authenticated;
GRANT ALL ON public.sonic_pdfs TO service_role;
ALTER TABLE public.sonic_pdfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_pdfs admin all" ON public.sonic_pdfs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_pdfs_touch BEFORE UPDATE ON public.sonic_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX sonic_pdfs_job_idx ON public.sonic_pdfs(job_id, sort_order);
CREATE TABLE public.sonic_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_id uuid NOT NULL REFERENCES public.sonic_pdfs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  page_from integer NOT NULL,
  page_to integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  results jsonb,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_chunks TO authenticated;
GRANT ALL ON public.sonic_chunks TO service_role;
ALTER TABLE public.sonic_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sonic_chunks admin all" ON public.sonic_chunks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER sonic_chunks_touch BEFORE UPDATE ON public.sonic_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX sonic_chunks_pdf_idx ON public.sonic_chunks(pdf_id, chunk_index);
CREATE TABLE public.jarvis_batch_v2_ipad_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  group_id uuid NOT NULL,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages int NOT NULL,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jarvis_batch_v2_ipad_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jarvis_batch_v2_ipad_jobs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_from int NOT NULL,
  page_to int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_text text,
  question_blocks jsonb,
  batch_id text,
  results jsonb,
  imported_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_chunks TO service_role;
ALTER TABLE public.jarvis_batch_v2_ipad_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_batch_v2_ipad_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v2 ipad jobs" ON public.jarvis_batch_v2_ipad_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins manage v2 ipad chunks" ON public.jarvis_batch_v2_ipad_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_jbv2_ipad_jobs BEFORE UPDATE ON public.jarvis_batch_v2_ipad_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jbv2_ipad_chunks BEFORE UPDATE ON public.jarvis_batch_v2_ipad_chunks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX jbv2_ipad_chunks_job_idx ON public.jarvis_batch_v2_ipad_chunks(job_id, chunk_index);
CREATE INDEX jbv2_ipad_jobs_user_idx ON public.jarvis_batch_v2_ipad_jobs(user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_v2_ipad_jobs
  ADD COLUMN IF NOT EXISTS queue_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS jarvis_batch_v2_ipad_jobs_queue_idx
  ON public.jarvis_batch_v2_ipad_jobs (user_id, queue_order, created_at);
CREATE OR REPLACE FUNCTION public.admin_list_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  full_name text,
  username text,
  device_limit integer,
  created_at timestamptz,
  roles text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.phone, u.phone::text) AS phone,
    COALESCE(p.full_name, (u.raw_user_meta_data->>'full_name'), '') AS full_name,
    COALESCE(p.username, (u.raw_user_meta_data->>'username'), split_part(u.email::text, '@', 1)) AS username,
    COALESCE(p.device_limit, 2) AS device_limit,
    u.created_at,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]) AS roles
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO authenticated;
CREATE TABLE public.jarvis_batch_german_ipad_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  pdf_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sentences',
  status TEXT NOT NULL DEFAULT 'pending',
  total_images INTEGER NOT NULL DEFAULT 0,
  processed_images INTEGER NOT NULL DEFAULT 0,
  imported_pairs INTEGER NOT NULL DEFAULT 0,
  queue_order INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_jobs TO service_role;
ALTER TABLE public.jarvis_batch_german_ipad_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage german ipad jobs" ON public.jarvis_batch_german_ipad_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_german_ipad_jobs_touch
BEFORE UPDATE ON public.jarvis_batch_german_ipad_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.jarvis_batch_german_ipad_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jarvis_batch_german_ipad_jobs(id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL,
  page_number INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  pairs_json JSONB,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_chunks TO service_role;
ALTER TABLE public.jarvis_batch_german_ipad_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage german ipad chunks" ON public.jarvis_batch_german_ipad_chunks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_german_ipad_chunks_touch
BEFORE UPDATE ON public.jarvis_batch_german_ipad_chunks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_german_ipad_chunks_job ON public.jarvis_batch_german_ipad_chunks(job_id, image_index);
CREATE INDEX idx_german_ipad_jobs_user ON public.jarvis_batch_german_ipad_jobs(user_id, created_at DESC);
ALTER TABLE public.jarvis_batch_german_ipad_jobs
  ADD COLUMN IF NOT EXISTS batch_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_status TEXT;
DROP POLICY IF EXISTS "german_courses read auth" ON public.german_courses;
DROP POLICY IF EXISTS "german_items read auth" ON public.german_items;
DROP POLICY IF EXISTS "german_qo read auth" ON public.german_quiz_options;
DROP POLICY IF EXISTS "german_qq read auth" ON public.german_quiz_questions;
DROP POLICY IF EXISTS "german_quizzes read auth" ON public.german_quizzes;
DROP POLICY IF EXISTS "german_sent read auth" ON public.german_sentence_entries;
DROP POLICY IF EXISTS "german_words read auth" ON public.german_word_entries;
CREATE OR REPLACE FUNCTION public.user_owns_any_german_course(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.courses c ON c.id = uc.course_id
    WHERE uc.user_id = _user_id AND c.kind = 'german'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_any_german_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_any_german_course(uuid) TO authenticated;
CREATE POLICY "german_courses read enrolled" ON public.german_courses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_items read enrolled" ON public.german_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_quizzes read enrolled" ON public.german_quizzes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_qq read enrolled" ON public.german_quiz_questions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_qo read enrolled" ON public.german_quiz_options
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_sent read enrolled" ON public.german_sentence_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
CREATE POLICY "german_words read enrolled" ON public.german_word_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_owns_any_german_course(auth.uid()));
REVOKE EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_committee_role(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_users() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_committee_members() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_self_admin(boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_kloryx() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_klory_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_committee_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_committee_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marketing_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_self_admin(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) TO authenticated;



-- MIGRATION: 20260807150524_521d7cb5-1115-4d5b-97b5-b04ff353d234.sql

CREATE TYPE public.coupon_discount_type AS ENUM ('percent', 'fixed');
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type public.coupon_discount_type NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 100,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coupons_code_ci ON public.coupons (lower(code));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupons"
  ON public.coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER coupons_touch_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.coupon_courses (
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  PRIMARY KEY (coupon_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_courses TO authenticated;
GRANT ALL ON public.coupon_courses TO service_role;
ALTER TABLE public.coupon_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coupon_courses"
  ON public.coupon_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE public.coupon_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  amount_before NUMERIC(10, 2),
  amount_after NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own redemptions"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users record own redemptions"
  ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage redemptions"
  ON public.coupon_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.validate_coupon(_code TEXT, _course_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.coupons;
  _price numeric;
  _final numeric;
  _applies boolean;
  _already boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'sign_in_required');
  END IF;
  SELECT * INTO _c FROM public.coupons WHERE lower(code) = lower(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF NOT _c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;
  IF _c.starts_at IS NOT NULL AND _c.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_yet_active');
  END IF;
  IF _c.expires_at IS NOT NULL AND _c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  IF _c.max_uses IS NOT NULL AND _c.used_count >= _c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used_up');
  END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_courses WHERE coupon_id = _c.id) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.coupon_courses
      WHERE coupon_id = _c.id AND course_id = _course_id
    ) INTO _applies;
    IF NOT _applies THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'course_excluded');
    END IF;
  END IF;
  SELECT price INTO _price FROM public.courses WHERE id = _course_id LIMIT 1;
  IF _price IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'course_not_found');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coupon_redemptions
    WHERE coupon_id = _c.id AND user_id = _uid AND course_id = _course_id
  ) INTO _already;
  IF _already THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_redeemed');
  END IF;
  IF _c.discount_type = 'percent' THEN
    _final := GREATEST(0, _price - (_price * _c.discount_value / 100.0));
  ELSE
    _final := GREATEST(0, _price - _c.discount_value);
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', _c.id,
    'code', _c.code,
    'discount_type', _c.discount_type,
    'discount_value', _c.discount_value,
    'price_before', _price,
    'price_after', _final
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_coupon(_code TEXT, _course_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _v jsonb;
  _cid uuid;
  _final numeric;
  _before numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'sign_in_required'; END IF;
  _v := public.validate_coupon(_code, _course_id);
  IF NOT (_v->>'valid')::boolean THEN
    RETURN _v;
  END IF;
  _cid := (_v->>'coupon_id')::uuid;
  _final := (_v->>'price_after')::numeric;
  _before := (_v->>'price_before')::numeric;
  INSERT INTO public.coupon_redemptions (coupon_id, user_id, course_id, amount_before, amount_after)
  VALUES (_cid, _uid, _course_id, _before, _final)
  ON CONFLICT (coupon_id, user_id, course_id) DO NOTHING;
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _cid;
  IF _final <= 0 THEN
    INSERT INTO public.user_courses (user_id, course_id)
    VALUES (_uid, _course_id)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN jsonb_set(_v, '{redeemed}', 'true'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_coupon(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_coupon(TEXT, UUID) TO authenticated;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.question_options ALTER COLUMN text DROP NOT NULL;
CREATE POLICY "question images insert by admins"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images update by admins"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images delete by admins"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "question images readable by entitled users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'question-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.questions q
      JOIN public.subjects s ON s.id = q.subject_id
      JOIN public.subject_groups sg ON sg.id = s.group_id
      WHERE q.image_url = storage.objects.name
        AND (
          s.access_level IN ('free_public'::public.subject_access, 'free_logged_in'::public.subject_access)
          OR EXISTS (
            SELECT 1 FROM public.user_courses uc
            WHERE uc.user_id = auth.uid() AND uc.course_id = sg.course_id
          )
        )
    )
  )
);
CREATE TABLE public.site_content (
  key text PRIMARY KEY,
  group_key text NOT NULL,
  group_label text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  value_en text NOT NULL DEFAULT '',
  value_ar text NOT NULL DEFAULT '',
  default_en text NOT NULL DEFAULT '',
  default_ar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_content public read"
  ON public.site_content FOR SELECT
  USING (true);
CREATE POLICY "site_content admin write"
  ON public.site_content FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_content_touch_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX site_content_group_idx ON public.site_content (group_key, sort_order);
CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  seo_description_en text NOT NULL DEFAULT '',
  seo_description_ar text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published pages are public" ON public.site_pages FOR SELECT USING (published OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage pages" ON public.site_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_pages_touch BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.site_sections(id) ON DELETE CASCADE,
  builtin_key text,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  layout text NOT NULL DEFAULT 'stack',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_sections_page_idx ON public.site_sections(page_id, sort_order);
GRANT SELECT ON public.site_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_sections TO authenticated;
GRANT ALL ON public.site_sections TO service_role;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sections of published pages are public" ON public.site_sections FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (visible AND EXISTS (SELECT 1 FROM public.site_pages p WHERE p.id = page_id AND p.published))
);
CREATE POLICY "Admins manage sections" ON public.site_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_sections_touch BEFORE UPDATE ON public.site_sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.site_sections(id) ON DELETE CASCADE,
  kind text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_blocks_section_idx ON public.site_blocks(section_id, sort_order);
GRANT SELECT ON public.site_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_blocks TO authenticated;
GRANT ALL ON public.site_blocks TO service_role;
ALTER TABLE public.site_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Blocks of published pages are public" ON public.site_blocks FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (visible AND EXISTS (
    SELECT 1 FROM public.site_sections s JOIN public.site_pages p ON p.id = s.page_id
    WHERE s.id = section_id AND s.visible AND p.published
  ))
);
CREATE POLICY "Admins manage blocks" ON public.site_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_blocks_touch BEFORE UPDATE ON public.site_blocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.site_nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement text NOT NULL DEFAULT 'header',
  label_en text NOT NULL DEFAULT '',
  label_ar text NOT NULL DEFAULT '',
  target_kind text NOT NULL DEFAULT 'route',
  target_value text NOT NULL DEFAULT '/',
  style text NOT NULL DEFAULT 'link',
  visibility text NOT NULL DEFAULT 'all',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_nav_items_placement_idx ON public.site_nav_items(placement, sort_order);
GRANT SELECT ON public.site_nav_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_nav_items TO authenticated;
GRANT ALL ON public.site_nav_items TO service_role;
ALTER TABLE public.site_nav_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nav items are public" ON public.site_nav_items FOR SELECT USING (true);
CREATE POLICY "Admins manage nav items" ON public.site_nav_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_nav_items_touch BEFORE UPDATE ON public.site_nav_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.site_pages (slug, title_en, title_ar, published, is_system, sort_order)
VALUES ('home', 'Home', 'الرئيسية', true, true, 0);
INSERT INTO public.site_sections (page_id, builtin_key, title_en, sort_order)
SELECT p.id, k.key, k.label, k.ord
FROM public.site_pages p,
  (VALUES ('hero','Hero',0),('feature1','Feature row 1',1),('courses','Courses strip',2),
          ('packages','Packages strip',3),('feature2','Feature row 2',4),
          ('universities','Universities strip',5),('footer_cta','Footer call to action',6)) AS k(key,label,ord)
WHERE p.slug = 'home';
CREATE POLICY "site-media readable" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'site-media');
CREATE POLICY "site-media admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site-media admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site-media admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default';
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_to_kloryx() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_to_klory_email() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
CREATE TABLE public.university_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'custom',
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  subtitle_en text NOT NULL DEFAULT '',
  subtitle_ar text NOT NULL DEFAULT '',
  badge_en text NOT NULL DEFAULT '',
  badge_ar text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'Sparkles',
  href text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  highlighted boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT university_tiles_kind_check CHECK (kind IN ('courses','lectures','resources','custom'))
);
CREATE INDEX university_tiles_university_idx ON public.university_tiles (university_id, sort_order);
GRANT SELECT ON public.university_tiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.university_tiles TO authenticated;
GRANT ALL ON public.university_tiles TO service_role;
ALTER TABLE public.university_tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view university tiles"
  ON public.university_tiles FOR SELECT
  USING (true);
CREATE POLICY "Admins manage university tiles"
  ON public.university_tiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER university_tiles_touch_updated_at
  BEFORE UPDATE ON public.university_tiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'courses', 'Courses', 'الكورسات',
       'Question banks · Year-by-year syllabus', 'بنوك الأسئلة · منهج سنة بسنة',
       'BookOpen', '/courses', true, true, 0
FROM public.universities u;
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'lectures', 'Lectures', 'المحاضرات',
       'Video lectures with quizzes', 'محاضرات مصوّرة مع اختبارات',
       'Video', '/lectures', COALESCE(u.lectures_visible, false), false, 1
FROM public.universities u;
INSERT INTO public.university_tiles
  (university_id, kind, title_en, title_ar, subtitle_en, subtitle_ar, icon, href, visible, highlighted, sort_order)
SELECT u.id, 'resources', 'Resources', 'المصادر',
       'Free books, past papers & study material', 'كتب مجانية وأوراق سابقة ومواد دراسية',
       'Library', '/committee', true, true, 2
FROM public.universities u;
CREATE TABLE public.committee_semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.committee_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  number integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.committee_semesters TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_semesters TO authenticated;
GRANT ALL ON public.committee_semesters TO service_role;
ALTER TABLE public.committee_semesters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read semesters" ON public.committee_semesters
FOR SELECT USING (true);
CREATE POLICY "committee manage semesters" ON public.committee_semesters
TO authenticated
USING (public.can_manage_committee(auth.uid()))
WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE INDEX committee_semesters_year_idx ON public.committee_semesters(year_id);
CREATE TRIGGER touch_committee_semesters BEFORE UPDATE ON public.committee_semesters
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.committee_subjects
  ADD COLUMN semester_id uuid REFERENCES public.committee_semesters(id) ON DELETE CASCADE;
CREATE INDEX committee_subjects_semester_idx ON public.committee_subjects(semester_id);
INSERT INTO public.committee_semesters (year_id, name, number, sort_order)
SELECT y.id, 'Semester ' || n, n, n
FROM public.committee_years y
CROSS JOIN generate_series(1, 2) AS n
WHERE y.year_number BETWEEN 1 AND 6;
UPDATE public.committee_subjects s
SET semester_id = sem.id
FROM public.committee_semesters sem
JOIN public.committee_years y ON y.id = sem.year_id
WHERE sem.year_id = s.year_id
  AND sem.number = 1
  AND y.year_number BETWEEN 1 AND 6
  AND s.semester_id IS NULL;
INSERT INTO public.profiles (id, full_name, username, email, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  COALESCE(NULLIF(u.raw_user_meta_data->>'username',''), split_part(u.email::text,'@',1), u.id::text),
  COALESCE(u.email::text, ''),
  NULLIF(COALESCE(u.raw_user_meta_data->>'phone', u.phone::text), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
CREATE OR REPLACE FUNCTION public.search_users_for_group(_query text, _exclude uuid)
 RETURNS TABLE(id uuid, username text, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)) AS username,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') AS full_name,
    COALESCE(p.email, u.email::text) AS email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id <> COALESCE(_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      COALESCE(p.username, u.raw_user_meta_data->>'username', '') ILIKE '%' || _query || '%'
      OR COALESCE(p.email, u.email::text, '') ILIKE '%' || _query || '%'
      OR COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') ILIKE '%' || _query || '%'
    )
  ORDER BY 2
  LIMIT 20;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_list_role_members(_role app_role)
 RETURNS TABLE(user_id uuid, username text, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    ur.user_id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)) AS username,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') AS full_name,
    COALESCE(p.email, u.email::text) AS email
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = _role
  ORDER BY 2;
END;
$function$;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reason text;
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS nickname text;
CREATE TABLE IF NOT EXISTS public.device_security_settings (
  id boolean NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  unlock_code text NOT NULL DEFAULT 'Shadyx1234@',
  telegram_url text NOT NULL DEFAULT 'https://t.me/',
  support_url text NOT NULL DEFAULT '',
  default_device_limit integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.device_security_settings TO authenticated;
GRANT ALL ON public.device_security_settings TO service_role;
ALTER TABLE public.device_security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read device security settings" ON public.device_security_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins insert device security settings" ON public.device_security_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update device security settings" ON public.device_security_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_device_security_settings_touch
  BEFORE UPDATE ON public.device_security_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.device_security_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.device_unlock_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  success boolean NOT NULL DEFAULT false,
  code_used text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_unlock_attempts_user ON public.device_unlock_attempts(user_id, created_at DESC);
GRANT SELECT ON public.device_unlock_attempts TO authenticated;
GRANT ALL ON public.device_unlock_attempts TO service_role;
ALTER TABLE public.device_unlock_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read unlock attempts" ON public.device_unlock_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS show_signature boolean NOT NULL DEFAULT true;
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS protect_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_watermark_opacity numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS protect_blur_on_blur boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_block_print boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_block_copy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_consent_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_devtools_guard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protect_auto_lock_threshold integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS protect_terms_en text,
  ADD COLUMN IF NOT EXISTS protect_terms_ar text;
CREATE TABLE IF NOT EXISTS public.content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  context text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  ua text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_events_user_idx ON public.content_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_events_created_idx ON public.content_events (created_at DESC);
GRANT SELECT ON public.content_events TO authenticated;
GRANT ALL ON public.content_events TO service_role;
ALTER TABLE public.content_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all content events"
  ON public.content_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TABLE IF NOT EXISTS public.content_consents (
  user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  ua text,
  PRIMARY KEY (user_id, scope)
);
GRANT SELECT ON public.content_consents TO authenticated;
GRANT ALL ON public.content_consents TO service_role;
ALTER TABLE public.content_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own consents"
  ON public.content_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins read all consents"
  ON public.content_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));



-- MIGRATION: 20260808142226_4d14a66b-64b5-48eb-8349-e5ee2e645365.sql

CREATE TABLE public.site_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  href text,
  href_label text,
  style text NOT NULL DEFAULT 'ribbon',
  accent text NOT NULL DEFAULT '#e11d48',
  urgent boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_announcements TO anon;
GRANT SELECT ON public.site_announcements TO authenticated;
GRANT ALL ON public.site_announcements TO service_role;
ALTER TABLE public.site_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view announcements" ON public.site_announcements FOR SELECT USING (true);
CREATE POLICY "Admins manage announcements" ON public.site_announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER site_announcements_touch BEFORE UPDATE ON public.site_announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS badge_color text,
  ADD COLUMN IF NOT EXISTS badge_expires_at timestamptz;

ALTER TABLE public.committee_resources ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT true;

CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no bigint GENERATED BY DEFAULT AS IDENTITY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL DEFAULT '',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.support_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send a support request"
  ON public.support_requests FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(message) BETWEEN 1 AND 4000
    AND length(subject) <= 200
    AND length(name) <= 120
    AND length(email) <= 200
    AND length(category) <= 40
    AND admin_notes = ''
    AND status = 'new'
    AND (user_id IS NULL OR user_id = auth.uid())
  );
CREATE POLICY "Admins can read support requests" ON public.support_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update support requests" ON public.support_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete support requests" ON public.support_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER support_requests_touch BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX support_requests_created_idx ON public.support_requests (created_at DESC);

CREATE TABLE public.support_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'link',
  icon text NOT NULL DEFAULT 'link',
  label_en text NOT NULL DEFAULT '',
  label_ar text NOT NULL DEFAULT '',
  value text NOT NULL DEFAULT '',
  href text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_channels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.support_channels TO authenticated;
GRANT ALL ON public.support_channels TO service_role;
ALTER TABLE public.support_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view support channels" ON public.support_channels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage support channels" ON public.support_channels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER support_channels_touch BEFORE UPDATE ON public.support_channels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  page_enabled boolean NOT NULL DEFAULT true,
  form_enabled boolean NOT NULL DEFAULT true,
  channels_enabled boolean NOT NULL DEFAULT true,
  intro_title_en text NOT NULL DEFAULT 'Need a hand?',
  intro_title_ar text NOT NULL DEFAULT 'تحتاج مساعدة؟',
  intro_text_en text NOT NULL DEFAULT 'Tell us what is going on and our team will get back to you.',
  intro_text_ar text NOT NULL DEFAULT 'أخبرنا بما يحدث وسيتواصل معك فريقنا.',
  response_note_en text NOT NULL DEFAULT 'We usually reply within 24 hours.',
  response_note_ar text NOT NULL DEFAULT 'نرد عادة خلال 24 ساعة.',
  categories jsonb NOT NULL DEFAULT '[{"key":"payment","en":"Payment","ar":"الدفع"},{"key":"access","en":"Course access","ar":"الوصول للدورات"},{"key":"technical","en":"Technical","ar":"مشكلة تقنية"},{"key":"other","en":"Other","ar":"أخرى"}]'::jsonb,
  notify_enabled boolean NOT NULL DEFAULT false,
  notify_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.support_settings TO authenticated;
GRANT ALL ON public.support_settings TO service_role;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view support settings" ON public.support_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage support settings" ON public.support_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER support_settings_touch BEFORE UPDATE ON public.support_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.support_settings (id) VALUES (true);

CREATE TABLE public.about_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'story',
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.about_blocks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.about_blocks TO authenticated;
GRANT ALL ON public.about_blocks TO service_role;
ALTER TABLE public.about_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view about blocks" ON public.about_blocks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage about blocks" ON public.about_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER about_blocks_touch BEFORE UPDATE ON public.about_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.about_blocks (kind, title_en, title_ar, body_en, body_ar, sort_order) VALUES
  ('hero', 'About us', 'من نحن', 'Medical study, made clear.', 'دراسة الطب، بوضوح.', 0),
  ('story', 'Our story', 'قصتنا', 'We started as a small group of medical students who wanted a better way to study — organised question banks, real resources, and no wasted time.', 'بدأنا كمجموعة صغيرة من طلاب الطب أرادوا طريقة أفضل للدراسة — بنوك أسئلة منظمة، ومصادر حقيقية، ودون إضاعة للوقت.', 1),
  ('stats', 'By the numbers', 'بالأرقام', '', '', 2),
  ('cta', 'Ready to start?', 'جاهز للبدء؟', 'Browse the courses and pick up where you left off.', 'تصفح الدورات وأكمل من حيث توقفت.', 3);

CREATE TABLE public.user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#e11d48',
  kind text NOT NULL DEFAULT 'manual',
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.packages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_groups TO authenticated;
GRANT ALL ON public.user_groups TO service_role;
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage user groups" ON public.user_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER user_groups_touch BEFORE UPDATE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_group_members (
  group_id uuid NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_group_members TO authenticated;
GRANT ALL ON public.user_group_members TO service_role;
ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage group members" ON public.user_group_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.announcement_audiences (
  announcement_id uuid NOT NULL REFERENCES public.site_announcements(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_audiences TO authenticated;
GRANT ALL ON public.announcement_audiences TO service_role;
ALTER TABLE public.announcement_audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage announcement audiences" ON public.announcement_audiences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.user_in_group(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE g public.user_groups;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO g FROM public.user_groups WHERE id = _group_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_group_members m
             WHERE m.group_id = _group_id AND m.user_id = _user_id) THEN
    RETURN true;
  END IF;
  IF g.kind = 'everyone' THEN RETURN true; END IF;
  IF g.kind = 'admins' THEN
    RETURN public.has_role(_user_id, 'admin'::public.app_role);
  END IF;
  IF g.kind = 'committee' THEN
    RETURN public.has_role(_user_id, 'committee'::public.app_role);
  END IF;
  IF g.kind = 'course_owners' THEN
    RETURN EXISTS (SELECT 1 FROM public.user_courses uc
                   WHERE uc.user_id = _user_id AND uc.course_id = g.course_id);
  END IF;
  IF g.kind = 'package_owners' THEN
    RETURN EXISTS (SELECT 1 FROM public.package_purchases pp
                   WHERE pp.user_id = _user_id AND pp.package_id = g.package_id);
  END IF;
  IF g.kind = 'no_course' THEN
    RETURN NOT EXISTS (SELECT 1 FROM public.user_courses uc WHERE uc.user_id = _user_id);
  END IF;
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION public.my_announcements()
RETURNS SETOF public.site_announcements
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.* FROM public.site_announcements a
  WHERE NOT EXISTS (SELECT 1 FROM public.announcement_audiences aa WHERE aa.announcement_id = a.id)
     OR EXISTS (
       SELECT 1 FROM public.announcement_audiences aa
       WHERE aa.announcement_id = a.id
         AND public.user_in_group(auth.uid(), aa.group_id)
     )
  ORDER BY a.sort ASC, a.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.my_announcements() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_group_members(_group_id uuid)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)),
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', ''),
    COALESCE(p.email, u.email::text)
  FROM public.user_group_members m
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = _group_id
  ORDER BY 2;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_group_counts()
RETURNS TABLE(group_id uuid, member_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT g.id,
    (SELECT count(*) FROM auth.users u WHERE public.user_in_group(u.id, g.id))::bigint
  FROM public.user_groups g;
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_in_group(uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_server_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'generated_at', now(),
    'buckets', COALESCE((
      SELECT jsonb_agg(b ORDER BY (b->>'bytes')::bigint DESC) FROM (
        SELECT jsonb_build_object(
          'bucket', o.bucket_id,
          'files', count(*),
          'bytes', COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0),
          'largest_bytes', COALESCE(max(COALESCE((o.metadata->>'size')::bigint, 0)), 0),
          'last_upload', max(o.created_at)
        ) AS b
        FROM storage.objects o
        GROUP BY o.bucket_id
      ) s
    ), '[]'::jsonb),
    'growth', jsonb_build_object(
      'bytes_30d', COALESCE((SELECT sum(COALESCE((metadata->>'size')::bigint,0)) FROM storage.objects WHERE created_at >= now() - interval '30 days'), 0),
      'bytes_90d', COALESCE((SELECT sum(COALESCE((metadata->>'size')::bigint,0)) FROM storage.objects WHERE created_at >= now() - interval '90 days'), 0),
      'files_30d', (SELECT count(*) FROM storage.objects WHERE created_at >= now() - interval '30 days')
    ),
    'largest_files', COALESCE((
      SELECT jsonb_agg(f) FROM (
        SELECT jsonb_build_object(
          'bucket', o.bucket_id,
          'name', o.name,
          'bytes', COALESCE((o.metadata->>'size')::bigint, 0),
          'created_at', o.created_at
        ) AS f
        FROM storage.objects o
        ORDER BY COALESCE((o.metadata->>'size')::bigint, 0) DESC
        LIMIT 25
      ) s2
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT jsonb_build_object(
          'name', c.relname,
          'bytes', pg_total_relation_size(c.oid),
          'rows', GREATEST(c.reltuples::bigint, 0)
        ) AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 15
      ) s3
    ), '[]'::jsonb),
    'content', jsonb_build_object(
      'courses', (SELECT count(*) FROM public.courses),
      'subjects', (SELECT count(*) FROM public.subjects),
      'questions', (SELECT count(*) FROM public.questions),
      'lectures', (SELECT count(*) FROM public.lecture_items),
      'committee_resources', (SELECT count(*) FROM public.committee_resources),
      'users', (SELECT count(*) FROM public.profiles),
      'active_sessions', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= now() - interval '5 minutes')
    )
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_server_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_server_stats() TO authenticated;

ALTER TABLE public.profiles ALTER COLUMN device_limit DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN device_limit DROP DEFAULT;
UPDATE public.profiles SET device_limit = NULL WHERE device_limit = 2;



-- MIGRATION: 20260808142501_e7686a76-a7e4-4620-ad6a-06a80e6ad548.sql

CREATE OR REPLACE FUNCTION public.account_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id AND p.locked_at IS NOT NULL
      );
$$;
REVOKE EXECUTE ON FUNCTION public.account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_active(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "View questions if enrolled or admin" ON public.questions;
CREATE POLICY "View questions if enrolled or admin"
  ON public.questions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.account_active(auth.uid())
      AND EXISTS (
        SELECT 1 FROM subjects s
        JOIN subject_groups sg ON sg.id = s.group_id
        JOIN user_courses uc ON uc.course_id = sg.course_id
        WHERE s.id = questions.subject_id AND uc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "View question_options if enrolled or admin" ON public.question_options;
CREATE POLICY "View question_options if enrolled or admin"
  ON public.question_options FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.account_active(auth.uid())
      AND EXISTS (
        SELECT 1 FROM questions q
        JOIN subjects s ON s.id = q.subject_id
        JOIN subject_groups sg ON sg.id = s.group_id
        JOIN user_courses uc ON uc.course_id = sg.course_id
        WHERE q.id = question_options.question_id AND uc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "public read resources" ON public.committee_resources;
CREATE POLICY "public read resources"
  ON public.committee_resources FOR SELECT
  USING (auth.uid() IS NULL OR public.account_active(auth.uid()));

ALTER TABLE public.committee_resources
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_web_link text,
  ADD COLUMN IF NOT EXISTS drive_download_link text,
  ADD COLUMN IF NOT EXISTS file_size bigint;
CREATE INDEX IF NOT EXISTS committee_resources_storage_provider_idx
  ON public.committee_resources (storage_provider);

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_default_storage text NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS brand_style text NOT NULL DEFAULT 'aqua-flow',
  ADD COLUMN IF NOT EXISTS study_plan_path text,
  ADD COLUMN IF NOT EXISTS study_plan_title text,
  ADD COLUMN IF NOT EXISTS study_plan_subtitle text,
  ADD COLUMN IF NOT EXISTS transfer_code text NOT NULL DEFAULT 'Shadyx1234@Lucifer';

CREATE TABLE public.committee_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.committee_semesters(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon_key text NOT NULL DEFAULT 'layers',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX committee_modules_semester_idx ON public.committee_modules(semester_id);
GRANT SELECT ON public.committee_modules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_modules TO authenticated;
GRANT ALL ON public.committee_modules TO service_role;
ALTER TABLE public.committee_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read modules" ON public.committee_modules FOR SELECT USING (true);
CREATE POLICY "committee manage modules" ON public.committee_modules FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid())) WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_committee_modules BEFORE UPDATE ON public.committee_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.committee_modules(id) ON DELETE CASCADE;
CREATE INDEX committee_subjects_module_idx ON public.committee_subjects(module_id);

CREATE TABLE public.committee_subject_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  offer_label text,
  original_price numeric(10,2),
  promo_price numeric(10,2),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX committee_subject_courses_subject_idx ON public.committee_subject_courses(subject_id);
GRANT SELECT ON public.committee_subject_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_subject_courses TO authenticated;
GRANT ALL ON public.committee_subject_courses TO service_role;
ALTER TABLE public.committee_subject_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read subject courses" ON public.committee_subject_courses FOR SELECT USING (true);
CREATE POLICY "committee manage subject courses" ON public.committee_subject_courses FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid())) WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_committee_subject_courses BEFORE UPDATE ON public.committee_subject_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_resources DROP CONSTRAINT IF EXISTS committee_resources_kind_check;
ALTER TABLE public.committee_resources ADD CONSTRAINT committee_resources_kind_check
  CHECK (kind = ANY (ARRAY['pdf'::text, 'link'::text, 'folder'::text, 'video'::text]));

ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS tag_label text,
  ADD COLUMN IF NOT EXISTS tag_color text NOT NULL DEFAULT 'amber';

ALTER TABLE public.committee_years
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_semesters
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_modules
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';
ALTER TABLE public.committee_subjects
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS closed_color text NOT NULL DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS closed_style text NOT NULL DEFAULT 'ribbon';

CREATE TABLE public.committee_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.committee_activity_log TO authenticated;
GRANT ALL ON public.committee_activity_log TO service_role;
ALTER TABLE public.committee_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read the committee log"
  ON public.committee_activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX committee_activity_log_created_idx ON public.committee_activity_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_committee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _uid uuid := auth.uid();
  _label text;
  _actor text;
  _action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _row := to_jsonb(OLD);
    _action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    _row := to_jsonb(NEW);
    _action := 'added';
  ELSE
    _row := to_jsonb(NEW);
    _action := 'edited';
  END IF;
  _label := COALESCE(
    _row->>'title', _row->>'display_name', _row->>'name', _row->>'label',
    _row->>'promo_label', (_row->>'year_number'), ''
  );
  SELECT COALESCE(p.username, p.full_name, p.email) INTO _actor
  FROM public.profiles p WHERE p.id = _uid;
  INSERT INTO public.committee_activity_log
    (actor_id, actor_label, action, entity_type, entity_id, entity_label, details)
  VALUES (_uid, _actor, _action, TG_TABLE_NAME, (_row->>'id')::uuid, _label, _row);
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_committee_years AFTER INSERT OR UPDATE OR DELETE ON public.committee_years
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_semesters AFTER INSERT OR UPDATE OR DELETE ON public.committee_semesters
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_modules AFTER INSERT OR UPDATE OR DELETE ON public.committee_modules
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_subjects AFTER INSERT OR UPDATE OR DELETE ON public.committee_subjects
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_categories AFTER INSERT OR UPDATE OR DELETE ON public.committee_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_resources AFTER INSERT OR UPDATE OR DELETE ON public.committee_resources
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();
CREATE TRIGGER log_committee_subject_courses AFTER INSERT OR UPDATE OR DELETE ON public.committee_subject_courses
  FOR EACH ROW EXECUTE FUNCTION public.log_committee_change();

GRANT EXECUTE ON FUNCTION public.account_active(uuid) TO anon;

CREATE TABLE public.admin_hub_layout (
  id boolean PRIMARY KEY DEFAULT true,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_hub_layout_singleton CHECK (id)
);
GRANT SELECT ON public.admin_hub_layout TO authenticated;
GRANT ALL ON public.admin_hub_layout TO service_role;
ALTER TABLE public.admin_hub_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read admin hub layout"
  ON public.admin_hub_layout FOR SELECT TO authenticated USING (true);
CREATE TRIGGER admin_hub_layout_touch BEFORE UPDATE ON public.admin_hub_layout
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.study_plan_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL,
  title_ar text,
  subtitle_en text,
  subtitle_ar text,
  has_semesters boolean NOT NULL DEFAULT true,
  has_finals boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.study_plan_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_stages TO authenticated;
GRANT ALL ON public.study_plan_stages TO service_role;
ALTER TABLE public.study_plan_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Study plan stages are viewable by everyone"
  ON public.study_plan_stages FOR SELECT USING (true);
CREATE POLICY "Committee managers manage study plan stages"
  ON public.study_plan_stages FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_study_plan_stages BEFORE UPDATE ON public.study_plan_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.study_plan_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.study_plan_stages(id) ON DELETE CASCADE,
  semester smallint,
  is_final boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  assessment text NOT NULL DEFAULT 'exam',
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_study_plan_subjects_stage ON public.study_plan_subjects(stage_id, semester, sort_order);
GRANT SELECT ON public.study_plan_subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_subjects TO authenticated;
GRANT ALL ON public.study_plan_subjects TO service_role;
ALTER TABLE public.study_plan_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Study plan subjects are viewable by everyone"
  ON public.study_plan_subjects FOR SELECT USING (true);
CREATE POLICY "Committee managers manage study plan subjects"
  ON public.study_plan_subjects FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));
CREATE TRIGGER touch_study_plan_subjects BEFORE UPDATE ON public.study_plan_subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.study_plan_stages (slug, title_en, title_ar, subtitle_en, has_semesters, has_finals, sort_order) VALUES
  ('zero',   'Zero Course',   'السنة التحضيرية', 'Preparatory year', false, false, 0),
  ('first',  'First Course',  'السنة الأولى',   NULL, true, false, 1),
  ('second', 'Second Course', 'السنة الثانية',  NULL, true, false, 2),
  ('third',  'Third Course',  'السنة الثالثة',  NULL, true, false, 3),
  ('fourth', 'Fourth Course', 'السنة الرابعة',  NULL, true, false, 4),
  ('fifth',  'Fifth Course',  'السنة الخامسة',  NULL, true, false, 5),
  ('sixth',  'Sixth Course',  'السنة السادسة',  NULL, true, true,  6);

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, note, sort_order)
SELECT s.id, NULL, v.name, v.assessment, v.note, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  ('Biology', 'exam', NULL, 0),
  ('Chemistry', 'test', NULL, 1),
  ('Physics', 'exam', NULL, 2),
  ('Foreign language', 'custom', 'Depends on the group', 3),
  ('Armenian language', 'pass', NULL, 4)
) AS v(name, assessment, note, ord) ON true
WHERE s.slug = 'zero';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Medical chemistry 1', 'exam', 0),
  (1, 'Human anatomy', 'exam', 1),
  (1, 'Physical training', 'pass', 2),
  (1, 'Latin', 'pass', 3),
  (1, 'Practical skills 1', 'pass', 4),
  (1, 'First aid with clinical skills', 'pass', 5),
  (1, 'Armenian language', 'pass', 6),
  (1, 'History of medicine', 'pass', 7),
  (1, 'History of Armenian civilization', 'pass', 8),
  (2, 'Medical chemistry 2', 'exam', 0),
  (2, 'Human anatomy', 'exam', 1),
  (2, 'Histology', 'exam', 2),
  (2, 'Clinical anatomy', 'exam', 3),
  (2, 'Medical biology', 'exam', 4),
  (2, 'Biophysics', 'exam', 5),
  (2, 'Medical physics', 'exam', 6),
  (2, 'Academic English', 'pass', 7),
  (2, 'Physical training', 'pass', 8),
  (2, 'Armenian language', 'pass', 9),
  (2, 'History of Armenian civilization', 'pass', 10),
  (2, 'Latin', 'pass', 11)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'first';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Psychology', 'exam', 0),
  (1, 'Human anatomy', 'exam', 1),
  (1, 'Histology', 'exam', 2),
  (1, 'Physiology', 'exam', 3),
  (1, 'Biochemistry', 'exam', 4),
  (1, 'Clinical anatomy', 'pass', 5),
  (1, 'Armenian language', 'pass', 6),
  (1, 'History of medicine', 'pass', 7),
  (1, 'History of Armenian civilization', 'pass', 8),
  (2, 'Parasitology', 'exam', 0),
  (2, 'Biostatistics', 'pass', 1),
  (2, 'Microbiology', 'exam', 2),
  (2, 'Physiology', 'exam', 3),
  (2, 'Biochemistry', 'exam', 4),
  (2, 'Armenian language', 'pass', 5),
  (2, 'Practical skills 2', 'pass', 6),
  (2, 'Bioethics', 'pass', 7),
  (2, 'Philosophy', 'pass', 8)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'second';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Pharmacology', 'exam', 0),
  (1, 'Microbiology', 'exam', 1),
  (1, 'Pathophysiology', 'exam', 2),
  (1, 'Pathoanatomy', 'exam', 3),
  (1, 'Internal medicine', 'exam', 4),
  (1, 'Surgery', 'exam', 5),
  (1, 'Pediatrics', 'exam', 6),
  (1, 'Surgical skills', 'practical', 7),
  (1, 'Medical law', 'test', 8),
  (1, 'Armenian language', 'pass', 9),
  (2, 'Pharmacology', 'exam', 0),
  (2, 'Pathophysiology', 'exam', 1),
  (2, 'Pathoanatomy', 'exam', 2),
  (2, 'Internal medicine', 'oral', 3),
  (2, 'Surgery', 'oral', 4),
  (2, 'Clinical skills', 'practical', 5),
  (2, 'Armenian language', 'pass', 6)
) AS v(sem, name, assessment, ord) ON true
WHERE s.slug = 'third';

INSERT INTO public.study_plan_subjects (stage_id, semester, name, assessment, note, sort_order)
SELECT s.id, v.sem, v.name, v.assessment, v.note, v.ord
FROM public.study_plan_stages s
JOIN (VALUES
  (1, 'Internal medicine', 'exam', 'Cardiology, pulmonology, hematology', 0),
  (1, 'Obstetrics and gynaecology', 'oral', NULL, 1),
  (1, 'Surgery', 'exam', NULL, 2),
  (1, 'Urology', 'exam', NULL, 3),
  (1, 'Pediatrics', 'exam', 'Pediatrics, genetics, hygiene', 4),
  (1, 'Public health', 'exam', 'Public health, epidemiology', 5),
  (2, 'Internal medicine', 'exam', 'Cardiology, pulmonology, nephrology, gastroenterology, clinical radiology', 0),
  (2, 'Surgery', 'exam', NULL, 1),
  (2, 'Obstetrics and gynaecology', 'oral', NULL, 2),
  (2, 'Clinical neurology', 'exam', 'Neurology, neurosurgery', 3),
  (2, 'Organism and ecosystem', 'exam', NULL, 4)
) AS v(sem, name, assessment, note, ord) ON true
WHERE s.slug = 'fourth';



-- MIGRATION: 20260809012400_06acfaa2-97f3-4ef3-8e62-6fee872b742e.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lock_kind text,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS lock_message text;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS terms_en text,
  ADD COLUMN IF NOT EXISTS terms_ar text,
  ADD COLUMN IF NOT EXISTS privacy_en text,
  ADD COLUMN IF NOT EXISTS privacy_ar text,
  ADD COLUMN IF NOT EXISTS study_hub_title text,
  ADD COLUMN IF NOT EXISTS study_hub_title_ar text,
  ADD COLUMN IF NOT EXISTS study_hub_subtitle text,
  ADD COLUMN IF NOT EXISTS study_hub_subtitle_ar text;

CREATE TABLE IF NOT EXISTS public.study_hub_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  label_ar text,
  description text,
  description_ar text,
  icon text NOT NULL DEFAULT 'Star',
  href text NOT NULL DEFAULT '',
  external boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.study_hub_tiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_hub_tiles TO authenticated;
GRANT ALL ON public.study_hub_tiles TO service_role;

ALTER TABLE public.study_hub_tiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_hub_tiles_read" ON public.study_hub_tiles;
CREATE POLICY "study_hub_tiles_read" ON public.study_hub_tiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "study_hub_tiles_admin_write" ON public.study_hub_tiles;
CREATE POLICY "study_hub_tiles_admin_write" ON public.study_hub_tiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS study_hub_tiles_touch ON public.study_hub_tiles;
CREATE TRIGGER study_hub_tiles_touch BEFORE UPDATE ON public.study_hub_tiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.account_active(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NULL
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id
          AND p.locked_at IS NOT NULL
          AND (p.lock_until IS NULL OR p.lock_until > now())
      );
$function$;




-- MIGRATION: 20260809140504_c58dd1b7-4fae-4931-94e7-9aee7581317f.sql

ALTER TABLE public.site_nav_items ADD COLUMN IF NOT EXISTS coming_soon boolean NOT NULL DEFAULT false;



-- MIGRATION: 20260809150607_097666dd-0fdc-428a-bef5-0176abe5897b.sql

REVOKE SELECT ON public.site_settings FROM anon, authenticated;

GRANT SELECT (id, site_name, tagline, logo_url, updated_at, theme, show_signature, protect_enabled, protect_watermark_opacity, protect_blur_on_blur, protect_block_print, protect_block_copy, protect_consent_required, protect_devtools_guard, protect_auto_lock_threshold, protect_terms_en, protect_terms_ar, committee_default_storage, brand_style, study_plan_path, study_plan_title, study_plan_subtitle, terms_en, terms_ar, privacy_en, privacy_ar, study_hub_title, study_hub_title_ar, study_hub_subtitle, study_hub_subtitle_ar)
ON public.site_settings TO anon, authenticated;

GRANT ALL ON public.site_settings TO service_role;



-- MIGRATION: 20260809152021_8b96845f-2a0b-4ca4-a6b3-69db70931de3.sql

ALTER TABLE public.committee_resources
  ADD COLUMN IF NOT EXISTS allow_preview boolean NOT NULL DEFAULT true;



-- MIGRATION: 20260809175819_1016dcd3-a2a9-4534-99e8-2144cd01aec5.sql

ALTER TABLE public.university_tiles
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_note_en text NOT NULL DEFAULT 'Coming soon',
  ADD COLUMN IF NOT EXISTS lock_note_ar text NOT NULL DEFAULT 'قريبًا',
  ADD COLUMN IF NOT EXISTS lock_color text NOT NULL DEFAULT 'amber';



-- MIGRATION: 20260809200331_d1ef73a2-271c-41f0-b51f-6147f0b59558.sql

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS refund_en text,
  ADD COLUMN IF NOT EXISTS refund_ar text;



-- MIGRATION: 20260809202200_ab51ce83-715c-4335-80d7-e49b2bd30c6f.sql

GRANT SELECT (id, site_name, tagline, logo_url, updated_at, theme, show_signature, protect_enabled, protect_watermark_opacity, protect_blur_on_blur, protect_block_print, protect_block_copy, protect_consent_required, protect_devtools_guard, protect_auto_lock_threshold, protect_terms_en, protect_terms_ar, committee_default_storage, brand_style, study_plan_path, study_plan_title, study_plan_subtitle, terms_en, terms_ar, privacy_en, privacy_ar, study_hub_title, study_hub_title_ar, study_hub_subtitle, study_hub_subtitle_ar, refund_en, refund_ar) ON public.site_settings TO anon, authenticated;

GRANT UPDATE, INSERT ON public.site_settings TO authenticated;

GRANT ALL ON public.site_settings TO service_role;



-- MIGRATION: 20260809213213_dcb87564-c9ba-4325-8f6f-53bc3d787de9.sql

CREATE TABLE IF NOT EXISTS public.admin_data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_data_exports TO authenticated;
GRANT ALL ON public.admin_data_exports TO service_role;

ALTER TABLE public.admin_data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view export audit"
ON public.admin_data_exports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_user_login_events_occurred_at ON public.user_login_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_user_login_events_user_occurred ON public.user_login_events (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON public.user_sessions (last_seen_at);

CREATE OR REPLACE FUNCTION public.admin_people_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'active_now', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= now() - interval '5 minutes'),
    'opened_today', (SELECT count(*) FROM public.user_sessions WHERE last_seen_at >= date_trunc('day', now())),
    'total_users', (SELECT count(*) FROM public.profiles),
    'new_today', (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('day', now())),
    'new_week', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'new_month', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days'),
    'new_prev_week', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days'),
    'new_prev_month', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'),
    'logins_today', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= date_trunc('day', now())),
    'logins_week', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '7 days'),
    'logins_month', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '30 days'),
    'logins_prev_week', (SELECT count(*) FROM public.user_login_events WHERE occurred_at >= now() - interval '14 days' AND occurred_at < now() - interval '7 days'),
    'verified', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
    'unverified', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL),
    'blocked', (SELECT count(*) FROM public.profiles WHERE locked_at IS NOT NULL AND lock_until IS NULL),
    'suspended', (SELECT count(*) FROM public.profiles WHERE locked_at IS NOT NULL AND lock_until IS NOT NULL AND lock_until > now()),
    'never_logged_in', (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = p.id)),
    'dormant_30d', (SELECT count(*) FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = p.id)
                     AND NOT EXISTS (SELECT 1 FROM public.user_login_events e2 WHERE e2.user_id = p.id AND e2.occurred_at >= now() - interval '30 days')),
    'revenue_cents', COALESCE((SELECT sum(amount_cents) FROM public.payment_events WHERE status = 'completed'), 0)
                     + COALESCE((SELECT sum(amount_cents) FROM public.package_purchases), 0),
    'revenue_month_cents', COALESCE((SELECT sum(amount_cents) FROM public.payment_events WHERE status = 'completed' AND created_at >= now() - interval '30 days'), 0)
                     + COALESCE((SELECT sum(amount_cents) FROM public.package_purchases WHERE created_at >= now() - interval '30 days'), 0),
    'paying_users', (SELECT count(DISTINCT u) FROM (
        SELECT user_id AS u FROM public.payment_events WHERE status = 'completed' AND user_id IS NOT NULL
        UNION SELECT buyer_id FROM public.package_purchases WHERE buyer_id IS NOT NULL) x),
    'course_grants', (SELECT count(*) FROM public.user_courses),
    'owners', (SELECT count(DISTINCT user_id) FROM public.user_courses),
    'coupon_redemptions', (SELECT count(*) FROM public.coupon_redemptions),
    'coupon_discount', COALESCE((SELECT sum(amount_before - amount_after) FROM public.coupon_redemptions), 0),
    'generated_at', now()
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_timeseries(_days integer DEFAULT 30)
RETURNS TABLE(day date, signups bigint, logins bigint, active_users bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH d AS (
    SELECT generate_series(date_trunc('day', now()) - ((GREATEST(LEAST(_days, 365), 1) - 1) || ' days')::interval,
                           date_trunc('day', now()), interval '1 day')::date AS day
  )
  SELECT d.day,
    (SELECT count(*) FROM public.profiles p WHERE p.created_at::date = d.day),
    (SELECT count(*) FROM public.user_login_events e WHERE e.occurred_at::date = d.day),
    (SELECT count(DISTINCT e.user_id) FROM public.user_login_events e WHERE e.occurred_at::date = d.day)
  FROM d ORDER BY d.day;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_retention()
RETURNS TABLE(cohort date, size bigint, w0 bigint, w1 bigint, w2 bigint, w3 bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH c AS (
    SELECT p.id, date_trunc('week', p.created_at) AS wk
    FROM public.profiles p
    WHERE p.created_at >= now() - interval '8 weeks'
  )
  SELECT c.wk::date,
    count(*)::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk AND e.occurred_at < c.wk + interval '1 week'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '1 week' AND e.occurred_at < c.wk + interval '2 weeks'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '2 weeks' AND e.occurred_at < c.wk + interval '3 weeks'))::bigint,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.user_login_events e WHERE e.user_id = c.id AND e.occurred_at >= c.wk + interval '3 weeks' AND e.occurred_at < c.wk + interval '4 weeks'))::bigint
  FROM c GROUP BY c.wk ORDER BY c.wk DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_course_stats()
RETURNS TABLE(course_id uuid, title text, price numeric, owners bigint, revenue_cents bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT co.id, co.title, co.price,
    (SELECT count(*) FROM public.user_courses uc WHERE uc.course_id = co.id)::bigint,
    COALESCE((SELECT sum(pe.amount_cents) FROM public.payment_events pe WHERE pe.course_id = co.id AND pe.status = 'completed'), 0)::bigint
  FROM public.courses co
  ORDER BY 4 DESC, co.title;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_insights()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH base AS (
    SELECT p.id,
      (SELECT count(*) FROM public.user_courses uc WHERE uc.user_id = p.id) AS courses,
      (SELECT count(*) FROM public.user_login_events e WHERE e.user_id = p.id) AS logins,
      (SELECT max(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = p.id) AS last_login,
      p.created_at
    FROM public.profiles p
  )
  SELECT jsonb_build_object(
    'avg_logins_with_courses', COALESCE(round(avg(logins) FILTER (WHERE courses > 0)::numeric, 1), 0),
    'avg_logins_without_courses', COALESCE(round(avg(logins) FILTER (WHERE courses = 0)::numeric, 1), 0),
    'avg_logins_overall', COALESCE(round(avg(logins)::numeric, 1), 0),
    'median_days_to_first_login', COALESCE((
      SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (fl - p2.created_at)) / 86400)::numeric, 1)
      FROM public.profiles p2
      CROSS JOIN LATERAL (SELECT min(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = p2.id) AS f(fl)
      WHERE fl IS NOT NULL), 0),
    'share_returning', CASE WHEN count(*) = 0 THEN 0
      ELSE round(100.0 * count(*) FILTER (WHERE logins > 1) / count(*), 1) END,
    'share_active_7d', CASE WHEN count(*) = 0 THEN 0
      ELSE round(100.0 * count(*) FILTER (WHERE last_login >= now() - interval '7 days') / count(*), 1) END,
    'peak_hour', COALESCE((SELECT EXTRACT(hour FROM occurred_at)::int FROM public.user_login_events
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), 0),
    'peak_weekday', COALESCE((SELECT to_char(occurred_at, 'Day') FROM public.user_login_events
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), '')
  ) INTO result FROM base;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_people_directory()
RETURNS TABLE(
  id uuid, full_name text, username text, email text, phone text,
  verified boolean, locked_at timestamptz, lock_until timestamptz, lock_reason text,
  roles text[], courses bigint, paid_cents bigint,
  created_at timestamptz, last_seen timestamptz, login_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', ''),
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email::text,'@',1)),
    COALESCE(p.email, u.email::text),
    COALESCE(p.phone, u.phone::text),
    (u.email_confirmed_at IS NOT NULL),
    p.locked_at, p.lock_until, p.lock_reason,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]),
    (SELECT count(*) FROM public.user_courses uc WHERE uc.user_id = u.id)::bigint,
    (COALESCE((SELECT sum(pe.amount_cents) FROM public.payment_events pe WHERE pe.user_id = u.id AND pe.status = 'completed'), 0)
     + COALESCE((SELECT sum(pp.amount_cents) FROM public.package_purchases pp WHERE pp.buyer_id = u.id), 0))::bigint,
    u.created_at,
    GREATEST(
      (SELECT max(s.last_seen_at) FROM public.user_sessions s WHERE s.user_id = u.id),
      (SELECT max(e.occurred_at) FROM public.user_login_events e WHERE e.user_id = u.id)
    ),
    (SELECT count(*) FROM public.user_login_events e WHERE e.user_id = u.id)::bigint
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END; $$;



-- MIGRATION: 20260809213235_2cf23d96-1b0b-4201-804d-e1be6dfef767.sql

REVOKE EXECUTE ON FUNCTION public.admin_people_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_timeseries(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_retention() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_course_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_insights() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_directory() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_people_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_timeseries(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_retention() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_course_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_insights() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_people_directory() TO authenticated, service_role;



-- MIGRATION: 20260809221129_0e5d4e53-cefd-499a-a1db-4704535221c4.sql

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS header_style text NOT NULL DEFAULT 'institutional';
GRANT SELECT (header_style) ON public.site_settings TO anon, authenticated;



-- MIGRATION: 20260809235552_f00abd9e-6c45-46fe-9c62-dc22beff5e8c.sql

CREATE INDEX IF NOT EXISTS question_options_question_id_idx ON public.question_options (question_id);
CREATE INDEX IF NOT EXISTS questions_subject_id_idx ON public.questions (subject_id);
CREATE INDEX IF NOT EXISTS subjects_group_id_idx ON public.subjects (group_id);
CREATE INDEX IF NOT EXISTS subject_groups_course_id_idx ON public.subject_groups (course_id);
CREATE INDEX IF NOT EXISTS lecture_items_subject_id_idx ON public.lecture_items (subject_id);
CREATE INDEX IF NOT EXISTS user_lecture_courses_course_id_idx ON public.user_lecture_courses (course_id);
CREATE INDEX IF NOT EXISTS user_courses_course_id_idx ON public.user_courses (course_id);
CREATE INDEX IF NOT EXISTS question_attempts_question_id_idx ON public.question_attempts (question_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON public.coupon_redemptions (user_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_course_id_idx ON public.coupon_redemptions (course_id);
CREATE INDEX IF NOT EXISTS package_purchases_buyer_id_idx ON public.package_purchases (buyer_id);



-- MIGRATION: 20260810003618_21354007-151e-4546-9400-0dc5afdd9118.sql

CREATE TABLE public.guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  course_id uuid,
  title_en text NOT NULL DEFAULT '',
  summary_en text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  title_ru text NOT NULL DEFAULT '',
  summary_ru text NOT NULL DEFAULT '',
  body_ru text NOT NULL DEFAULT '',
  title_hy text NOT NULL DEFAULT '',
  summary_hy text NOT NULL DEFAULT '',
  body_hy text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO authenticated;
GRANT ALL ON public.guides TO service_role;

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published guides"
  ON public.guides FOR SELECT
  USING (published = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert guides"
  ON public.guides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update guides"
  ON public.guides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete guides"
  ON public.guides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX guides_published_position_idx ON public.guides (published, position);

CREATE TRIGGER update_guides_updated_at
  BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.guides (slug, published, position, title_en, summary_en, body_en, title_ru, summary_ru, body_ru, title_hy, summary_hy, body_hy)
VALUES (
  'how-aquaqbank-works',
  true,
  0,
  'How AquaQBank works for YSMU students',
  'What AquaQBank includes for Yerevan State Medical University students: question banks, video lectures and committee notes, organised by year and course.',
  E'## What AquaQBank is\n\nAquaQBank is a study platform built around Yerevan State Medical University. Instead of hunting for scattered files, everything is organised by the year and the course you are actually studying.\n\n## What is inside\n\n- **Question banks** — practice questions per course, split into midterm and final sets, with instant feedback while you answer.\n- **Video lectures** — lecture courses grouped by subject, with quizzes attached to the material.\n- **Committee notes** — shared PDFs and summaries collected per year and subject, with preview before download.\n- **Summaries and study tools** — the Study Hub collects the extra tools we add over time.\n\n## How access works\n\nAccess is sold per academic year or per semester, depending on the course. You create a free account, verify your email, then unlock the courses you need. Some material is free to preview before you decide.\n\n## Getting started\n\n1. Create an account and verify your email.\n2. Open the Universities page and pick Yerevan State Medical University.\n3. Choose your year, then open the course you are studying.\n4. Start with the question bank for the exam you are preparing for.',
  'Как работает AquaQBank для студентов ЕГМУ',
  'Что входит в AquaQBank для студентов Ереванского государственного медицинского университета: банки вопросов, видеолекции и материалы комитета по курсам и годам обучения.',
  E'## Что такое AquaQBank\n\nAquaQBank — учебная платформа, построенная вокруг Ереванского государственного медицинского университета. Все материалы упорядочены по году обучения и по предмету, который вы изучаете.\n\n## Что внутри\n\n- **Банки вопросов** — практические вопросы по каждому предмету, отдельно для промежуточного и итогового экзамена.\n- **Видеолекции** — курсы лекций по темам, с тестами по материалу.\n- **Материалы комитета** — общие PDF-файлы и конспекты по году и предмету, с предпросмотром перед скачиванием.\n- **Конспекты и учебные инструменты** — раздел Study Hub, куда мы постепенно добавляем новые инструменты.\n\n## Как устроен доступ\n\nДоступ продаётся на учебный год или на семестр — в зависимости от курса. Вы создаёте бесплатный аккаунт, подтверждаете почту и открываете нужные курсы. Часть материалов доступна для предпросмотра.\n\n## С чего начать\n\n1. Создайте аккаунт и подтвердите электронную почту.\n2. Откройте страницу университетов и выберите ЕГМУ.\n3. Выберите свой год обучения и нужный предмет.\n4. Начните с банка вопросов для того экзамена, к которому готовитесь.',
  'Ինչպես է աշխատում AquaQBank-ը ԵՊԲՀ ուսանողների համար',
  'Ինչ է ներառում AquaQBank-ը Երևանի պետական բժշկական համալսարանի ուսանողների համար՝ հարցաշարեր, տեսադասախոսություններ և կոմիտեի նյութեր՝ ըստ կուրսի և առարկայի։',
  E'## Ինչ է AquaQBank-ը\n\nAquaQBank-ը ուսումնական հարթակ է, որը կառուցված է Երևանի պետական բժշկական համալսարանի շուրջ։ Բոլոր նյութերը դասավորված են ըստ ուսումնական տարվա և առարկայի։\n\n## Ինչ կա ներսում\n\n- **Հարցաշարեր** — գործնական հարցեր յուրաքանչյուր առարկայի համար՝ առանձին միջանկյալ և եզրափակիչ քննության համար։\n- **Տեսադասախոսություններ** — դասընթացներ ըստ թեմաների՝ կցված թեստերով։\n- **Կոմիտեի նյութեր** — ընդհանուր PDF-ներ և ամփոփումներ ըստ կուրսի և առարկայի՝ ներբեռնումից առաջ նախադիտմամբ։\n- **Ամփոփումներ և ուսումնական գործիքներ** — Study Hub բաժինը, որտեղ ավելացնում ենք նոր գործիքներ։\n\n## Ինչպես է աշխատում հասանելիությունը\n\nՀասանելիությունը վաճառվում է ուսումնական տարով կամ կիսամյակով՝ կախված դասընթացից։ Ստեղծում եք անվճար հաշիվ, հաստատում եք էլ․ փոստը և բացում անհրաժեշտ դասընթացները։\n\n## Ինչպես սկսել\n\n1. Ստեղծեք հաշիվ և հաստատեք էլ․ փոստը։\n2. Բացեք համալսարանների էջը և ընտրեք ԵՊԲՀ-ն։\n3. Ընտրեք ձեր կուրսը և անհրաժեշտ առարկան։\n4. Սկսեք այն քննության հարցաշարից, որին պատրաստվում եք։'
);



-- MIGRATION: 20260810015135_0b7ef8c3-e4e3-4504-ba8b-57223a1e67eb.sql

UPDATE public.site_content
SET value_en = 'Your YSMU question bank, all in one place.',
    value_ar = 'بنك أسئلة YSMU كاملاً في مكان واحد.',
    default_en = 'your YSMU question bank, all in one place.',
    default_ar = 'بنك أسئلة YSMU كاملاً في مكان واحد.'
WHERE key = 'cms.home.hero.title';

UPDATE public.site_content
SET value_en = 'YSMU study platform',
    value_ar = 'منصة دراسة YSMU',
    default_en = 'YSMU study platform',
    default_ar = 'منصة دراسة YSMU'
WHERE key = 'cms.home.hero.badge';



-- MIGRATION: 20260810085846_6ecb23b1-d36f-41df-b5c9-0a6a68bd8856.sql

update public.site_settings set tagline = 'The medical question bank platform — AquaQBank Platform', site_name = 'AquaQBank', brand_style = 'platform-lock';
update public.site_content set value_en = 'Your medical question bank, all in one place.', value_ar = 'بنك أسئلتك الطبية كاملاً في مكان واحد.' where key = 'cms.home.hero.title';
update public.site_content set value_en = 'AquaQBank Platform', value_ar = 'منصة AquaQBank' where key = 'cms.home.hero.badge';



-- MIGRATION: 20260810180145_50baf792-2fe1-4d6c-ab7a-bfed72c63908.sql

update public.site_settings set theme = 'academy' where id = true;



-- MIGRATION: 20260810181704_6e89e506-1fa0-4ff8-8c67-8a324aa0473f.sql

with home as (select id from public.site_pages where slug='home' limit 1)
update public.site_sections s set sort_order = s.sort_order + 10 where s.page_id = (select id from home);

with home as (select id from public.site_pages where slug='home' limit 1)
insert into public.site_sections (page_id, builtin_key, sort_order, visible)
select (select id from home), v.k, v.o, true
from (values ('exam_prep', 13), ('results', 15)) as v(k, o)
where not exists (
  select 1 from public.site_sections x where x.page_id = (select id from home) and x.builtin_key = v.k
);



-- MIGRATION: 20260811030016_d1aadf42-129b-4609-8c47-b850e538d7f3.sql

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



-- MIGRATION: 20260811033031_a288c656-5e39-4201-a146-5e424034d771.sql

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_groups TO authenticated;
GRANT ALL ON public.user_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_group_members TO authenticated;
GRANT ALL ON public.user_group_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_announcements TO authenticated;
GRANT SELECT ON public.site_announcements TO anon;
GRANT ALL ON public.site_announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_audiences TO authenticated;
GRANT ALL ON public.announcement_audiences TO service_role;

ALTER TABLE public.site_announcements ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.site_announcements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%style%'
  LOOP
    EXECUTE format('ALTER TABLE public.site_announcements DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_announcements
  ADD CONSTRAINT site_announcements_style_check
  CHECK (style IN ('ribbon','floating','spotlight','modal','marquee','toast','strip','inline'));



-- MIGRATION: 20260811034324_3ae1be17-ec12-4ff9-99c3-dc57e424e398.sql

-- 1. Admin-only secrets table
CREATE TABLE public.site_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.site_secrets TO service_role;
ALTER TABLE public.site_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage site secrets" ON public.site_secrets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_secrets TO authenticated;

CREATE TRIGGER site_secrets_touch BEFORE UPDATE ON public.site_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- The old code was world-readable, so treat it as leaked and mint a new one.
INSERT INTO public.site_secrets (key, value)
VALUES ('transfer_code', encode(gen_random_bytes(12), 'hex'));

ALTER TABLE public.site_settings DROP COLUMN transfer_code;

-- 2. Rotate the shipped default device unlock code
ALTER TABLE public.device_security_settings ALTER COLUMN unlock_code DROP DEFAULT;
UPDATE public.device_security_settings
SET unlock_code = encode(gen_random_bytes(9), 'hex')
WHERE unlock_code IS NULL OR unlock_code = 'Shadyx1234@';

-- 3. Committee library is members-only in the UI; make the data match
DROP POLICY IF EXISTS "public read resources" ON public.committee_resources;
CREATE POLICY "members read resources" ON public.committee_resources
  FOR SELECT TO authenticated
  USING (public.account_active(auth.uid()));
REVOKE SELECT ON public.committee_resources FROM anon;

-- 4. Signed-out visitors have no business calling admin routines
REVOKE EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_group_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_committee_members() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_group_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_course_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_directory() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_insights() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_timeseries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_server_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_self_admin(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_coupon(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, uuid) FROM anon;



-- MIGRATION: 20260811034522_fcc2b44d-7a4d-4fa1-9749-ef31aba42664.sql

DROP POLICY IF EXISTS "committee public read" ON storage.objects;
CREATE POLICY "committee members read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = ANY (ARRAY['committee-images'::text, 'committee-files'::text])
    AND public.account_active(auth.uid())
  );

DROP POLICY IF EXISTS "german_subjects read auth" ON public.german_subjects;
CREATE POLICY "german_subjects read owners" ON public.german_subjects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_owns_any_german_course(auth.uid())
  );



-- MIGRATION: 20260811170152_aa460b7a-16c9-4932-b201-8c4466c6e8cb.sql

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_keys TO authenticated;
GRANT ALL ON public.admin_ai_keys TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_ai_model_limits TO authenticated;
GRANT ALL ON public.admin_ai_model_limits TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_chunks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_v2_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_v2_ipad_chunks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_jobs TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_batch_german_ipad_chunks TO authenticated;
GRANT ALL ON public.jarvis_batch_german_ipad_chunks TO service_role;



-- MIGRATION: 20260811234600_e78a3612-2862-4538-86a8-ab614afb7de7.sql

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



-- MIGRATION: 20260812010805_cec2376f-89c9-42be-b8e1-9730837de508.sql

CREATE TABLE IF NOT EXISTS public.question_gen_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled batch',
  mode text NOT NULL DEFAULT 'extract',
  notes text,
  subject_id uuid,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_gen_batches TO authenticated;
GRANT ALL ON public.question_gen_batches TO service_role;

ALTER TABLE public.question_gen_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage question gen batches" ON public.question_gen_batches;
CREATE POLICY "Admins manage question gen batches"
ON public.question_gen_batches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS question_gen_batches_created_idx ON public.question_gen_batches (created_at DESC);



-- MIGRATION: 20260812025506_b7d18108-080f-40bd-b5c0-b1d9f8527a2b.sql

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_year_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_year_check CHECK (year >= 0 AND year <= 20);
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_category_check;



-- MIGRATION: 20260812063247_d948013f-3d32-4a7e-8d7f-237f53a964f3.sql

CREATE POLICY "Admins manage question images" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'));



-- MIGRATION: 20260813043045_a77184e5-4101-4d9e-9107-fab9ae24619a.sql

CREATE OR REPLACE FUNCTION public.__restore_exec(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN EXECUTE sql; END; $fn$; REVOKE EXECUTE ON FUNCTION public.__restore_exec(text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.__restore_exec(text) TO sandbox_exec;



-- MIGRATION: 20260813043155_dc9898f8-13a7-44c1-8cd5-dec3b599ed4e.sql

CREATE TABLE public.site_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.site_secrets TO service_role;
ALTER TABLE public.site_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage site secrets" ON public.site_secrets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_secrets TO authenticated;

CREATE TRIGGER site_secrets_touch BEFORE UPDATE ON public.site_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.site_secrets (key, value)
VALUES ('transfer_code', encode(extensions.gen_random_bytes(12), 'hex'));

ALTER TABLE public.site_settings DROP COLUMN transfer_code;

ALTER TABLE public.device_security_settings ALTER COLUMN unlock_code DROP DEFAULT;
UPDATE public.device_security_settings
SET unlock_code = encode(extensions.gen_random_bytes(9), 'hex')
WHERE unlock_code IS NULL OR unlock_code = 'Shadyx1234@';

DROP POLICY IF EXISTS "public read resources" ON public.committee_resources;
CREATE POLICY "members read resources" ON public.committee_resources
  FOR SELECT TO authenticated
  USING (public.account_active(auth.uid()));
REVOKE SELECT ON public.committee_resources FROM anon;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_roles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_group_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_all_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_committee_members() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_group_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_lecture_course_users(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_members(public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_marketing_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_course_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_directory() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_insights() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_people_timeseries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_committee_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lecture_course(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_server_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_users_for_group(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_self_admin(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_coupon(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, uuid) FROM anon;

DROP FUNCTION IF EXISTS public.__restore_exec(text);



-- MIGRATION: 20260813043932_ab78e7c8-b176-413e-a66c-8bc80b67a29c.sql

INSERT INTO public.user_roles (user_id, role) VALUES ('942a6a2c-b0a3-408e-a7da-9740db4073e3', 'admin') ON CONFLICT (user_id, role) DO NOTHING;



-- MIGRATION: 20260813054750_0ce141c8-119b-47de-b56f-936b4c2b324b.sql

-- Read: any signed-in user
CREATE POLICY "storage_read_signed_in"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos'));

-- Write: admins on every app bucket
CREATE POLICY "storage_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "storage_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "storage_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('university-logos','course-images','question-images','committee-files','committee-images','site-media','lecture-videos')
  AND public.has_role(auth.uid(), 'admin')
);

-- Committee managers can manage committee content
CREATE POLICY "storage_committee_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('committee-files','committee-images')
  AND public.can_manage_committee(auth.uid())
);

CREATE POLICY "storage_committee_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()))
WITH CHECK (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()));

CREATE POLICY "storage_committee_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('committee-files','committee-images') AND public.can_manage_committee(auth.uid()));




-- MIGRATION: 20260813054845_72c15cfd-35ed-4a74-ac8c-a042a047d548.sql

-- 1. Remove hardcoded admin backdoors
DROP TRIGGER IF EXISTS grant_admin_to_klory_email ON auth.users;
DROP TRIGGER IF EXISTS grant_admin_to_kloryx ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_admin_to_klory_email() CASCADE;
DROP FUNCTION IF EXISTS public.grant_admin_to_kloryx() CASCADE;
DROP FUNCTION IF EXISTS public.toggle_self_admin(boolean) CASCADE;

-- 2. No anonymous execution of app routines by default
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 3. Re-open only what signed-out visitors legitimately need
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon;




-- MIGRATION: 20260813054918_1d05a54c-58eb-49f9-8467-60c918439d6a.sql

REVOKE EXECUTE ON FUNCTION public.admin_group_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_group_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_announcements() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_group(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_committee_change() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_group_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_announcements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_group(uuid, uuid) TO authenticated;




-- MIGRATION: 20260813060042_d9598bb7-9acc-4b4d-bf13-463a139a80cf.sql

-- 1. Remove blanket signed-in read on storage
DROP POLICY IF EXISTS "storage_read_signed_in" ON storage.objects;
DROP POLICY IF EXISTS "committee members read" ON storage.objects;

-- Helper: can current user access a committee subject's materials?
CREATE OR REPLACE FUNCTION public.can_access_committee_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.account_active(auth.uid())
     AND (
       public.can_manage_committee(auth.uid())
       OR NOT EXISTS (
         SELECT 1 FROM public.committee_subject_courses csc
         WHERE csc.subject_id = _subject_id
       )
       OR EXISTS (
         SELECT 1 FROM public.committee_subject_courses csc
         JOIN public.user_courses uc
           ON uc.course_id = csc.course_id AND uc.user_id = auth.uid()
         WHERE csc.subject_id = _subject_id
       )
     );
$$;

REVOKE ALL ON FUNCTION public.can_access_committee_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_committee_subject(uuid) TO authenticated, service_role;

-- 2. committee_resources gated by subject entitlement
DROP POLICY IF EXISTS "members read resources" ON public.committee_resources;
CREATE POLICY "entitled members read resources"
ON public.committee_resources
FOR SELECT
TO authenticated
USING (
  public.can_manage_committee(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.committee_categories c
    WHERE c.id = committee_resources.category_id
      AND public.can_access_committee_subject(c.subject_id)
  )
);

-- 3. committee storage buckets: managers or entitled users only
CREATE POLICY "committee files readable by entitled users"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = ANY (ARRAY['committee-files','committee-images'])
  AND (
    public.can_manage_committee(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.committee_resources r
      JOIN public.committee_categories c ON c.id = r.category_id
      WHERE r.file_path = objects.name
        AND public.can_access_committee_subject(c.subject_id)
    )
  )
);

-- 4. admin hub layout: admins only
DROP POLICY IF EXISTS "Authenticated can read admin hub layout" ON public.admin_hub_layout;
CREATE POLICY "Admins read admin hub layout"
ON public.admin_hub_layout
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5. Revoke anon execution on all public functions, re-grant only public ones
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;



-- MIGRATION: 20260813060708_da33c6a8-cdae-4918-883c-b86fbe0bbf61.sql

-- 1. Prevent self-escalation / self-unlock through profile updates
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.locked_at   := OLD.locked_at;
  NEW.lock_until  := OLD.lock_until;
  NEW.lock_reason := OLD.lock_reason;
  NEW.device_limit := OLD.device_limit;
  NEW.email       := OLD.email;
  NEW.id          := OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 2. Hide the internal notification email from public reads
DROP POLICY IF EXISTS "Anyone can view support settings" ON public.support_settings;

CREATE OR REPLACE VIEW public.support_settings_public AS
SELECT id, page_enabled, form_enabled, channels_enabled,
       intro_title_en, intro_title_ar, intro_text_en, intro_text_ar,
       response_note_en, response_note_ar, categories
FROM public.support_settings;

GRANT SELECT ON public.support_settings_public TO anon, authenticated;



-- MIGRATION: 20260813060756_45e70c12-b5aa-45a5-a990-d7b92f989de2.sql

DROP VIEW IF EXISTS public.support_settings_public;

CREATE POLICY "Anyone can view support settings"
ON public.support_settings FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.support_settings FROM anon, authenticated;
GRANT SELECT (id, page_enabled, form_enabled, channels_enabled,
  intro_title_en, intro_title_ar, intro_text_en, intro_text_ar,
  response_note_en, response_note_ar, categories, created_at, updated_at)
ON public.support_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_support_notify()
RETURNS TABLE(notify_enabled boolean, notify_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT s.notify_enabled, s.notify_email FROM public.support_settings s WHERE s.id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_support_notify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_notify() TO authenticated, service_role;



-- MIGRATION: 20260813061948_0986f3cc-ff12-458f-8ae6-51ca0c7f82e9.sql

DROP POLICY IF EXISTS "Users record own redemptions" ON public.coupon_redemptions;

DROP POLICY IF EXISTS "Anon can view subjects of published courses" ON public.subjects;
DROP POLICY IF EXISTS "Authenticated can view subjects of published courses" ON public.subjects;

CREATE POLICY "Anon can view free public subjects"
ON public.subjects FOR SELECT TO anon
USING (
  access_level = 'free_public'::public.subject_access
  AND EXISTS (
    SELECT 1 FROM public.subject_groups sg
    JOIN public.courses c ON c.id = sg.course_id
    WHERE sg.id = subjects.group_id AND c.published = true
  )
);

CREATE POLICY "Authenticated can view free subjects"
ON public.subjects FOR SELECT TO authenticated
USING (
  access_level IN ('free_public'::public.subject_access, 'free_logged_in'::public.subject_access)
  AND EXISTS (
    SELECT 1 FROM public.subject_groups sg
    JOIN public.courses c ON c.id = sg.course_id
    WHERE sg.id = subjects.group_id AND c.published = true
  )
);



-- MIGRATION: 20260813135200_276111cb-1be5-4edc-bbe2-2945533a10e3.sql

CREATE TABLE public.aquavision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid,
  group_id uuid,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'created',
  status text NOT NULL DEFAULT 'pending',
  read_batch_id text,
  answer_batch_id text,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.aquavision_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.aquavision_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pdf_b64 text,
  question_count integer NOT NULL DEFAULT 0,
  raw_json jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aquavision_pages_job_idx ON public.aquavision_pages(job_id, page_number);

CREATE TABLE public.aquavision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.aquavision_jobs(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.aquavision_pages(id) ON DELETE CASCADE,
  item_index integer NOT NULL DEFAULT 0,
  number text,
  stem text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_letter text,
  concept text,
  explanation text,
  summary_table text,
  solved boolean NOT NULL DEFAULT false,
  imported boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'read',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aquavision_items_job_idx ON public.aquavision_items(job_id, item_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_jobs TO authenticated;
GRANT ALL ON public.aquavision_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_pages TO authenticated;
GRANT ALL ON public.aquavision_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquavision_items TO authenticated;
GRANT ALL ON public.aquavision_items TO service_role;

ALTER TABLE public.aquavision_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aquavision_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aquavision_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aquavision_jobs_admin" ON public.aquavision_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "aquavision_pages_admin" ON public.aquavision_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "aquavision_items_admin" ON public.aquavision_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER aquavision_jobs_touch BEFORE UPDATE ON public.aquavision_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();



-- MIGRATION: 20260813160723_6bac8722-75bf-48bd-8ea7-65ab7c7402e7.sql


CREATE TABLE public.patch_prox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid,
  group_id uuid,
  subject_id uuid,
  pdf_name text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  subject_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  phase text NOT NULL DEFAULT 'created',
  cut_batch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  solve_batch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.patch_prox_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.patch_prox_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  crops jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, page_number)
);

CREATE TABLE public.patch_prox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.patch_prox_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  item_index integer NOT NULL,
  image_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  letters jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_letter text,
  stem text,
  explanation text,
  subject_index integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, page_number, item_index)
);

CREATE INDEX patch_prox_pages_job_idx ON public.patch_prox_pages(job_id);
CREATE INDEX patch_prox_items_job_idx ON public.patch_prox_items(job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patch_prox_items TO authenticated;
GRANT ALL ON public.patch_prox_jobs TO service_role;
GRANT ALL ON public.patch_prox_pages TO service_role;
GRANT ALL ON public.patch_prox_items TO service_role;

ALTER TABLE public.patch_prox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_prox_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_prox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage prox jobs" ON public.patch_prox_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage prox pages" ON public.patch_prox_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage prox items" ON public.patch_prox_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));




-- MIGRATION: 20260813181159_75f23073-9657-4adb-8e1e-fdcc2da140c1.sql

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS compare_at_price numeric,
  ADD COLUMN IF NOT EXISTS discount_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;
CREATE POLICY "Anyone can view published courses"
ON public.courses FOR SELECT
TO anon, authenticated
USING (published = true AND admin_only = false);



-- MIGRATION: 20260814053016_6e15b270-b20c-4426-b4b8-de892c97764a.sql

ALTER TABLE public.patch_prox_pages ADD COLUMN IF NOT EXISTS page_image_path text;



-- MIGRATION: 20260814075504_4bde57ca-036a-4b97-8ad9-5a554a2a5e12.sql

ALTER TABLE public.aquavision_jobs ADD COLUMN IF NOT EXISTS reference_book text;
ALTER TABLE public.patch_prox_jobs ADD COLUMN IF NOT EXISTS reference_book text;



-- MIGRATION: 20260814085052_39ef9049-6d0b-46d3-a685-4dd5e9b06aa7.sql

ALTER TABLE public.jarvis_batch_v2_ipad_jobs ADD COLUMN IF NOT EXISTS reference_book TEXT;



-- MIGRATION: 20260814161240_0fa82e83-75ab-480b-a3ea-61d729f9f678.sql

ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_note_en text,
  ADD COLUMN IF NOT EXISTS closed_note_ar text,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;



-- MIGRATION: 20260815122644_0a9cd540-be63-41d2-8015-afdafb98d231.sql

CREATE TABLE public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled ad',
  template text not null default 'offer',
  design jsonb not null default '{}'::jsonb,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO authenticated;
GRANT ALL ON public.ad_creatives TO service_role;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ad creatives" ON public.ad_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ad_creatives_touch BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admins read ad media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write ad media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update ad media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete ad media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ad-media' AND public.has_role(auth.uid(),'admin'));



-- MIGRATION: 20260815161037_83412dc0-5969-40a6-bb76-ac347b99485c.sql

CREATE TABLE public.committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT 'JO',
  country_label text NOT NULL DEFAULT '',
  year_label text NOT NULL DEFAULT '',
  role_label text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  accent smallint NOT NULL DEFAULT 1,
  is_founder boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.committee_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_members TO authenticated;
GRANT ALL ON public.committee_members TO service_role;

ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "committee_members_public_read" ON public.committee_members
  FOR SELECT USING (true);

CREATE POLICY "committee_members_manage" ON public.committee_members
  FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));

CREATE TRIGGER committee_members_touch
  BEFORE UPDATE ON public.committee_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();



-- MIGRATION: 20260815161205_ec75bade-a598-49b4-864e-e230a473079a.sql

CREATE POLICY "member_photos_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'member-photos');

CREATE POLICY "member_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));

CREATE POLICY "member_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()))
  WITH CHECK (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));

CREATE POLICY "member_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos' AND public.can_manage_committee(auth.uid()));



-- MIGRATION: 20260815163738_088e1fae-5c20-494e-893b-0398c41fbb08.sql

ALTER TABLE public.committee_members ADD COLUMN IF NOT EXISTS photo_fit text NOT NULL DEFAULT 'cover';



-- MIGRATION: 20260815224343_48fdc062-fc05-4ffb-80ab-9b7d5cb1d29d.sql

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'golden';



-- MIGRATION: 20260815224416_4a45021a-6cd7-4fb1-aae9-24b50748967e.sql

ALTER TABLE public.user_courses ADD COLUMN IF NOT EXISTS granted_reason text;
ALTER TABLE public.user_lecture_courses ADD COLUMN IF NOT EXISTS granted_reason text;

CREATE OR REPLACE FUNCTION public.sync_golden_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_courses (user_id, course_id, granted_reason)
  SELECT _user_id, c.id, 'golden'
  FROM public.courses c
  WHERE COALESCE(c.kind, 'questions') <> 'lectures'
  ON CONFLICT (user_id, course_id) DO NOTHING;

  INSERT INTO public.user_lecture_courses (user_id, course_id, granted_reason)
  SELECT _user_id, c.id, 'golden'
  FROM public.courses c
  WHERE c.kind = 'lectures'
  ON CONFLICT (user_id, course_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_golden_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_courses WHERE user_id = _user_id AND granted_reason = 'golden';
  DELETE FROM public.user_lecture_courses WHERE user_id = _user_id AND granted_reason = 'golden';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_golden_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_golden_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_golden_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'golden' THEN
    PERFORM public.sync_golden_user(NEW.user_id);
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'golden' THEN
    PERFORM public.revoke_golden_user(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_golden_role_change ON public.user_roles;
CREATE TRIGGER trg_golden_role_change
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.on_golden_role_change();

CREATE OR REPLACE FUNCTION public.on_course_created_grant_golden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.kind, 'questions') = 'lectures' THEN
    INSERT INTO public.user_lecture_courses (user_id, course_id, granted_reason)
    SELECT ur.user_id, NEW.id, 'golden'
    FROM public.user_roles ur
    WHERE ur.role = 'golden'
    ON CONFLICT (user_id, course_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_courses (user_id, course_id, granted_reason)
    SELECT ur.user_id, NEW.id, 'golden'
    FROM public.user_roles ur
    WHERE ur.role = 'golden'
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_grant_golden ON public.courses;
CREATE TRIGGER trg_course_grant_golden
AFTER INSERT ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.on_course_created_grant_golden();



-- MIGRATION: 20260815231042_e1617698-72d7-42f5-a156-2429de30e55e.sql

ALTER TABLE public.committee_members ADD COLUMN IF NOT EXISTS is_golden boolean NOT NULL DEFAULT false;



-- MIGRATION: 20260816153529_811a7958-13a8-4d7b-9089-c2505428e982.sql

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_qr_path text,
  ADD COLUMN IF NOT EXISTS committee_qr_link text;

UPDATE public.site_settings
SET committee_qr_link = COALESCE(committee_qr_link, 'https://t.me/aquaqbank')
WHERE id = true;



-- MIGRATION: 20260816222204_4a22e027-85d6-4a58-85ca-24d43c9871ea.sql

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'committee_head';



-- MIGRATION: 20260816222259_3adbf255-02ca-4582-a8c8-b2224d23a756.sql

-- 1. Committee head can do everything a committee member can
CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role)
      OR public.has_role(_user_id, 'committee_head'::public.app_role);
$$;

-- 2. Heads may read the committee change log
DROP POLICY IF EXISTS "Admins can read the committee log" ON public.committee_activity_log;
CREATE POLICY "Admins and heads can read the committee log"
ON public.committee_activity_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'committee_head'::public.app_role)
);

-- 3. Heads may grant / revoke ONLY the committee role
CREATE OR REPLACE FUNCTION public.head_set_committee_role(_user_id uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'committee'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'committee'::public.app_role;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) TO authenticated;

-- 4. Heads may list committee members and search users
CREATE OR REPLACE FUNCTION public.head_list_committee_members()
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.username, split_part(COALESCE(p.email,''),'@',1)) AS username,
         COALESCE(p.full_name,'') AS full_name,
         COALESCE(p.email,'') AS email
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'committee'::public.app_role
  ORDER BY 2;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_list_committee_members() FROM anon;
GRANT EXECUTE ON FUNCTION public.head_list_committee_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.head_search_users(_query text)
RETURNS TABLE(id uuid, username text, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'committee_head'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _query IS NULL OR length(trim(_query)) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id,
         COALESCE(p.username,'') AS username,
         COALESCE(p.full_name,'') AS full_name,
         COALESCE(p.email,'') AS email
  FROM public.profiles p
  WHERE p.username ILIKE '%'||_query||'%'
     OR p.full_name ILIKE '%'||_query||'%'
     OR p.email ILIKE '%'||_query||'%'
  ORDER BY 2
  LIMIT 20;
END; $$;
REVOKE EXECUTE ON FUNCTION public.head_search_users(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.head_search_users(text) TO authenticated;

-- 5. Events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  subtitle_en text NOT NULL DEFAULT '',
  subtitle_ar text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'public',
  button_placement text NOT NULL DEFAULT 'home',
  button_style text NOT NULL DEFAULT 'hero',
  accent text NOT NULL DEFAULT 'emerald',
  cover_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_read ON public.events FOR SELECT
USING (
  (enabled AND visibility = 'public')
  OR (enabled AND visibility = 'auth' AND auth.uid() IS NOT NULL)
  OR public.can_manage_committee(auth.uid())
);
CREATE POLICY events_manage ON public.events FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'committee_head'::public.app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'committee_head'::public.app_role));
CREATE TRIGGER events_touch BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.event_visible(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND ( (e.enabled AND e.visibility = 'public')
         OR (e.enabled AND e.visibility = 'auth' AND auth.uid() IS NOT NULL)
         OR public.can_manage_committee(auth.uid()) )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_events()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'committee_head'::public.app_role);
$$;

CREATE TABLE public.event_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sections TO authenticated;
GRANT SELECT ON public.event_sections TO anon;
GRANT ALL ON public.event_sections TO service_role;
ALTER TABLE public.event_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_sections_read ON public.event_sections FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_sections_manage ON public.event_sections FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());

CREATE TABLE public.event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  role_label text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  photo_fit text NOT NULL DEFAULT 'cover',
  is_head boolean NOT NULL DEFAULT false,
  accent integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_members TO authenticated;
GRANT SELECT ON public.event_members TO anon;
GRANT ALL ON public.event_members TO service_role;
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_members_read ON public.event_members FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_members_manage ON public.event_members FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());

CREATE TABLE public.event_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'join',
  title_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  note_en text NOT NULL DEFAULT '',
  note_ar text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  button_label text NOT NULL DEFAULT '',
  qr_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_contacts TO authenticated;
GRANT SELECT ON public.event_contacts TO anon;
GRANT ALL ON public.event_contacts TO service_role;
ALTER TABLE public.event_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_contacts_read ON public.event_contacts FOR SELECT USING (public.event_visible(event_id));
CREATE POLICY event_contacts_manage ON public.event_contacts FOR ALL TO authenticated
USING (public.can_manage_events()) WITH CHECK (public.can_manage_events());



-- MIGRATION: 20260816222844_9caf2943-e0c4-4ba7-b4dd-2366144fce4d.sql

create or replace function public.can_manage_committee_members(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin'::public.app_role)
      or public.has_role(_user_id,'committee_head'::public.app_role);
$$;

create or replace function public.committee_team_list()
returns table(user_id uuid, username text, full_name text, email text, is_head boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query
  select p.id, p.username, p.full_name, p.email,
         public.has_role(p.id,'committee_head'::public.app_role)
  from public.profiles p
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id
      and ur.role in ('committee'::public.app_role,'committee_head'::public.app_role)
  )
  order by p.username;
end; $$;

create or replace function public.committee_team_add(_username text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  select id into _uid from public.profiles where lower(username) = lower(trim(_username)) limit 1;
  if _uid is null then raise exception 'user not found'; end if;
  insert into public.user_roles (user_id, role)
  values (_uid,'committee'::public.app_role) on conflict do nothing;
end; $$;

create or replace function public.committee_team_remove(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  -- Only admins may remove another head.
  if public.has_role(_user_id,'committee_head'::public.app_role)
     and not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'forbidden';
  end if;
  delete from public.user_roles
  where user_id = _user_id
    and role = 'committee'::public.app_role;
end; $$;

grant execute on function public.can_manage_committee_members(uuid) to authenticated;
grant execute on function public.committee_team_list() to authenticated;
grant execute on function public.committee_team_add(text) to authenticated;
grant execute on function public.committee_team_remove(uuid) to authenticated;

drop policy if exists "committee log readable by managers" on public.committee_activity_log;
create policy "committee log readable by managers"
on public.committee_activity_log for select to authenticated
using (public.can_manage_committee_members(auth.uid()));



-- MIGRATION: 20260816233155_f872b5bc-9bba-46e7-9574-5d67d3dc051d.sql

-- Trigger-only functions: nobody should call these directly
REVOKE EXECUTE ON FUNCTION public.on_course_created_grant_golden() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_golden_role_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_committee_change() FROM anon, authenticated, public;

-- Committee / head helpers: signed-in only (they re-check the caller's role internally)
REVOKE EXECUTE ON FUNCTION public.committee_team_add(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.committee_team_remove(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.committee_team_list() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_search_users(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.head_list_committee_members() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_committee_members(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_events() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.committee_team_add(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.committee_team_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.committee_team_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_set_committee_role(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_search_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_list_committee_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_committee_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_events() TO authenticated;

-- Genuinely public helpers stay callable by signed-out visitors
GRANT EXECUTE ON FUNCTION public.identity_taken(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.university_id_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_real_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_visible(uuid) TO anon, authenticated;



-- MIGRATION: 20260817010027_9b6c5d11-493d-4e03-b888-4c36b058bb64.sql

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  user_agent text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins read subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.push_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  title_ar text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  audience_group_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX push_messages_pending_idx ON public.push_messages(status, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_messages TO authenticated;
GRANT ALL ON public.push_messages TO service_role;
ALTER TABLE public.push_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "senders manage messages" ON public.push_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role));

CREATE TABLE public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.push_messages(id) ON DELETE CASCADE,
  user_id uuid,
  endpoint text NOT NULL DEFAULT '',
  ok boolean NOT NULL DEFAULT false,
  status_code integer,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_deliveries_message_idx ON public.push_deliveries(message_id);
GRANT SELECT ON public.push_deliveries TO authenticated;
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deliveries" ON public.push_deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'committee_head'::public.app_role));

CREATE TABLE public.notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  on_event boolean NOT NULL DEFAULT false,
  on_committee_resource boolean NOT NULL DEFAULT false,
  on_new_course boolean NOT NULL DEFAULT false,
  on_urgent_announcement boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read notification settings" ON public.notification_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write notification settings" ON public.notification_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
INSERT INTO public.notification_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER notification_settings_touch BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.push_audience_count(_group_ids uuid[])
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT (public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'committee_head'::public.app_role)) THEN 0::bigint
    ELSE (
      SELECT count(*)::bigint FROM public.push_subscriptions s
      WHERE s.enabled
        AND (
          coalesce(array_length(_group_ids, 1), 0) = 0
          OR EXISTS (SELECT 1 FROM unnest(_group_ids) g(id) WHERE public.user_in_group(s.user_id, g.id))
        )
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.push_audience_count(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_audience_count(uuid[]) TO authenticated, service_role;



-- MIGRATION: 20260817010146_b376f344-95b7-4a65-9f47-4a4914d34aad.sql

CREATE OR REPLACE FUNCTION public.push_audience_devices(_group_ids uuid[])
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text, lang text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.user_id, s.endpoint, s.p256dh, s.auth, s.lang
  FROM public.push_subscriptions s
  WHERE s.enabled
    AND (
      coalesce(array_length(_group_ids, 1), 0) = 0
      OR EXISTS (SELECT 1 FROM unnest(_group_ids) g(id) WHERE public.user_in_group(s.user_id, g.id))
    );
$$;
REVOKE ALL ON FUNCTION public.push_audience_devices(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_audience_devices(uuid[]) TO service_role;



-- MIGRATION: 20260817010847_32786114-f8a4-4021-9649-7897cb7091c4.sql

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--fc9a842d-8878-47fb-b9e8-2935803c6436.lovable.app/api/public/push-dispatch',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_AG466RguMgvqqLNtVFis2g_4DQl9pKU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);



-- MIGRATION: 20260817011341_3171468d-a3f2-4d92-8ffd-8664731b1b01.sql

CREATE OR REPLACE FUNCTION public.can_manage_committee_years(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id,'admin'::public.app_role)
      OR public.has_role(_user_id,'committee_head'::public.app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_committee_years(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_committee_years(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "committee manage years" ON public.committee_years;
CREATE POLICY "head manage years" ON public.committee_years
  FOR ALL TO authenticated
  USING (public.can_manage_committee_years(auth.uid()))
  WITH CHECK (public.can_manage_committee_years(auth.uid()));

DROP POLICY IF EXISTS "committee_members_manage" ON public.committee_members;
CREATE POLICY "head manage staff cards" ON public.committee_members
  FOR ALL TO authenticated
  USING (public.can_manage_committee_members(auth.uid()))
  WITH CHECK (public.can_manage_committee_members(auth.uid()));



-- MIGRATION: 20260818001429_cd9789bb-e39b-40fa-8ce9-c6759a6f2d26.sql

CREATE OR REPLACE FUNCTION public.set_committee_qr(_link text, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'committee_head')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.site_settings
     SET committee_qr_link = NULLIF(btrim(coalesce(_link, '')), ''),
         committee_qr_path = NULLIF(btrim(coalesce(_path, '')), '')
   WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_committee_qr(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_committee_qr(text, text) TO authenticated;



-- MIGRATION: 20260818001954_f501ce86-602b-4365-84cc-60f6c0dab7e5.sql

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;



-- MIGRATION: 20260820000140_7e343ca5-5b48-4310-8ad5-60b7b60dd49e.sql

CREATE TABLE public.committee_best_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.committee_subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'book',
  rating integer NOT NULL DEFAULT 5,
  note text,
  url text,
  resource_id uuid REFERENCES public.committee_resources(id) ON DELETE SET NULL,
  is_top boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX committee_best_sources_subject_idx ON public.committee_best_sources(subject_id);

GRANT SELECT ON public.committee_best_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_best_sources TO authenticated;
GRANT ALL ON public.committee_best_sources TO service_role;

ALTER TABLE public.committee_best_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read best sources" ON public.committee_best_sources FOR SELECT USING (true);
CREATE POLICY "committee manage best sources" ON public.committee_best_sources FOR ALL TO authenticated
  USING (public.can_manage_committee(auth.uid()))
  WITH CHECK (public.can_manage_committee(auth.uid()));

CREATE TRIGGER committee_best_sources_touch BEFORE UPDATE ON public.committee_best_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.committee_subjects ADD COLUMN best_sources_enabled boolean NOT NULL DEFAULT false;



-- MIGRATION: 20260906145248_fad3fc68-76f7-4160-9dcb-2ef13de94b65.sql

ALTER TABLE public.lecture_items
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

CREATE POLICY "lecture pdfs writable by admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs updatable by admin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs deletable by admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lecture pdfs readable by owners"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lecture-pdfs'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.lecture_items i
      JOIN public.lecture_subjects s ON s.id = i.subject_id
      JOIN public.user_lecture_courses ulc
        ON ulc.course_id = s.course_id AND ulc.user_id = auth.uid()
      WHERE i.pdf_storage_path = objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.lecture_items i
      WHERE i.pdf_storage_path = objects.name AND i.is_free = true
    )
  )
);



-- MIGRATION: 20260907173559_19106727-dc27-41d1-9e37-5956acef5561.sql

-- 1. Column additions
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS intro_image_url text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_subjects ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.lecture_items ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE public.lecture_items ADD COLUMN IF NOT EXISTS resource_kind text;

-- 2. Lecture staff
CREATE TABLE IF NOT EXISTS public.lecture_staff (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
GRANT SELECT ON public.lecture_staff TO authenticated;
GRANT ALL ON public.lecture_staff TO service_role;
ALTER TABLE public.lecture_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_lecture_staff(_course_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lecture_staff
    WHERE course_id = _course_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_lecture_course(_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_lecture_staff(_course_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_view_lecture_course(_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'golden'::app_role)
      OR public.is_lecture_staff(_course_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_lecture_courses ulc
        WHERE ulc.user_id = auth.uid() AND ulc.course_id = _course_id
      );
$$;

CREATE POLICY "Admins manage lecture staff" ON public.lecture_staff
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff read own assignments" ON public.lecture_staff
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT INSERT, UPDATE, DELETE ON public.lecture_staff TO authenticated;

-- 3. Staff write access on existing lecture tables
CREATE POLICY "subjects writable by course staff" ON public.lecture_subjects
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));

CREATE POLICY "items writable by course staff" ON public.lecture_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quizzes writable by course staff" ON public.lecture_quizzes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_items i JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE i.id = item_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_items i JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE i.id = item_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quiz questions writable by course staff" ON public.lecture_quiz_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_quizzes q JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE q.id = quiz_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_quizzes q JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE q.id = quiz_id AND public.can_edit_lecture_course(s.course_id)));

CREATE POLICY "quiz options writable by course staff" ON public.lecture_quiz_options
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_quiz_questions qq JOIN public.lecture_quizzes q ON q.id = qq.quiz_id JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE qq.id = question_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_quiz_questions qq JOIN public.lecture_quizzes q ON q.id = qq.quiz_id JOIN public.lecture_items i ON i.id = q.item_id JOIN public.lecture_subjects s ON s.id = i.subject_id WHERE qq.id = question_id AND public.can_edit_lecture_course(s.course_id)));

-- 4. Course-wide materials
CREATE TABLE public.lecture_course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'pdf',
  url text,
  storage_path text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_course_materials TO authenticated;
GRANT ALL ON public.lecture_course_materials TO service_role;
ALTER TABLE public.lecture_course_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course materials readable by course members" ON public.lecture_course_materials
  FOR SELECT TO authenticated USING (public.can_view_lecture_course(course_id));
CREATE POLICY "course materials writable by staff" ON public.lecture_course_materials
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));
CREATE TRIGGER lecture_course_materials_touch BEFORE UPDATE ON public.lecture_course_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Topic questions with show/hide
CREATE TABLE public.lecture_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.lecture_subjects(id) ON DELETE CASCADE,
  stem text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_index integer NOT NULL DEFAULT 0,
  explanation text,
  visible boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_questions TO authenticated;
GRANT ALL ON public.lecture_questions TO service_role;
ALTER TABLE public.lecture_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture questions readable by course members" ON public.lecture_questions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.lecture_subjects s
      WHERE s.id = subject_id
        AND (public.can_edit_lecture_course(s.course_id) OR (visible AND public.can_view_lecture_course(s.course_id)))
    )
  );
CREATE POLICY "lecture questions writable by staff" ON public.lecture_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecture_subjects s WHERE s.id = subject_id AND public.can_edit_lecture_course(s.course_id)));
CREATE TRIGGER lecture_questions_touch BEFORE UPDATE ON public.lecture_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Live classes
CREATE TABLE public.lecture_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  meeting_url text,
  repeat_weekly boolean NOT NULL DEFAULT false,
  recording_url text,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lecture_classes_course_start_idx ON public.lecture_classes (course_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_classes TO authenticated;
GRANT ALL ON public.lecture_classes TO service_role;
ALTER TABLE public.lecture_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes readable by course members" ON public.lecture_classes
  FOR SELECT TO authenticated USING (public.can_view_lecture_course(course_id));
CREATE POLICY "classes writable by staff" ON public.lecture_classes
  FOR ALL TO authenticated
  USING (public.can_edit_lecture_course(course_id))
  WITH CHECK (public.can_edit_lecture_course(course_id));
CREATE TRIGGER lecture_classes_touch BEFORE UPDATE ON public.lecture_classes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Protection toggles
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS protect_lectures boolean NOT NULL DEFAULT true;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS protect_qbank boolean NOT NULL DEFAULT true;

-- 8. Staff directory helpers (admin adds staff by username/email)
CREATE OR REPLACE FUNCTION public.lecture_staff_list(_course_id uuid)
RETURNS TABLE(user_id uuid, username text, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ls.user_id, p.username, p.full_name, p.email
  FROM public.lecture_staff ls
  LEFT JOIN public.profiles p ON p.id = ls.user_id
  WHERE ls.course_id = _course_id
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_lecture_staff(_course_id, auth.uid()));
$$;
GRANT EXECUTE ON FUNCTION public.lecture_staff_list(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_lecture_staff(uuid, uuid) FROM anon;




-- MIGRATION: 20260907173628_f7482cbf-cc26-4e63-8d3a-94a20b4c5394.sql

REVOKE EXECUTE ON FUNCTION public.is_lecture_staff(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_lecture_course(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_lecture_course(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lecture_staff_list(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_edit_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_lecture_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecture_staff_list(uuid) TO authenticated;



-- MIGRATION: 20260907182202_1e15e4a0-bc40-4264-8dcb-6aabeec1c37a.sql

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



-- MIGRATION: 20260907194809_7b210b66-5ef3-4b21-99c8-36d82970259a.sql

ALTER TABLE public.aquavision_items ADD COLUMN IF NOT EXISTS combo_sets jsonb NOT NULL DEFAULT '[]'::jsonb;



-- MIGRATION: 20260907202057_f0fed67f-1edc-4dee-a676-3dab91898a75.sql

ALTER TABLE public.aquavision_jobs
  ADD COLUMN resource_kind text,
  ADD COLUMN resource_text text,
  ADD COLUMN resource_url text,
  ADD COLUMN resource_storage_path text,
  ADD COLUMN resource_name text,
  ADD COLUMN resource_mime text;

ALTER TABLE public.aquavision_items
  ADD COLUMN printed_choices jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.aquavision_jobs
  ADD CONSTRAINT aquavision_jobs_resource_kind_check
  CHECK (resource_kind IS NULL OR resource_kind IN ('text', 'link', 'pdf'));

CREATE POLICY "Admins manage AquaVisionX resource files"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'aquavision-resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'aquavision-resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);



-- MIGRATION: 20260907202531_d35db9cf-3b8e-4c80-9a07-8f2d3922845f.sql

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



-- MIGRATION: 20260908131052_5a23bddb-a7bd-428d-a17a-b0b514f6c13c.sql

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



-- MIGRATION: 20260908144603_ec24026c-3087-46fd-ba23-6dbfdad554dc.sql

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS ordered boolean NOT NULL DEFAULT false;



-- MIGRATION: 20260909211307_a34c35db-157b-4481-bd91-26f7e344cdb9.sql

ALTER TABLE public.aquavision_jobs
  ADD COLUMN IF NOT EXISTS sort_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sort_topics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.aquavision_items
  ADD COLUMN IF NOT EXISTS topic text;

CREATE INDEX IF NOT EXISTS aquavision_items_job_topic_idx ON public.aquavision_items (job_id, topic);



-- MIGRATION: 20260911060000_seed_test_coupon_and_lecture_grant.sql

﻿-- Seed default 100% test coupon if not present
INSERT INTO public.coupons (code, discount_type, discount_value, is_active)
VALUES ('FREE100', 'percent', 100, true)
ON CONFLICT (lower(code)) DO NOTHING;

-- Ensure apply_coupon handles both standard question bank courses and lecture courses
CREATE OR REPLACE FUNCTION public.apply_coupon(_code TEXT, _course_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _v jsonb;
  _cid uuid;
  _final numeric;
  _before numeric;
  _kind text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'sign_in_required'; END IF;
  _v := public.validate_coupon(_code, _course_id);
  IF NOT (_v->>'valid')::boolean THEN
    RETURN _v;
  END IF;
  _cid := (_v->>'coupon_id')::uuid;
  _final := (_v->>'price_after')::numeric;
  _before := (_v->>'price_before')::numeric;
  INSERT INTO public.coupon_redemptions (coupon_id, user_id, course_id, amount_before, amount_after)
  VALUES (_cid, _uid, _course_id, _before, _final)
  ON CONFLICT (coupon_id, user_id, course_id) DO NOTHING;
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _cid;
  IF _final <= 0 THEN
    SELECT kind INTO _kind FROM public.courses WHERE id = _course_id LIMIT 1;
    IF _kind = 'lectures' THEN
      INSERT INTO public.user_lecture_courses (user_id, course_id)
      VALUES (_uid, _course_id)
      ON CONFLICT (user_id, course_id) DO NOTHING;
    ELSE
      INSERT INTO public.user_courses (user_id, course_id)
      VALUES (_uid, _course_id)
      ON CONFLICT (user_id, course_id) DO NOTHING;
    END IF;
  END IF;
  RETURN jsonb_set(_v, '{redeemed}', 'true'::jsonb);
END;
$$;




-- MIGRATION: 20260912185000_fix_mentor_rls.sql

-- Fix mentor tables RLS: Allow any authenticated user to manage their own mentor data
-- Previously had 'AND public.has_role(auth.uid(), 'admin')' which prevented non-admin users from creating/viewing tasks.

DROP POLICY IF EXISTS "mentor_categories owner admin all" ON public.mentor_categories;
CREATE POLICY "mentor_categories owner all"
ON public.mentor_categories FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_entries owner admin all" ON public.mentor_entries;
CREATE POLICY "mentor_entries owner all"
ON public.mentor_entries FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_tasks owner admin all" ON public.mentor_tasks;
CREATE POLICY "mentor_tasks owner all"
ON public.mentor_tasks FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_task_completions owner admin all" ON public.mentor_task_completions;
CREATE POLICY "mentor_task_completions owner all"
ON public.mentor_task_completions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_treasures owner admin all" ON public.mentor_treasures;
CREATE POLICY "mentor_treasures owner all"
ON public.mentor_treasures FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_journal owner admin all" ON public.mentor_journal;
CREATE POLICY "mentor_journal owner all"
ON public.mentor_journal FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);




-- MIGRATION: 20260912201000_packages_center_enhancements.sql

﻿-- Migration: Packages Center Enhancements
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2) CHECK (original_price IS NULL OR original_price >= 0),
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS package_kind text NOT NULL DEFAULT 'courses',
  ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS choice_count integer NOT NULL DEFAULT 3 CHECK (choice_count >= 1),
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;




-- MIGRATION: 20260912204500_committee_team_recruitment.sql

-- Migration: Committee team visibility and recruitment link
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS committee_team_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS committee_apply_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS committee_selection_title_en text NOT NULL DEFAULT 'We will choose the team members soon',
  ADD COLUMN IF NOT EXISTS committee_selection_title_ar text NOT NULL DEFAULT 'سيتم اختيار أعضاء اللجنة قريباً',
  ADD COLUMN IF NOT EXISTS committee_selection_subtitle_en text NOT NULL DEFAULT 'Applications to join لجنة الطب والجراحة are now open. If you have resources to share or wish to help other students, apply now.',
  ADD COLUMN IF NOT EXISTS committee_selection_subtitle_ar text NOT NULL DEFAULT 'باب التقديم للانضمام إلى فريق لجنة الطب والجراحة مفتوح الآن. إذا كنت ترغب في المساهمة في تنظيم المكتبة الأكاديمية ومساعدة زملائك، يمكنك التقديم الآن.';

GRANT SELECT (committee_team_visible, committee_apply_link, committee_selection_title_en, committee_selection_title_ar, committee_selection_subtitle_en, committee_selection_subtitle_ar) ON public.site_settings TO anon, authenticated;




-- MIGRATION: 20260912210000_about_hero_sentence.sql

-- Add about page hero sentence fields to site_settings
ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS about_sentence_en text DEFAULT 'Medical Question Bank & Clinical Cases — Empowering the next generation of physicians.',
ADD COLUMN IF NOT EXISTS about_sentence_ar text DEFAULT 'بنك الأسئلة والحالات السريرية الطبية — نحو تمكين جيل الأطباء القادم.';




-- MIGRATION: 20260913150000_courses_semester.sql

-- Add semester column to public.courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS semester smallint CHECK (semester IN (1, 2) OR semester IS NULL);

-- Explicitly ensure read & write access on semester column
GRANT ALL (semester) ON public.courses TO authenticated;
GRANT SELECT (semester) ON public.courses TO anon;

-- Prompt PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';




-- MIGRATION: 20260913221000_add_custom_instructions_and_detected_answer.sql

-- Add detected_answer to aquavision_items (for answers printed or highlighted on question PDFs)
ALTER TABLE public.aquavision_items
  ADD COLUMN IF NOT EXISTS detected_answer text;

-- Add custom_instructions to aquavision_jobs (for administrator instructions/notes to AI before solving)
ALTER TABLE public.aquavision_jobs
  ADD COLUMN IF NOT EXISTS custom_instructions text;

COMMENT ON COLUMN public.aquavision_items.detected_answer IS 'Answer detected directly from the question PDF page (printed or highlighted).';
COMMENT ON COLUMN public.aquavision_jobs.custom_instructions IS 'Custom instructions and notes given by the administrator to Gemini before solving.';




-- MIGRATION: 20260920092037_2d443b0b-6d54-4ddc-abb1-73dc561db958.sql

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'qa';



-- MIGRATION: 20260920092133_f6f14517-1930-4e5e-a368-4bbbd6f5ac06.sql

CREATE OR REPLACE FUNCTION public.can_use_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.can_use_amg(uuid) FROM anon;

CREATE TABLE public.amg_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  provider text NOT NULL DEFAULT 'google',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  mode text NOT NULL DEFAULT 'standard',
  form_b_style text NOT NULL DEFAULT 'in_question',
  instructions text NOT NULL DEFAULT '',
  source_name text NOT NULL DEFAULT '',
  page_count integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  answer_source text NOT NULL DEFAULT 'ai',
  answer_key text NOT NULL DEFAULT '',
  prefer_source boolean NOT NULL DEFAULT false,
  source_storage_path text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_groups TO authenticated;
GRANT ALL ON public.amg_groups TO service_role;
ALTER TABLE public.amg_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_groups_staff" ON public.amg_groups FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  page_no integer NOT NULL,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, page_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_pages TO authenticated;
GRANT ALL ON public.amg_pages TO service_role;
ALTER TABLE public.amg_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_pages_staff" ON public.amg_pages FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.amg_pages(id) ON DELETE SET NULL,
  page_no integer NOT NULL DEFAULT 1,
  order_index integer NOT NULL DEFAULT 0,
  form text NOT NULL DEFAULT 'A',
  number_label text NOT NULL DEFAULT '',
  stem text NOT NULL DEFAULT '',
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  answer_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  answer_mode text NOT NULL DEFAULT 'single',
  explanation jsonb,
  solved boolean NOT NULL DEFAULT false,
  solve_error text,
  dup_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX amg_items_group_idx ON public.amg_items (group_id, page_no, order_index);
CREATE INDEX amg_items_dup_idx ON public.amg_items (group_id, dup_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_items TO authenticated;
GRANT ALL ON public.amg_items TO service_role;
ALTER TABLE public.amg_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_items_staff" ON public.amg_items FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.amg_groups(id) ON DELETE CASCADE,
  item_id uuid,
  actor uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX amg_events_group_idx ON public.amg_events (group_id, created_at DESC);
GRANT SELECT, INSERT ON public.amg_events TO authenticated;
GRANT ALL ON public.amg_events TO service_role;
ALTER TABLE public.amg_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_events_staff_read" ON public.amg_events FOR SELECT TO authenticated
  USING (public.can_use_amg(auth.uid()));
CREATE POLICY "amg_events_staff_write" ON public.amg_events FOR INSERT TO authenticated
  WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE public.amg_keys (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amg_keys TO authenticated;
GRANT ALL ON public.amg_keys TO service_role;
ALTER TABLE public.amg_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amg_keys_admin" ON public.amg_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER amg_groups_touch BEFORE UPDATE ON public.amg_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER amg_pages_touch BEFORE UPDATE ON public.amg_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER amg_items_touch BEFORE UPDATE ON public.amg_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();



-- MIGRATION: 20260920092159_eb227e09-2791-408f-a70a-3056ab048b74.sql

REVOKE EXECUTE ON FUNCTION public.can_use_amg(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_amg(uuid) TO authenticated, service_role;



-- MIGRATION: 20260920092250_4f5a86ff-7067-47fc-b9ce-8ef0dd4e4247.sql

ALTER TABLE public.amg_groups
  ADD COLUMN IF NOT EXISTS batch_name text,
  ADD COLUMN IF NOT EXISTS batch_stage text,
  ADD COLUMN IF NOT EXISTS batch_map jsonb NOT NULL DEFAULT '{}'::jsonb;



-- MIGRATION: 20260920092316_7ecf7431-8d42-4de5-a60b-2c4d997ec673.sql

CREATE POLICY "amg_pages_objects_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amg-pages' AND public.can_use_amg(auth.uid()));



-- MIGRATION: 20260920095109_656066eb-299c-4086-9361-f5d1b50612cf.sql

ALTER TABLE public.amg_groups ADD COLUMN IF NOT EXISTS source_text text NOT NULL DEFAULT '';



-- MIGRATION: 20260920102642_8e1584f4-8c65-4bca-ade6-4f7295e95672.sql

CREATE OR REPLACE FUNCTION public.can_review_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.can_review_amg(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_amg(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_use_amg(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_committee(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'committee'::public.app_role)
      OR public.has_role(_user_id, 'committee_head'::public.app_role)
      OR public.has_role(_user_id, 'qa'::public.app_role);
$$;

DROP POLICY IF EXISTS amg_groups_staff ON public.amg_groups;
CREATE POLICY amg_groups_staff ON public.amg_groups FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_items_staff ON public.amg_items;
CREATE POLICY amg_items_staff ON public.amg_items FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_pages_staff ON public.amg_pages;
CREATE POLICY amg_pages_staff ON public.amg_pages FOR ALL TO authenticated
  USING (public.can_review_amg(auth.uid())) WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_events_staff_read ON public.amg_events;
CREATE POLICY amg_events_staff_read ON public.amg_events FOR SELECT TO authenticated
  USING (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_events_staff_write ON public.amg_events;
CREATE POLICY amg_events_staff_write ON public.amg_events FOR INSERT TO authenticated
  WITH CHECK (public.can_review_amg(auth.uid()));

DROP POLICY IF EXISTS amg_pages_read ON storage.objects;
DROP POLICY IF EXISTS amg_pages_write ON storage.objects;
CREATE POLICY amg_pages_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()));
CREATE POLICY amg_pages_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amg-pages' AND public.can_review_amg(auth.uid()));



-- MIGRATION: 20260920183055_ab1caf00-4747-4347-a771-54af1a8bdf6e.sql

ALTER TABLE public.amg_items
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orig jsonb;

CREATE INDEX IF NOT EXISTS amg_items_group_archived_idx ON public.amg_items (group_id, archived);



-- MIGRATION: 20260922090346_29569074-f0cf-418b-a48e-6f2ea0f9a86e.sql

create table public.amg_sources (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.amg_groups(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  extracted_text text not null default '',
  chunks jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.amg_sources to authenticated;
grant all on public.amg_sources to service_role;
alter table public.amg_sources enable row level security;
create policy "Admins manage MCQ source documents"
on public.amg_sources for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
create trigger touch_amg_sources_updated_at
before update on public.amg_sources
for each row execute function public.touch_updated_at();

alter table public.amg_items
  add column if not exists origin_question_id uuid references public.questions(id) on delete set null;
create unique index if not exists amg_items_group_origin_question_uidx
  on public.amg_items(group_id, origin_question_id)
  where origin_question_id is not null;




-- MIGRATION: 20260922090408_a641863c-ad2b-4d05-bb9a-47cb30681e34.sql

create policy "Admins read MCQ source files"
on storage.objects for select to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins upload MCQ source files"
on storage.objects for insert to authenticated
with check (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update MCQ source files"
on storage.objects for update to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete MCQ source files"
on storage.objects for delete to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));



-- MIGRATION: 20260922090749_7907f225-eec7-446a-a8cc-d0998cb93646.sql

drop index if exists public.amg_items_group_origin_question_uidx;
create unique index amg_items_group_origin_question_uidx
  on public.amg_items(group_id, origin_question_id);



-- MIGRATION: 20260924160000_disable_blur_on_blur_and_safe_devtools.sql

-- Make leaving the page and devtools safe and non-blocking by default.
-- Only recording, screenshots, and copying should be considered risky.
ALTER TABLE public.site_settings 
  ALTER COLUMN protect_blur_on_blur SET DEFAULT false,
  ALTER COLUMN protect_devtools_guard SET DEFAULT false;

UPDATE public.site_settings 
SET protect_blur_on_blur = false,
    protect_devtools_guard = false
WHERE id = true;




-- MIGRATION: 20260927230000_create_aqua_mcq_forge.sql

-- Aqua MCQ Forge: Separate AI-powered MCQ generation tool from textbooks and reference sources.

CREATE TABLE IF NOT EXISTS public.amf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  source_mode text NOT NULL DEFAULT 'strict',
  style_mode text NOT NULL DEFAULT 'ai',
  style_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  style_sample_text text DEFAULT '',
  difficulty_easy int NOT NULL DEFAULT 34,
  difficulty_medium int NOT NULL DEFAULT 33,
  difficulty_hard int NOT NULL DEFAULT 33,
  type_standard int DEFAULT 50,
  type_combined int DEFAULT 50,
  ai_decides_type boolean NOT NULL DEFAULT false,
  total_questions int DEFAULT 20,
  coverage_mode boolean NOT NULL DEFAULT false,
  dup_threshold int NOT NULL DEFAULT 87,
  include_images boolean NOT NULL DEFAULT false,
  image_count int NOT NULL DEFAULT 0,
  source_fidelity_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_jobs TO authenticated;
GRANT ALL ON public.amf_jobs TO service_role;
ALTER TABLE public.amf_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_jobs_staff" ON public.amf_jobs FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  extracted_text text,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_sources TO authenticated;
GRANT ALL ON public.amf_sources TO service_role;
ALTER TABLE public.amf_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_sources_staff" ON public.amf_sources FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  min_questions int NOT NULL DEFAULT 1,
  max_questions int NOT NULL DEFAULT 10,
  target_questions int NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT true,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_topics TO authenticated;
GRANT ALL ON public.amf_topics TO service_role;
ALTER TABLE public.amf_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_topics_staff" ON public.amf_topics FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.amf_topics(id) ON DELETE SET NULL,
  topic_name text NOT NULL DEFAULT '',
  form text NOT NULL DEFAULT 'A',
  stem text NOT NULL DEFAULT '',
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  answer_mode text NOT NULL DEFAULT 'single',
  difficulty text NOT NULL DEFAULT 'medium',
  objective text NOT NULL DEFAULT 'recall',
  explanation text,
  raw_explanation jsonb,
  source_fidelity jsonb,
  image_url text,
  image_prompt text,
  has_image boolean NOT NULL DEFAULT false,
  dup_hash text NOT NULL DEFAULT '',
  dup_score real DEFAULT 0,
  validation_report jsonb DEFAULT '{}'::jsonb,
  validation_attempts int NOT NULL DEFAULT 0,
  validation_passed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text NOT NULL DEFAULT '',
  order_index int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amf_items_job_idx ON public.amf_items (job_id, order_index);
CREATE INDEX IF NOT EXISTS amf_items_status_idx ON public.amf_items (job_id, status);

GRANT ALL ON public.amf_items TO authenticated;
GRANT ALL ON public.amf_items TO service_role;
ALTER TABLE public.amf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_items_staff" ON public.amf_items FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

CREATE TABLE IF NOT EXISTS public.amf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.amf_jobs(id) ON DELETE CASCADE,
  item_id uuid,
  actor uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.amf_events TO authenticated;
GRANT ALL ON public.amf_events TO service_role;
ALTER TABLE public.amf_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amf_events_staff" ON public.amf_events FOR ALL TO authenticated
  USING (public.can_use_amg(auth.uid())) WITH CHECK (public.can_use_amg(auth.uid()));

-- Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('amf-sources', 'amf-sources', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('amf-images', 'amf-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for amf-sources
CREATE POLICY "amf_sources_storage_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amf-sources' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amf-sources' AND public.can_use_amg(auth.uid()));

-- Storage policies for amf-images
CREATE POLICY "amf_images_storage_staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'amf-images' AND public.can_use_amg(auth.uid()))
  WITH CHECK (bucket_id = 'amf-images' AND public.can_use_amg(auth.uid()));

CREATE POLICY "amf_images_public_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'amf-images');


