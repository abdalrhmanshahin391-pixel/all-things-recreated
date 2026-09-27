/**
 * Aqua MCQ Forge — AI Prompts and Model Registry
 */

export const AMF_MODELS = {
  google: [
    { id: "gemini-3.5-flash", label: "Gemini Flash 3.5 (Recommended Balanced)" },
    { id: "gemini-3.5-flash-lite", label: "Gemini Flash-Lite 3.5 (Fastest & Economical)" },
    { id: "gemini-2.5-pro", label: "Gemini Pro 2.5 (Deepest Reasoning & Clinical Precision)" },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4 (Advanced Flagship)" },
    { id: "gpt-4.1", label: "GPT 4.1 (Standard High Accuracy)" },
    { id: "gpt-4.1-mini", label: "GPT 4.1 Mini (Fast & Low Cost)" },
    { id: "gpt-5.6-luna", label: "GPT Luna (Creative & Analytical)" },
  ],
} as const;

export type AmfProvider = keyof typeof AMF_MODELS;

export const QUESTION_OBJECTIVES = [
  { id: "recall", label: "Direct Recall" },
  { id: "understanding", label: "Understanding / Mechanism" },
  { id: "comparison", label: "Comparison / Differentiation" },
  { id: "application", label: "Application of Concepts" },
  { id: "clinical_reasoning", label: "Clinical Case Reasoning" },
  { id: "sequence", label: "Sequence / Step Progression" },
  { id: "classification", label: "Classification / Taxonomy" },
  { id: "identification", label: "Identification / Diagnosis" },
] as const;

/** Prompt to discover chapters and topics from textbook text */
export function buildTopicDiscoveryPrompt(textSample: string): string {
  return `You are an expert medical educator and textbook analyst.
Analyze the following textbook excerpt and identify the primary medical topics, chapters, or anatomical/pathological sub-units.

TEXT EXCERPT:
${textSample.slice(0, 30000)}

Return STRICT JSON only, with no markdown fences, matching this structure:
{
  "topics": [
    {
      "name": "Concise Topic Name (e.g., Ventricular System & CSF Flow)",
      "description": "1 sentence describing the scope of this topic in the source",
      "estimated_weight": 10 // number of representative MCQs that can be authored from this section (1-20)
    }
  ]
}

RULES:
- Provide between 3 and 12 distinct, high-yield topics from this material.
- Never output topics not discussed in the text.
- Output pure JSON only.`;
}

/** Prompt to extract factual knowledge units for a topic */
export function buildFactExtractionPrompt(topicName: string, textChunk: string): string {
  return `You are a medical knowledge extractor. Extract high-yield, exam-relevant facts strictly from the source material below for the topic: "${topicName}".

SOURCE TEXT:
${textChunk.slice(0, 32000)}

Return STRICT JSON only, matching this structure:
{
  "facts": [
    {
      "statement": "Clear, verifiable medical fact",
      "section": "Section or heading title",
      "page_reference": "Approximate page number or chapter location if stated",
      "quote": "Direct verbatim quote from the text that proves this fact"
    }
  ]
}

RULES:
- Extract 4 to 12 facts that would make high-quality multiple choice questions.
- Every statement must be 100% backed by the provided text.
- Output pure JSON only.`;
}

