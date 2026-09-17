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
