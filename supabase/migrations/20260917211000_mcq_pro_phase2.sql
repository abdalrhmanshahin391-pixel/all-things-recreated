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