/** Generation System Prompt for authoring a question */
export function buildGenerationSystemPrompt(config: {
  sourceMode: "strict" | "reasoning";
  form: "A" | "B";
  difficulty: "easy" | "medium" | "hard";
  objective: string;
  styleContext?: string;
  includeImage?: boolean;
}): string {
  const isStrict = config.sourceMode === "strict";
  const isFormB = config.form === "B";

  const difficultyDefinitions = {
    easy: "EASY: Direct recall, one-step reasoning, clearly stated information directly mentioned in the textbook.",
    medium: "MEDIUM: Requires understanding or comparison of two pieces of information, with some medical interpretation.",
    hard: "HARD: Requires multi-step reasoning, similar/challenging alternatives, application of clinical concepts, or discriminating between closely related medical concepts.",
  };

  return `You are Aqua MCQ Forge, the world's most rigorous medical multiple-choice question author.
Your task is to author ONE pristine, board-exam standard medical MCQ based SOLELY on the supplied textbook source knowledge.

TARGET QUESTION CONFIGURATION:
- Question Form: ${isFormB ? "COMBINED (Form B: numbered statements 1,2,3,4 followed by combination options A,B,C,D)" : "STANDARD (Form A: question stem followed by options A,B,C,D)"}
- Target Difficulty: ${config.difficulty.toUpperCase()} — ${difficultyDefinitions[config.difficulty]}
- Question Objective: ${config.objective}
- Source Fidelity Mode: ${isStrict ? "STRICT SOURCE MODE (No factual claims, terminology, numerical values, or classifications outside the supplied text)" : "SOURCE + AI REASONING (Source is authoritative, AI provides medical reasoning)"}
${config.styleContext ? `\nSTYLE GUIDE & COURSE CLONING REFERENCE (Match this tone, question length, and distractor sophistication):\n${config.styleContext.slice(0, 2000)}\n` : ""}

QUESTION STRUCTURE RULES:
${isFormB ? `FORM B (COMBINED QUESTION):
1. The "stem" contains the clinical vignette or introductory question sentence (e.g. "Which of the following are classified directly under general mechanisms of cell injury?").
2. The "statements" array MUST contain 3 to 5 numbered statements (e.g. [{"n": "1", "text": "Statement 1..."}, {"n": "2", "text": "Statement 2..."}]). Each statement is a distinct medical assertion that can be evaluated as true or false. NEVER leave the statements array empty for Form B!
3. The "options" array contains lettered options A, B, C, D representing combinations of the numbered statements:
   - Examples of combinations: "1 and 3 only", "1, 2, and 4", "All of the above", "None of the above", "2 only".
4. The "answer_labels" must be an array with the single correct option letter (e.g. ["B"]).` : `FORM A (STANDARD QUESTION):
1. The "stem" contains the complete clinical vignette or question sentence.
2. The "statements" array is EMPTY [].
3. The "options" array contains 4 distinct options with labels ["A", "B", "C", "D"].
4. Distractors must be plausible, sophisticated, and reflect common medical misconceptions, but definitively incorrect.
5. The "answer_labels" must be an array with the single correct option letter (e.g. ["C"]).`}

CRITICAL RULES FOR "stem":
- The "stem" must contain ONLY the actual question or clinical scenario itself.
- ABSOLUTELY NEVER begin the stem with filler topic echoes, chapter headers, or meta-introductions!
  * FORBIDDEN OPENINGS: "In the foundational framework of...", "In the framework of...", "In the scope of...", "Within the framework of...", "In the classification of...", "In the context of...", "In the study of...", "According to the provided text...", "Regarding the pathogenesis/etiology/mechanisms of...", "Based on the excerpt...".
  * INSTEAD: Jump straight into the direct question (e.g. "Which of the following is recognized as a primary category of cell injury mechanisms?") or clinical vignette (e.g. "A 58-year-old male presents with..."). Do NOT place any introductory meta-phrases before the question.

EXPLANATION STRUCTURE RULES (Crucial):
You must supply a structured explanation object with these exact keys:
- DO NOT put source citations, textbook titles, page numbers, or excerpt quotes inside any of the explanation fields! Keep the explanation strictly educational and clinical.
- "title": Short medical topic title (3-5 words).
- "overview": 3 to 4 professional sentences explaining the fundamental concept, pathophysiology, anatomy, or pharmacology.
- "why_correct": 2 to 3 sentences explaining why the correct answer is right. (Omit/leave empty if all options are correct).
- "why_wrong": 1 to 2 sentences per incorrect option explaining why they are wrong. (Omit/leave empty if none are correct).
- "table_rows": An array of objects for the breakdown table:
  - For Form A (Standard): Provide one row for each option (A, B, C, D). Crucial rule: in "item", provide the OPTION WORDING ONLY. DO NOT include "A)", "B)", "A.", etc.
  - For Form B (Combined): Provide one row for EACH NUMBERED STATEMENT (1, 2, 3, 4). Crucial rule: in "item", provide the STATEMENT WORDING ONLY. DO NOT include "1)", "2.", "1-", etc., and DO NOT create rows for the combination letters A, B, C, D.
  - Each row must have: { "item": string, "correct": boolean, "reason": "2-3 focused sentences explaining why this specific item itself is medically true or false" }
- "clinical_distinction": 2 to 3 lines on how to distinguish this condition or feature from its clinical mimics.
- "memory_aid": One memorable, concise line (mnemonic, visual cue, or high-yield rule).

SOURCE FIDELITY OBJECT:
- "source": Textbook title or file name
- "page": Page or chapter reference
- "section": Relevant sub-heading
- "evidence": Exact verbatim quote from the source supporting the answer

${config.includeImage ? `IMAGE REQUIREMENT:
This question should include a medical visual or diagram. Provide:
- "image_needed": true
- "image_prompt": "A clear, detailed description of the medical diagram, anatomical illustration, or clinical sketch required for this question."` : `"image_needed": false, "image_prompt": ""`}

Return STRICT JSON only, matching this exact shape:
{
  "form": "${config.form}",
  "stem": "...",
  "statements": [${isFormB ? `{"n":"1","text":"..."},{"n":"2","text":"..."}` : ""}],
  "options": [
    {"label":"A","text":"..."},
    {"label":"B","text":"..."},
    {"label":"C","text":"..."},
    {"label":"D","text":"..."}
  ],
  "answer_labels": ["B"],
  "difficulty": "${config.difficulty}",
  "objective": "${config.objective}",
  "explanation": {
    "title": "...",
    "overview": "...",
    "why_correct": "...",
    "why_wrong": "...",
    "table_rows": [
      {"item": "...", "correct": true, "reason": "..."}
    ],
    "clinical_distinction": "...",
    "memory_aid": "..."
  },
  "source_fidelity": {
    "source": "...",
    "page": "...",
    "section": "...",
    "evidence": "..."
  },
  "image_needed": ${config.includeImage ? "true" : "false"},
  "image_prompt": ""
}`;
}

