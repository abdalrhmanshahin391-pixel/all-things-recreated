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
  { id: "clinical_vignette", label: "Clinical Vignette (Case Scenario)" },
  { id: "tricky", label: "Tricky / Red-Herring" },
  { id: "sequence", label: "Sequence / Step Progression" },
  { id: "classification", label: "Classification / Taxonomy" },
  { id: "identification", label: "Identification / Diagnosis" },
] as const;

/**
 * Returns an objective-specific prompt block to inject into the system prompt.
 * This forces the AI to follow the style of the selected question type.
 */
export function buildObjectivePromptBlock(objective: string, includeImage: boolean): string {
  switch (objective) {
    case "recall":
      return `
OBJECTIVE — DIRECT SOURCE RECALL & CORE DEFINITIONS:
- Directly test a key definition, morphological hallmark, criterion, classification, or core mechanism from the textbook source.
- Keep the stem SHORT, CRISP, and PUNCHY (1 to 2 sentences max).
- Options must be concise, focused terms directly derived from the source.
- Fast-paced and direct — do NOT pad with an artificial lengthy patient case.`;

    case "clinical_vignette":
      return `
OBJECTIVE — CLINICAL VIGNETTE (CASE SCENARIO):
- Write a realistic patient case scenario as the stem (age, sex, chief complaint, key history, physical exam findings, lab values if relevant).
- The student must read ALL details to identify the correct answer — no single-sentence shortcut.
- Distractors must each reflect a plausible clinical mistake.
- NEVER start with "In the context of..." — open with the patient: "A 34-year-old female presents with...".
${includeImage ? '- The question MUST explicitly reference the image: "Based on the histological findings shown in the image above..." The image must be REQUIRED to answer.' : ""}`;

    case "tricky":
      return `
OBJECTIVE — CRITICAL THINKING & CONFUSING ANSWERS / COGNITIVE TRAP:
- Design the question so that ONE incorrect option is a highly alluring "Cognitive Trap" — a classic medical misconception or confusing distractor that an unprepared student will mistake as the correct answer.
- Include a specific pivot detail in the stem that definitively invalidates the tempting trap option.
- The correct answer should initially surprise students who skim, but be 100% scientifically defensible.
- In the explanation, include: "⚠️ Cognitive Trap / Critical Distinction: Why Option [X] is tempting, and why it is actually incorrect."
- DO NOT telegraph that this is a trick question.
${includeImage ? '- If including an image, the image must contain a specific visual detail that resolves the ambiguity in the stem.' : ""}`;

    case "identification":
    case "clinical_reasoning":
      return `
OBJECTIVE — IDENTIFICATION / CLINICAL REASONING:
- Frame the question around identifying a diagnosis, mechanism, or structure.
- Provide enough clinical or visual context for the student to reason through.
- Distractors must be genuine diagnostic mimics or related mechanisms.
${includeImage ? '- The image is central to this question. The stem MUST say: "Based on the image shown..." The image should show a pathological finding the student must identify.' : ""}`;

    case "comparison":
      return `
OBJECTIVE — COMPARISON / DIFFERENTIATION:
- The question must require comparing two or more similar medical concepts, drugs, conditions, or mechanisms.
- At least one distractor must swap a feature between the compared entities.
- Correct answer requires knowing the precise distinguishing feature.`;

    case "sequence":
      return `
OBJECTIVE — SEQUENCE / STEP PROGRESSION:
- The question must test understanding of an ordered process (e.g. coagulation steps, cell cycle phases, action potential stages).
- Ask about the correct order, the step that follows a specific event, or what happens if a step is disrupted.`;

    default:
      return "";
  }
}


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

