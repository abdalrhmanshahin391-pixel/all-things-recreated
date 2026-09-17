-- MCQ Generator Pro — persistent extraction session tables
-- Phase 1: extraction only (no answer key, no solving)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Sessions table (one row per PDF upload run)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcq_pro_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pdf_name            text        NOT NULL,
  total_pages         int         NOT NULL DEFAULT 0,
  pages_processed     int         NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'pending',
    -- pending | running | done | failed | cancelled
  model               text        NOT NULL DEFAULT 'gemini-2.5-flash',
    -- gemini-2.5-flash | gemini-2.5-pro | gemini-3.1-pro | openai-gpt4o
  combination_mode    text        NOT NULL DEFAULT 'keep',
    -- keep | convert
  missing_opts_mode   text        NOT NULL DEFAULT 'manual',
    -- manual | ai_generate
  ai_notes            text,
  questions_extracted int         NOT NULL DEFAULT 0,
  duplicates_found    int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Questions table (one row per extracted question before import)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcq_pro_questions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              uuid        NOT NULL REFERENCES mcq_pro_sessions(id) ON DELETE CASCADE,
  page_number             int         NOT NULL,
  question_number         int,
  stem                    text        NOT NULL,
  options                 jsonb       NOT NULL DEFAULT '[]',
    -- [{"letter":"A","body":"..."},{"letter":"B","body":"..."}]
  question_type           text        NOT NULL DEFAULT 'single_choice',
    -- single_choice | multiple_answer
  needs_manual_options    boolean     NOT NULL DEFAULT false,
  options_generated_by_ai boolean     NOT NULL DEFAULT false,
  is_duplicate            boolean     NOT NULL DEFAULT false,
  duplicate_of_id         uuid        REFERENCES mcq_pro_questions(id) ON DELETE SET NULL,
  review_status           text        NOT NULL DEFAULT 'pending',
    -- pending | accepted | rejected
  sort_order              int         NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS mcq_pro_questions_session_idx ON mcq_pro_questions(session_id);
CREATE INDEX IF NOT EXISTS mcq_pro_questions_page_idx    ON mcq_pro_questions(session_id, page_number);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. auto-update updated_at on sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_mcq_pro_session_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcq_pro_sessions_updated_at ON mcq_pro_sessions;
CREATE TRIGGER mcq_pro_sessions_updated_at
  BEFORE UPDATE ON mcq_pro_sessions
  FOR EACH ROW EXECUTE FUNCTION update_mcq_pro_session_ts();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — admin-only
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mcq_pro_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_pro_questions ENABLE ROW LEVEL SECURITY;

-- Sessions
CREATE POLICY "mcq_pro_sessions_admin_all"
  ON mcq_pro_sessions FOR ALL
  USING  (auth.uid() IS NOT NULL AND (SELECT has_role(auth.uid(), 'admin')))
  WITH CHECK (auth.uid() IS NOT NULL AND (SELECT has_role(auth.uid(), 'admin')));

-- Questions
CREATE POLICY "mcq_pro_questions_admin_all"
  ON mcq_pro_questions FOR ALL
  USING  (auth.uid() IS NOT NULL AND (SELECT has_role(auth.uid(), 'admin')))
  WITH CHECK (auth.uid() IS NOT NULL AND (SELECT has_role(auth.uid(), 'admin')));