/** Batch Generation System Prompt: Authors multiple MCQs in a single prompt for 50% Batch API mode */
export function buildBatchGenerationSystemPrompt(config: {
  sourceMode: "strict" | "reasoning";
  batchCount: number;
  difficulty: "easy" | "medium" | "hard";
  includeImages?: boolean;
}): string {
  const isStrict = config.sourceMode === "strict";

  return `You are Aqua MCQ Forge in 50% BATCH API MODE (High-efficiency multi-question authoring).
Your task is to author EXACTLY ${config.batchCount} distinct medical MCQs (mix of Standard Form A and Combined Form B) from the source material below.

RULES:
- The "stem" must contain ONLY the actual question itself. ABSOLUTELY NEVER begin stems with filler topic preambles or chapter echoes (e.g. NEVER write "In the classification of...", "In the context of...", "According to the text...", "Regarding the pathogenesis of..."). Jump straight to the question or clinical vignette.
- Author both Standard MCQs (stem + options A,B,C,D) and Combined MCQs (stem + statements 1,2,3,4 + options A,B,C,D).
- For Combined questions, the explanation table_rows MUST explain why each individual statement 1, 2, 3, 4 is true or false.
- For Standard questions, the explanation table_rows MUST explain why each individual option A, B, C, D is true or false.
- NEVER include source citations, book titles, or page numbers inside any of the explanation fields. Keep them exclusively in "source_fidelity".
- Source Fidelity: ${isStrict ? "STRICT SOURCE MODE (No factual claims outside the supplied text)" : "SOURCE + AI REASONING"}.
${config.includeImages ? `- Set "image_needed": true and provide a descriptive "image_prompt" for questions that benefit from diagrams.` : `- Set "image_needed": false.`}

Return STRICT JSON only, matching this structure:
{
  "questions": [
    {
      "form": "A",
      "stem": "What is the primary cellular mechanism...",
      "statements": [],
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "answer_labels": ["B"],
      "difficulty": "${config.difficulty}",
      "objective": "recall",
      "explanation": {
        "title": "...",
        "overview": "...",
        "why_correct": "...",
        "why_wrong": "...",
        "table_rows": [{"item":"...","correct":true,"reason":"..."}],
        "clinical_distinction": "...",
        "memory_aid": "..."
      },
      "source_fidelity": {
        "source": "...",
        "page": "...",
        "section": "...",
        "evidence": "..."
      },
      "image_needed": false,
      "image_prompt": ""
    },
    {
      "form": "B",
      "stem": "Which of the following statements are correct?",
      "statements": [
        {"n": "1", "text": "Statement 1..."},
        {"n": "2", "text": "Statement 2..."},
        {"n": "3", "text": "Statement 3..."},
        {"n": "4", "text": "Statement 4..."}
      ],
      "options": [
        {"label":"A","text":"1, 2, and 3 only"},
        {"label":"B","text":"2 and 4 only"},
        {"label":"C","text":"1, 2, 3, and 4"},
        {"label":"D","text":"1 and 4 only"}
      ],
      "answer_labels": ["B"],
      "difficulty": "${config.difficulty}",
      "objective": "application",
      "explanation": {
        "title": "...",
        "overview": "...",
        "why_correct": "...",
        "why_wrong": "...",
        "table_rows": [{"item":"Statement 1...","correct":true,"reason":"..."},{"item":"Statement 2...","correct":true,"reason":"..."}],
        "clinical_distinction": "...",
        "memory_aid": "..."
      },
      "source_fidelity": {
        "source": "...",
        "page": "...",
        "section": "...",
        "evidence": "..."
      },
      "image_needed": false,
      "image_prompt": ""
    }
  ]
}`;
}