export function buildGenerationSystemPrompt(config: {
  sourceMode: "strict" | "reasoning";
  form: "A" | "B";
  difficulty: "easy" | "medium" | "hard";
  objective: string;
  styleContext?: string;
  includeImage?: boolean;
  forbiddenConcepts?: string[];
  externalLiteratureMode?: boolean;
  imageInfo?: { title: string; description: string; url: string } | null;
  lengthStyle?: "short_direct" | "medium_case" | "long_vignette" | "tricky_trap";
}): string {
  const isStrict = config.sourceMode === "strict";
  const isFormB = config.form === "B";
  const isExternal = !!config.externalLiteratureMode;
  const isShortDirect = config.lengthStyle === "short_direct";
  const isTrickyTrap = config.lengthStyle === "tricky_trap";

  const difficultyDefinitions = {
    easy: "EASY: Direct conceptual understanding, clear one-step physiological reasoning, standard terminology.",
    medium: "MEDIUM: Requires multi-step pathophysiological analysis, distinguishing between two closely related mechanisms or interpreting diagnostic findings.",
    hard: "HARD: Advanced board-level clinical reasoning, challenging alternatives, complex cause-and-effect cascade, or discriminating between subtle clinical and morphological mimics.",
  };

  const objectiveBlock = buildObjectivePromptBlock(config.objective, config.includeImage ?? false);

  const lengthDirective = isShortDirect
    ? `\nLENGTH: SHORT & DIRECT (1-2 sentences max). Test core definitions/hallmarks directly — no padded patient cases.`
    : config.lengthStyle === "long_vignette"
      ? `\nLENGTH: FULL BOARD VIGNETTE (5-7 sentences). Authentic multi-step USMLE case with demographics, vitals, labs.`
      : isTrickyTrap
        ? `\nSTYLE: COGNITIVE TRAP. ONE distractor is an alluring near-miss. Include pivot detail in stem. Explain trap: "⚠️ Cognitive Trap: Why Option [X] is tempting..."`
        : `\nLENGTH: MEDIUM (2-4 sentences). Focused clinical presentation or physiological problem.`;

  const antiRepetitionBlock =
    config.forbiddenConcepts && config.forbiddenConcepts.length > 0
      ? `\nANTI-REPETITION (CRITICAL): Do NOT duplicate any of these already-authored concepts:\n${config.forbiddenConcepts.slice(-30).map((c) => `* ${c}`).join("\n")}\nAuthor a COMPLETELY DIFFERENT mechanism, detail, or clinical scenario.\n`
      : "";

  const externalModeBlock = isExternal
    ? `\nEXTERNAL BOARD MODE (UWorld/USMLE/Robbins): Realistic clinical presentation + multi-step pathophysiology. Conclude explanation with "Educational Objective: [key pearl]". source_fidelity.origin = "external_literature".\n`
    : "";

  const reasoningDirective = isShortDirect
    ? `\nDIRECT SOURCING: Test core definitions, morphological hallmarks, or enzyme cascades. Distractors = real medical terms.\n`
    : `\nREASONING: Require cause-and-effect or clinical synthesis. Distractors = real pathological/physiological mimics.\n`;

  const imageBlock = config.includeImage
    ? config.imageInfo
      ? `\nIMAGE REQUIREMENT (REAL MEDICAL IMAGE ATTACHED):
Title: "${config.imageInfo.title}" | Finding: "${config.imageInfo.description}"
- Stem MUST reference this image (e.g. "Referring to the micrograph above...").
- Student MUST inspect visual findings to answer — do not give away the answer in text.
- Set image_needed: true, image_prompt: "${config.imageInfo.title} - ${config.imageInfo.description}".`
      : `\nIMAGE REQUIREMENT: Pair with an authentic medical image.
- image_needed: true
- image_prompt: specific 3-5 word Wikimedia Commons search (e.g. "coagulative necrosis kidney histology")
- Stem MUST reference the image. Anti-spoiler: correct answer must NOT be visible as text on the image.`
    : `\nNO IMAGE: Set image_needed: false and image_prompt: "". NEVER reference any image.`;

  return `You are Aqua MCQ Forge — board-exam standard medical MCQ author.
Author ONE pristine ${config.difficulty.toUpperCase()} medical MCQ from the supplied source.

CONFIG:
- Form: ${isFormB ? "COMBINED B (numbered statements 1,2,3,4 → combination options A,B,C,D)" : "STANDARD A (stem + 4 options A,B,C,D)"}
- Difficulty: ${config.difficulty.toUpperCase()} — ${difficultyDefinitions[config.difficulty]}
- Objective: ${config.objective}
- Source Mode: ${isStrict ? "STRICT (no facts outside source)" : "SOURCE + AI REASONING"}
${config.styleContext ? `\nSTYLE REF:\n${config.styleContext.slice(0, 1000)}\n` : ""}
${lengthDirective}
${antiRepetitionBlock}${externalModeBlock}${reasoningDirective}
${objectiveBlock ? `\n${objectiveBlock}\n` : ""}
${imageBlock}

STEM RULES:
- NEVER start with: "In the classification of", "In the context of", "In the scope of", "According to", "Regarding", "Based on the excerpt". Jump straight into the question or vignette.
- NEVER include section numbers, chapter numbers, or page numbers in explanation fields.
${isShortDirect ? "- Stem: exactly 1-2 sentences." : ""}

${isFormB ? `FORM B: statements array MUST have 3-5 items [{n,text}]. Options = combinations (e.g. "1 and 3 only"). answer_labels = single letter.` : `FORM A: 4 options A-D. Distractors = plausible medical mimics. answer_labels = single letter.`}

EXPLANATION KEYS (required): title (3-5 words) | overview (3-4 sentences) | why_correct (2-3 sentences) | why_wrong (1-2 sentences per wrong option) | table_rows (one per ${isFormB ? "statement 1-4" : "option A-D"}: {item, correct:bool, reason}) | clinical_distinction (2-3 lines) | memory_aid (1 mnemonic line)

Return STRICT JSON only:
{"form":"${config.form}","stem":"...","statements":[${isFormB ? `{"n":"1","text":"..."}` : ""}],"options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],"answer_labels":["B"],"difficulty":"${config.difficulty}","objective":"${config.objective}","explanation":{"title":"...","overview":"...","why_correct":"...","why_wrong":"...","table_rows":[{"item":"...","correct":true,"reason":"..."}],"clinical_distinction":"...","memory_aid":"..."},"source_fidelity":{"source":"...","page":"...","section":"...","evidence":"...","origin":"${isExternal ? "external_literature" : "textbook_pdf"}"},"image_needed":${config.includeImage ? "true" : "false"},"image_prompt":""}`;
}

