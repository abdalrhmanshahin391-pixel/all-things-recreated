-- Challenge mode: a one-time, timed, ranked run through an admin-picked set of a course's questions.
--
-- All reads and writes go through server functions that use the service role, so students can never
-- read the correct answers early or edit their own score. RLS is enabled with no client policies
-- (except admin), which makes direct access from the browser impossible.

CREATE TABLE IF NOT EXISTS public.course_challenges (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- the frozen, ordered question set everyone answers
  question_ids uuid[] NOT NULL DEFAULT '{}',
  -- what the admin picked, so the settings screen can show it again
  subject_ids uuid[] NOT NULL DEFAULT '{}',
  question_count int NOT NULL DEFAULT 0,
  seconds_per_question int NOT NULL DEFAULT 30 CHECK (seconds_per_question BETWEEN 5 AND 600),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- declined = chose "Ignore" (final), active = playing, finished = done (final)
  status text NOT NULL CHECK (status IN ('declined', 'active', 'finished')),
  display_name text,
  started_at timestamptz,
  finished_at timestamptz,
  score int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  total_time_ms bigint NOT NULL DEFAULT 0,
  current_question_id uuid,
  current_served_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

-- Display names are unique within a course (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS challenge_participants_name_idx
  ON public.challenge_participants (course_id, lower(display_name))
  WHERE display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS challenge_participants_rank_idx
  ON public.challenge_participants (course_id, status, score DESC, total_time_ms ASC);

CREATE TABLE IF NOT EXISTS public.challenge_answers (
  participant_id uuid NOT NULL REFERENCES public.challenge_participants(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  selected_option_ids uuid[] NOT NULL DEFAULT '{}',
  is_correct boolean NOT NULL,
  timed_out boolean NOT NULL DEFAULT false,
  elapsed_ms int NOT NULL,
  points int NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, question_id)
);

ALTER TABLE public.course_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_answers ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.course_challenges TO service_role;
GRANT ALL ON public.challenge_participants TO service_role;
GRANT ALL ON public.challenge_answers TO service_role;

-- Browsers get nothing directly; only admins may read the tables (for support).
GRANT SELECT ON public.course_challenges TO authenticated;
GRANT SELECT ON public.challenge_participants TO authenticated;
GRANT SELECT ON public.challenge_answers TO authenticated;

CREATE POLICY "Admins read challenges" ON public.course_challenges
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read challenge participants" ON public.challenge_participants
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read challenge answers" ON public.challenge_answers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