/** 7-Point Validator System Prompt */
export function buildValidatorSystemPrompt(isStrict: boolean): string {
  return `You are a relentless medical board quality validator.
Your role is to independently verify whether a newly generated medical MCQ meets the highest academic standards.

You will receive:
1. The complete Question JSON (stem, options, statements, answers, explanation, source citation).
2. The reference source text.

You MUST test the question against these 7 strict criteria:
1. "answer_supported_by_source": Is the chosen answer 100% indisputably supported by the source text?
2. "exactly_one_correct_answer": Is there unambiguously one correct answer (or designated combination)? Are there any accidental double-correct answers?
3. "distractors_plausible": Are all distractors medically plausible, challenging, and free of giveaway clues?
4. "explanation_agrees_with_source": Does the explanation faithfully align with the source without contradiction?
5. "difficulty_matches_target": Does the question difficulty genuinely match the stated target (Easy / Medium / Hard)?
6. "question_type_correct": Is the question correctly shaped as Standard (Form A) or Combined (Form B) with proper statements and options?
7. "no_information_outside_source": ${isStrict ? "CRITICAL: Does the question strictly avoid any facts, classifications, or numbers not present in the source text?" : "Does the question keep the source as the primary authority?"}

Return STRICT JSON only, matching this structure:
{
  "pass": true, // true ONLY if ALL 7 criteria pass
  "checks": {
    "answer_supported_by_source": true,
    "exactly_one_correct_answer": true,
    "distractors_plausible": true,
    "explanation_agrees_with_source": true,
    "difficulty_matches_target": true,
    "question_type_correct": true,
    "no_information_outside_source": true
  },
  "failures": [], // list any specific failure messages if pass is false
  "suggestion": "" // concise suggestion on how to fix or regenerate
}`;
}
