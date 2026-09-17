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
-- MCQ Generator Pro — Phase 2: MCQ Answering / Solving
-- Adds columns for answer methods, model/provider, instructions, determined answers, confidence, needs_review, and source references.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mcq_pro_sessions: Phase 2 answering columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mcq_pro_sessions
  ADD COLUMN IF NOT EXISTS answering_method text,       -- 'ai' | 'study_material' | 'user_answer_key'
  ADD COLUMN IF NOT EXISTS answering_model text,        -- 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'openai-gpt4o'
  ADD COLUMN IF NOT EXISTS answering_provider text,     -- 'gemini' | 'openai'
  ADD COLUMN IF NOT EXISTS answering_instructions text, -- optional custom user instructions
  ADD COLUMN IF NOT EXISTS study_material_name text,
  ADD COLUMN IF NOT EXISTS study_material_text text,    -- extracted study material text / context
  ADD COLUMN IF NOT EXISTS answering_status text DEFAULT 'idle', -- 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  ADD COLUMN IF NOT EXISTS total_answered int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_needs_review int DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mcq_pro_questions: Phase 2 question answer columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mcq_pro_questions
  ADD COLUMN IF NOT EXISTS answer_source text,          -- 'ai' | 'study_material' | 'user_answer_key'
  ADD COLUMN IF NOT EXISTS selected_answer jsonb,       -- single choice letter "C" OR array ["A", "C"]
  ADD COLUMN IF NOT EXISTS answer_text jsonb,           -- text of selected option(s)
  ADD COLUMN IF NOT EXISTS confidence text,             -- 'high' | 'medium' | 'low'
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,          -- reason if uncertain / missing in material / option mismatch
  ADD COLUMN IF NOT EXISTS source_reference text,       -- e.g. "Chapter 3, Page 54: Myocardial Infarction"
  ADD COLUMN IF NOT EXISTS answering_model text,
  ADD COLUMN IF NOT EXISTS answering_provider text,
  ADD COLUMN IF NOT EXISTS answering_instructions text,
  ADD COLUMN IF NOT EXISTS answering_status text DEFAULT 'unanswered', -- 'unanswered' | 'answered' | 'failed' | 'needs_review'
  ADD COLUMN IF NOT EXISTS internal_reasoning text,     -- short internal note (max 1-2 sentences, NOT a student explanation)
  ADD COLUMN IF NOT EXISTS answered_at timestamptz;

CREATE INDEX IF NOT EXISTS mcq_pro_questions_answering_status_idx
  ON mcq_pro_questions(session_id, answering_status);
-- MCQ Generator Pro — Phase 3: Explanations & Phase 4: Verification
-- Adds columns for explanation generation, book answers, conflict flags, and structured verification reports.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mcq_pro_sessions: Phase 3 & 4 metadata
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mcq_pro_sessions
  ADD COLUMN IF NOT EXISTS phase3_model text,
  ADD COLUMN IF NOT EXISTS phase3_provider text,
  ADD COLUMN IF NOT EXISTS phase3_instructions text,
  ADD COLUMN IF NOT EXISTS phase3_show_book_answer boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS phase3_status text DEFAULT 'idle', -- 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  ADD COLUMN IF NOT EXISTS total_explanations int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_conflicts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase4_model text,
  ADD COLUMN IF NOT EXISTS phase4_provider text,
  ADD COLUMN IF NOT EXISTS phase4_status text DEFAULT 'idle', -- 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  ADD COLUMN IF NOT EXISTS phase4_total_checked int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase4_issues_count int DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mcq_pro_questions: Phase 3 & 4 explanation & audit columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE mcq_pro_questions
  ADD COLUMN IF NOT EXISTS concept text,
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS explanation_summary_table text,
  ADD COLUMN IF NOT EXISTS book_answer text,
  ADD COLUMN IF NOT EXISTS book_answer_found boolean,
  ADD COLUMN IF NOT EXISTS possible_answer_conflict boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS answer_conflict_note text,
  ADD COLUMN IF NOT EXISTS explanation_model text,
  ADD COLUMN IF NOT EXISTS explanation_status text DEFAULT 'unexplained', -- 'unexplained' | 'explained' | 'failed'
  ADD COLUMN IF NOT EXISTS explained_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified', -- 'unverified' | 'passed' | 'flagged' | 'error'
  ADD COLUMN IF NOT EXISTS verification_report jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS mcq_pro_questions_explanation_status_idx
  ON mcq_pro_questions(session_id, explanation_status);
CREATE INDEX IF NOT EXISTS mcq_pro_questions_verification_status_idx
  ON mcq_pro_questions(session_id, verification_status);