/** Batch Generation System Prompt: Authors multiple MCQs in a single prompt for 50% Batch API mode */
export function buildBatchGenerationSystemPrompt(config: {
  sourceMode: "strict" | "reasoning";
  batchCount: number;
  difficulty: "easy" | "medium" | "hard";
  includeImages?: boolean;
}): string {
  const isStrict = config.sourceMode === "strict";

  return `You are Aqua MCQ Forge in 50% BATCH API MODE. Author EXACTLY ${config.batchCount} distinct medical MCQs (mix of Form A and Form B) from the source material.

RULES:
- Stem: NEVER start with "In the classification of", "In the context of", "According to the text", "Regarding the pathogenesis of". Jump straight to the question or clinical vignette.
- Mix Standard MCQs (Form A: stem + options A,B,C,D) and Combined MCQs (Form B: stem + statements 1,2,3,4 + combination options A,B,C,D).
- For Form B: explanation table_rows explain each statement 1-4. For Form A: explain each option A-D.
- NEVER include section/chapter numbers or page refs in explanation fields.
- Source Fidelity: ${isStrict ? "STRICT SOURCE MODE (zero outside claims)" : "SOURCE + AI REASONING"}.
${config.includeImages ? `- Set image_needed: true and image_prompt (3-5 word Wikimedia search) for questions benefiting from images.` : `- Set image_needed: false for all.`}

Return STRICT JSON only:
{"questions":[{"form":"A","stem":"...","statements":[],"options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],"answer_labels":["B"],"difficulty":"${config.difficulty}","objective":"recall","explanation":{"title":"...","overview":"...","why_correct":"...","why_wrong":"...","table_rows":[{"item":"...","correct":true,"reason":"..."}],"clinical_distinction":"...","memory_aid":"..."},"source_fidelity":{"source":"...","page":"...","section":"...","evidence":"..."},"image_needed":false,"image_prompt":""}]}`;
}

/** Inline fast validator — checks structural integrity without a 2nd AI call */
export function inlineValidateQuestion(q: any): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!q || typeof q !== "object") return { pass: false, failures: ["Parsed JSON is null or not an object"] };

  const stem = String(q.stem ?? "").trim();
  if (!stem || stem.length < 15) failures.push("Stem is missing or too short");

  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length < 4) failures.push(`Too few options: got ${options.length}, need 4`);

  const answerLabels = Array.isArray(q.answer_labels) ? q.answer_labels : [];
  if (answerLabels.length === 0) failures.push("No answer_labels defined");

  const validLabels = options.map((o: any) => String(o.label ?? ""));
  const invalidAnswers = answerLabels.filter((a: string) => !validLabels.includes(a));
  if (invalidAnswers.length > 0) failures.push(`answer_labels [${invalidAnswers}] not in options`);

  const explanation = q.explanation ?? {};
  if (!String(explanation.overview ?? "").trim()) failures.push("Explanation overview is empty");

  // Preamble check — reject stems with banned openers
  const bannedOpeners = [
    "in the classification",
    "in the context",
    "in the scope",
    "in the framework",
    "according to",
    "regarding the",
    "based on the excerpt",
  ];
  if (bannedOpeners.some((b) => stem.toLowerCase().startsWith(b))) {
    failures.push("Stem starts with a forbidden preamble opener");
  }

  return { pass: failures.length === 0, failures };
}
