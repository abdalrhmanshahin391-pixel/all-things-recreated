/**
 * Aqua MCQ Forge — AI Prompts and Model Registry
 */

export const AMF_MODELS = {
  google: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (Fastest & Economical)" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended Balanced)" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Deepest Reasoning & Clinical Precision)" },
  ],
  openai: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini (Fast & Low Cost)" },
    { id: "gpt-4.1", label: "GPT-4.1 (Standard High Accuracy)" },
    { id: "gpt-5.4", label: "GPT-5.4 (Advanced Flagship)" },
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
1. The "stem" contains the clinical vignette or introductory question statement.
2. The "statements" array MUST contain 3 to 5 numbered statements (e.g. 1, 2, 3, 4). Each statement is a distinct medical assertion that can be evaluated as true or false.
3. The "options" array contains lettered options A, B, C, D representing combinations of the numbered statements:
   - Examples of combinations: "1 and 3 only", "1, 2, and 4", "All of the above", "None of the above", "2 only".
4. The "answer_labels" must be an array with the single correct option letter (e.g. ["B"]).` : `FORM A (STANDARD QUESTION):
1. The "stem" contains the complete clinical vignette or question sentence.
2. The "statements" array is EMPTY [].
3. The "options" array contains 4 distinct options with labels ["A", "B", "C", "D"].
4. Distractors must be plausible, sophisticated, and reflect common medical misconceptions, but definitively incorrect.
5. The "answer_labels" must be an array with the single correct option letter (e.g. ["C"]).`}

EXPLANATION STRUCTURE RULES (Crucial):
You must supply a structured explanation object with these exact keys:
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
