// MCQ Generator 1.24 Pro — Standalone Engine Server Functions
// Dedicated, restricted-access medical MCQ engine with custom API key management,
// multi-provider vision processing, Mode 1 & 2 combination logic, AquavisionX explanations,
// Batch API (50% discount) for both extraction & solving, and bulk missing distractor filling.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const ENGINE_NAME = "MCQ generator 1.24 Pro";

export const SUPPORTED_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Gemini Flash lite 2.5", provider: "gemini", tier: "Fastest / Budget" },
  { id: "gemini-2.5-flash", label: "Gemini Flash 2.5", provider: "gemini", tier: "High Balance" },
  { id: "gemini-2.5-pro", label: "Gemini pro 2.5", provider: "gemini", tier: "Deep Reasoning" },
  { id: "gpt-4o-mini", label: "GPT 4.1 mini", provider: "openai", tier: "Fast & Precise" },
  { id: "gpt-4o", label: "GPT 4.1", provider: "openai", tier: "High Intelligence" },
] as const;

export type SupportedModelId = (typeof SUPPORTED_MODELS)[number]["id"];

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return { supabase, userId, role: "admin" };
  const { data: isQa } = await supabase.rpc("has_role", { _user_id: userId, _role: "qa" });
  if (isQa) return { supabase, userId, role: "qa" };
  throw new Error("Restricted Access: Administrator or QA clearance required for MCQ Generator 1.24 Pro.");
}

// ── JSON Helpers ─────────────────────────────────────────────────────────────
function stripFences(text: string): string {
  return String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseJsonObject(text: string): any | null {
  const s = stripFences(text);
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  const lb = s.indexOf("{"), rb = s.lastIndexOf("}");
  if (lb !== -1 && rb > lb) {
    try { return JSON.parse(s.slice(lb, rb + 1)); } catch {}
  }
  return null;
}

// ── Multi-Provider AI Caller ──────────────────────────────────────────────────
interface CallAiOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string; // JPEG base64
  openaiApiKey?: string;
  geminiApiKey?: string;
  jsonMode?: boolean;
  temperature?: number;
}

async function callUnifiedAiInternal(options: CallAiOptions): Promise<string> {
  const { model, systemPrompt, userPrompt, imageBase64, openaiApiKey, geminiApiKey, jsonMode = true, temperature = 0 } = options;
  const isGemini = model.startsWith("gemini");

  if (isGemini) {
    const key = geminiApiKey?.trim();
    if (!key) throw new Error("No Gemini API key provided for MCQ Generator 1.24 Pro.");

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64,
        },
      });
    }
    parts.push({ text: userPrompt });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: temperature ?? 0,
          responseMimeType: jsonMode ? "application/json" : "text/plain",
        },
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status}): ${json?.error?.message || JSON.stringify(json)}`);
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text;
  } else {
    // OpenAI provider
    const key = openaiApiKey?.trim();
    if (!key) throw new Error("No OpenAI API key provided for MCQ Generator 1.24 Pro.");

    const actualModel = model === "gpt-4.1-mini" ? "gpt-4o-mini" : model === "gpt-4.1" ? "gpt-4o" : model;

    const userContent: any[] = [];
    userContent.push({ type: "text", text: userPrompt });
    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
          detail: "high",
        },
      });
    }

    const body: any = {
      model: actualModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: temperature ?? 0,
    };
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`OpenAI API error (${response.status}): ${json?.error?.message || JSON.stringify(json)}`);
    }

    const text = json?.choices?.[0]?.message?.content || "";
    return text;
  }
}

async function callUnifiedAi(options: CallAiOptions): Promise<string> {
  const maxRetries = 4;
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await callUnifiedAiInternal(options);
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isTransient =
        msg.includes("429") ||
        msg.includes("Rate limit") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("overloaded") ||
        msg.includes("fetch failed");

      if (attempt <= maxRetries && isTransient) {
        let waitMs = 1500 * Math.pow(2, attempt - 1);
        const match = msg.match(/in\s+([\d\.]+)(ms|s)/i);
        if (match) {
          const num = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          waitMs = Math.max(waitMs, unit === "s" ? num * 1000 + 500 : num + 400);
        }
        console.warn(`[AI Call 429 Retry ${attempt}/${maxRetries}] Waiting ${(waitMs / 1000).toFixed(2)}s due to transient limit: ${msg}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw err;
      }
    }
  }
}

export interface ExtractedQuestion {
  id: string;
  pageNumber: number;
  number: string;
  questionType: "ordinary" | "combination" | "multiple_answer";
  stem: string;
  options: Array<{ letter: string; text: string; is_correct?: boolean }>;
  hasMissingOptions: boolean;
  missingOptionsCount: number;
  detectedAnswer: string | null;
  comboSets: string[][];
  originalCombinations: Array<{ letter: string; text: string }>;
  needsReview?: boolean;
  reviewReason?: string | null;
  isApproved?: boolean;
  isDuplicate?: boolean;
  statements?: Array<{ number?: number; text: string }>;
}

export interface BatchExtractionJob {
  batchId: string;
  status: "validating" | "in_progress" | "completed" | "failed" | "expired" | "cancelling" | "cancelled";
  totalPages: number;
  createdAt: string;
  requestCounts: { total: number; completed: number; failed: number };
  outputFileId?: string | null;
  errorFileId?: string | null;
}

export interface SolvedQuestionState extends ExtractedQuestion {
  solveStatus: "unsolved" | "solving" | "solved" | "error";
  modelAnswer?: string | null;
  clinicalExplanation?: string | null;
  confidenceScore?: number;
  citations?: string[];
  aquavisionBadge?: string;
  verifiedKeyMatch?: boolean;
}

function buildExtractionSystemPrompt(combinationMode: "mode1_keep_original" | "mode2_convert_multiple", customInstructions?: string): string {
  return `You are an expert medical examination layout analyzer reading a high-resolution image of an exam paper.
Your task is to transcribe EVERY SINGLE question from this page VERBATIM with 100% accuracy, zero omission, and zero cross-contamination.

CRITICAL READING RULES — READ CAREFULLY:

1. STRICT SEQUENTIAL QUESTION ORDER & HEADER IMMUNITY (NEVER SKIP TOP QUESTIONS):
   - Exam pages frequently contain top headers such as:
     "Department of Infectious Diseases", "General Medicine V-a", "2025", "Test 8", "Quiz 2", "Midterm".
   - CRITICAL: "Test 8" is the TEST TITLE/METADATA, NOT A QUESTION NUMBER!
   - The questions start IMMEDIATELY below the header text at Question #1: e.g. "1. Clinical stages of Rabies are:".
   - ALWAYS start extracting from Question #1!
   - You MUST extract EVERY SINGLE numbered question in sequence: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14...
   - Skipping questions (e.g. skipping 1, 2, 3, 4, 5, 6, 7 because of "Test 8") is a FATAL ERROR.
   - If the very top of the page has orphan fragment lines continuing from the previous page, preserve them as an orphan entry.

2. STRICT QUESTION BOUNDARIES (ZERO OPTION BLEEDING):
   - Question #N begins at its bold question number marker (e.g. "1.", "2.", "3.", "4.").
   - Question #N ENDS immediately before the next question number marker begins.
   - Everything between Question #N and Question #(N+1) belongs EXCLUSIVELY to Question #N.
   - NEVER attach, copy, or bleed options or statements from Question #N into Question #(N+1)!

3. HORIZONTAL 2x2 GRID READING (THIS IS A SINGLE-COLUMN PAGE WITH 2x2 GRIDS):
   - This exam paper is a SINGLE vertical column of questions. Do NOT split the page into two vertical page-wide columns!
   - Inside an individual question, items are often printed side-by-side to save vertical space:
     • STATEMENTS 2x2 GRID:
       Row 1: "1. Vidal reaction"            "3. urine culture"
       Row 2: "2. blood culture"             "4. stool culture"
       -> Transcribe all 4 in numerical order: ["1. Vidal reaction", "2. blood culture", "3. urine culture", "4. stool culture"]
     • CHOICES 2x2 GRID:
       Row 1: "a) sonnei"                    "c) flexneri"
       Row 2: "b) dysenteriae"               "d) boydii"
       -> Transcribe all 4 choices: A: sonnei, B: dysenteriae, C: flexneri, D: boydii.

4. COMBINATION QUESTION PROTECTION (CRITICAL — DO NOT DROP COMBINATION CHOICES):
   - In questions like:
     "12. Complications of Influenza are:
      1. bacterial pneumonia     3. sinusitis, otitis
      2. necrotic tracheobronchitis   4. meningitis
      a) 1,2,3    b) 1,3    c) 2,4    d) all mentioned"
     • The numbered items (1, 2, 3, 4) MUST go into the "statements" array:
       ["1. bacterial pneumonia", "2. necrotic tracheobronchitis", "3. sinusitis, otitis", "4. meningitis"]
     • The lettered choices (a, b, c, d) MUST go into the "options" array:
       [{"letter": "A", "text": "1,2,3"}, {"letter": "B", "text": "1,3"}, {"letter": "C", "text": "2,4"}, {"letter": "D", "text": "all mentioned"}]
     • NEVER convert statements (bacterial pneumonia, etc.) into options A, B, C, D!
     • NEVER drop or omit the lettered choices (a, b, c, d)!
     • Set question_type: "combination".

5. ORDINARY MCQ vs COMBINATION MCQ (STRICT DEFINITION):
   - ORDINARY MCQ:
     If choices A, B, C, D contain clinical terms, diseases, symptoms, or sentences (e.g. "a) all the above", "b) hypovolemic", "c) none of the above", "d) infectious-toxic"):
     -> THIS IS AN ORDINARY MCQ.
     -> NEVER turn clinical options into numbered statements!
     -> Stem is the question prompt. Choices are A, B, C, D. Set question_type: "ordinary".

6. BOTTOM MARGIN TRUNCATION GUARDRAIL:
   - If a question at the very bottom of the page is cut off by the photo edge (e.g. "14. Choose the right statement for Plague:" with no choices visible below it):
     • Extract the stem text.
     • Leave "options": [] and "statements": [].
     • Set "needs_review": true and "review_reason": "Question cut off at bottom margin of image".
     • NEVER invent or hallucinate choices!

7. PRESERVE VERBATIM ACCURACY:
   - Transcribe exact spelling, medical terms, numbers, symbols (%, ±, µg, /), and units.
   - Do NOT merge option letters into text (e.g. "c)all mentioned" must have text "all mentioned", NOT "call mentioned").

${combinationMode === "mode1_keep_original"
  ? `COMBINATION FORMAT (MODE 1 — KEEP ORIGINAL):
   - Put combination codes directly into "options": [{"letter":"A","text":"1,2,3"},{"letter":"B","text":"1,3"}...]
   - Set question_type: "combination"
   - Also record in "printed_combinations"`
  : `COMBINATION FORMAT (MODE 2 — CONVERT TO MULTIPLE ANSWERS):
   - The numbered statements become the "options" (A: statement 1, B: statement 2...)
   - Set question_type: "multiple_answer"
   - Preserve original codes in "printed_combinations"`
}

VISUAL ANTI-ERROR CHECKLIST:
❌ NEVER skip questions at the top of the page (check for 1, 2, 3, 4, 5, 6, 7, 8...).
❌ NEVER confuse header titles (e.g. "Test 8") with question numbers.
❌ NEVER convert combination numbered statements (1, 2, 3, 4) into options A, B, C, D.
❌ NEVER drop combination choices like "a) 1,2,3  b) 1,3  c) 2,4  d) all mentioned".
❌ NEVER bleed options from one question into another.
❌ NEVER invent choices for questions cut off at the bottom margin.
✅ Every question with a number MUST have its own entry in the output array in sequential order.
✅ Combination: "statements" contains 1..4, "options" contains A..D combination codes.
✅ Ordinary: "statements" is empty [], "options" contains A..D text choices verbatim.
${customInstructions ? `\nSpecial User Instructions:\n${customInstructions}\n` : ""}

Return STRICT JSON:
{
  "questions": [
    {
      "number": "1",
      "question_type": "ordinary|combination|multiple_answer",
      "stem": "question prompt text verbatim without options or statement list",
      "statements": [
        "1. First numbered statement verbatim",
        "2. Second numbered statement verbatim",
        "3. Third numbered statement verbatim",
        "4. Fourth numbered statement verbatim"
      ],
      "options": [
        { "letter": "A", "text": "choice A text verbatim" },
        { "letter": "B", "text": "choice B text verbatim" },
        { "letter": "C", "text": "choice C text verbatim" },
        { "letter": "D", "text": "choice D text verbatim" }
      ],
      "printed_combinations": [
        { "letter": "A", "text": "1,2" }
      ],
      "detected_answer": null,
      "needs_review": false,
      "review_reason": null,
      "is_approved": true
    }
  ]
}`;
}

export function normalizeExtractedQuestion(q: any, pageNumber: number, idx: number): ExtractedQuestion {
  const qNum = String(q.number || idx + 1).trim();
  let stem = String(q.stem || "").trim();
  let rawOptions = Array.isArray(q.options) ? q.options : [];

  const rawStatements = Array.isArray(q.statements)
    ? q.statements.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];

  const printedCombos = Array.isArray(q.printed_combinations)
    ? q.printed_combinations.map((c: any) => ({
        letter: String(c.letter || "").toUpperCase(),
        text: String(c.text || "").trim(),
      }))
    : [];

  // If options array was left empty by the model but printed_combinations exists (e.g. combination question)
  if (rawOptions.length === 0 && printedCombos.length > 0) {
    rawOptions = printedCombos;
  }

  let options = rawOptions
    .map((o: any, oIdx: number) => {
      let letter = String(o.letter || String.fromCharCode(65 + oIdx)).toUpperCase();
      let text = String(o.text || o.body || "").trim();
      // Auto-clean common vision/OCR letter merge typos (e.g. "call mentioned" -> "all mentioned")
      text = text
        .replace(/^[a-d]\s*all\s+mentioned\b/i, "all mentioned")
        .replace(/^[a-d]all\s+mentioned\b/i, "all mentioned")
        .replace(/^[a-d]\s*all\s+(?:the\s+)?above\b/i, "all of the above")
        .replace(/^[a-d]all\s+(?:the\s+)?above\b/i, "all of the above")
        .replace(/^[a-d]\s*none\s+of\s+the\s+above\b/i, "none of the above")
        .replace(/^[a-d]none\s+of\s+the\s+above\b/i, "none of the above");
      return { letter, text };
    })
    .filter((o: any) => o.text);

  // Merge statements into stem if not already present
  if (rawStatements.length > 0) {
    if (!/1[\.\s].+2[\.\s]/s.test(stem)) {
      stem = `${stem}\n${rawStatements.join("\n")}`.trim();
    }
    q.question_type = "combination";
  }

  // Fallback: If options is still empty, check if stem accidentally absorbed options 1. ... 2. ... 3. ... 4.
  // e.g. "All the following are interstitial lung diseases, except: 1. Exogenous... 2. Fibrosing..."
  if (options.length === 0) {
    const inlineMatch = stem.match(/^(.*?)[:\?]\s*(?:1\.\s*(.*?)\s*2\.\s*(.*?)\s*3\.\s*(.*?)\s*4\.\s*(.*?))$/s);
    if (inlineMatch) {
      const cleanPrompt = inlineMatch[1].trim() + (stem.includes("?") ? "?" : ":");
      options = [
        { letter: "A", text: inlineMatch[2].trim() },
        { letter: "B", text: inlineMatch[3].trim() },
        { letter: "C", text: inlineMatch[4].trim() },
        { letter: "D", text: inlineMatch[5].trim() },
      ];
      stem = cleanPrompt;
      q.question_type = "ordinary";
    }
  }

  // Detect combination options: at least 2 option texts are purely numeric codes (e.g. "1,2,3", "2,4").
  // We use >= 2 (not "every") so that if one option is "All of the above" and the rest are numeric
  // codes, we still correctly classify the question as a combination type.
  const numericComboCount = options.filter((o: { letter: string; text: string }) =>
    /^[\d\s.,;+]+$/.test(o.text.trim())
  ).length;
  const isComboOptions = options.length >= 2 && numericComboCount >= 2;


  // ── NEW FIX ────────────────────────────────────────────────────────────────
  // Detect when the model extracted NUMBERED STATEMENTS as if they were lettered options.
  // Rule (user-specified):
  //   • If option LETTERS are numeric ("1","2","3","4") → these are statements, not options
  //   • If option TEXT starts with "1." / "2." / "3." / "4." → also statements, not options
  // In both cases: move them into the stem, clear options, set combination type, flag for review.
  const optionsHaveNumericLetters =
    !isComboOptions &&
    options.length >= 2 &&
    options.every((o: { letter: string; text: string }) => /^\d+$/.test(o.letter.trim()));

  const optionsHaveNumericTextPrefix =
    !isComboOptions &&
    !optionsHaveNumericLetters &&
    options.length >= 2 &&
    options.every((o: { letter: string; text: string }) => /^[1-4][\.\)]\s*/.test(o.text.trim()));

  // Bug Fix 2: Detect MIXED (partially combo) options — some look like number codes (e.g. "2,3", "1.4"),
  // some are plain text. This is a malformed question that should be flagged for review.
  const comboOptionPattern = /^[\d\s.,;+]+$/;
  const hasPartialComboOptions =
    !isComboOptions &&
    !optionsHaveNumericLetters &&
    !optionsHaveNumericTextPrefix &&
    options.length >= 2 &&
    options.some((o: { letter: string; text: string }) => comboOptionPattern.test(o.text.trim())) &&
    options.some((o: { letter: string; text: string }) => !comboOptionPattern.test(o.text.trim()));

  // Check for Orphaned / Incomplete Combination Fragment (User Issue 4)
  // Options are combination numbers ("1.3.4", "2.3.4", etc.) but the question has no real text statements.
  const stemHasStatements = /1[\.\s].+2[\.\s]/s.test(stem);

  // Detect when model confused options (e.g. "1.3.4") for statements — rawStatements[] is populated
  // but every extracted statement is itself just a number code, not real text.
  const statementsAreJustNumberCodes =
    rawStatements.length > 0 &&
    rawStatements.every((s: string) => comboOptionPattern.test(s.replace(/^\d+[\.\s]+/, "").trim()));

  // A combination question has REAL statements only if statements exist and are not just number codes.
  const hasRealStatements = rawStatements.length > 0 && !statementsAreJustNumberCodes;

  let needsReview = Boolean(q.needs_review);
  let reviewReason = q.review_reason ? String(q.review_reason) : null;
  let isApproved = q.is_approved !== false && !needsReview;

  // Apply the numbered-statements-as-options fix AFTER needsReview is declared
  if (optionsHaveNumericLetters || optionsHaveNumericTextPrefix) {
    // Move these pseudo-options into the stem as numbered statements so they are visible
    const movedStatements = options.map((o: { letter: string; text: string }, idx: number) => {
      const num = optionsHaveNumericLetters ? o.letter : String(idx + 1);
      const text = o.text.replace(/^[1-4][\.\)]\s*/, "").trim();
      return `${num}. ${text}`;
    });
    if (!/1[\.\s].+2[\.\s]/s.test(stem)) {
      stem = `${stem}\n${movedStatements.join("\n")}`.trim();
    }
    options = []; // The real combination options (e.g. "All the above", "1,2,3") were not captured
    q.question_type = "combination";
    needsReview = true;
    isApproved = false;
    reviewReason =
      "Numbered statements (1, 2, 3, 4) were incorrectly extracted as lettered options. " +
      "This is a combination question but the actual options (e.g. 'All the above', '1,2,3') were not captured. " +
      "Manual review and re-extraction required.";
  }

  // Flag as orphaned fragment when options are all combo codes but there are no real text statements.
  // Covers three scenarios:
  //   (a) No statements extracted at all AND stem has no numbered list
  //   (b) Statements extracted but they are themselves just number codes (model confused options for statements)
  //   (c) Stem has embedded statement-like text but statements[] was never extracted separately
  if (isComboOptions && (!hasRealStatements || statementsAreJustNumberCodes)) {
    needsReview = true;
    isApproved = false;
    reviewReason =
      "Incomplete combination fragment: choices reference numbered statements (1, 2, 3...) that are missing from this question. The numbered statements must appear on a previous page or were not extracted. Manual review required.";
  }

  // Additional check: combo options + stem has embedded statement text but statements[] empty
  // (model merged everything into stem instead of splitting into statements array)
  if (isComboOptions && hasRealStatements && stemHasStatements && rawStatements.length === 0) {
    needsReview = true;
    isApproved = false;
    reviewReason =
      "Combination question: numbered statements appear embedded in the stem but were not extracted into the statements array. Please verify and edit to separate the stem from the numbered statements.";
  }

  // Bug Fix 2 (continued): flag mixed options questions for review.
  if (hasPartialComboOptions) {
    needsReview = true;
    isApproved = false;
    reviewReason =
      "Mixed options detected: some choices appear to be numbered statement references (e.g. 1,3 or 2.4) while others are plain text answers. This may be a combination question with missing statements or a misclassification. Manual review required.";
  }

  const isTwoChoice = options.length === 2 && options.some((o: any) => /^(true|false|yes|no)$/i.test(o.text));
  const hasMissingOptions = options.length < 4 && !isTwoChoice;
  const missingOptionsCount = hasMissingOptions ? 4 - options.length : 0;

  return {
    id: `q-p${pageNumber}-${idx + 1}-${Date.now().toString(36)}`,
    pageNumber,
    number: qNum,
    questionType:
      (q.question_type as any) ||
      (isComboOptions ? "combination" : printedCombos.length > 0 ? "combination" : "ordinary"),
    stem,
    options,
    hasMissingOptions,
    missingOptionsCount,
    detectedAnswer: q.detected_answer ? String(q.detected_answer).trim() : null,
    comboSets: printedCombos.map((c: any) => c.text.match(/\d+/g) || []),
    originalCombinations: printedCombos,
    needsReview,
    reviewReason,
    isApproved,
  };
}

// ── 2-Pass Vision Extraction Strategy ────────────────────────────────────────

async function discoverPageQuestionsInternal(opts: {
  pageNumber: number;
  imageJpegBase64: string;
  model: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}): Promise<{ questionNumbers: string[]; pageStartsWithOrphan: boolean; orphanType: string | null }> {
  const { pageNumber, imageJpegBase64, model, openaiApiKey, geminiApiKey } = opts;
  const systemPrompt = `You are an expert visual document layout analyzer examining high-resolution images of medical examination papers.
Your task is to analyze this page AS A VISUAL DOCUMENT:
  (a) Discover EVERY real question number printed on it based on its visual layout, spatial position, bold headers, and numbering hierarchy across all columns.
  (b) Detect if the page BEGINS with an orphan fragment (the tail of a split question from the previous page).

VISUAL ANALYSIS RULES:
1. Treat the page as a VISUAL DOCUMENT. Do NOT rely on linear OCR text stream order.
2. Read based on visual layout and spacing. If multi-column, inspect column 1 top-to-bottom first, then column 2 top-to-bottom.
3. Identify question number headings (e.g. ["1", "2", "3"]) based on visual numbering, bold headings, and spatial structure.
4. Do NOT confuse numbered combination statements ("1.", "2.", "3.", "4." belonging to a question) with standalone question numbers.
5. Check margins, headers, and column tops carefully.

ORPHAN DETECTION (critical):
- Inspect the very top of the page visually.
- If the page begins with a numbered statement (e.g. "4. positive reaction to treatment") or combination choices (e.g. "a) 1,3  b) 2,3,4") without an introductory question stem → this is the tail of a split question from the preceding page. Set "page_starts_with_orphan_fragment": true, "orphan_type": "combination_tail".
- If the page begins with a proper question stem with its own question number → set "page_starts_with_orphan_fragment": false.

Return STRICT JSON:
{
  "question_numbers": ["5", "6", "7"],
  "page_starts_with_orphan_fragment": false,
  "orphan_type": null
}`;

  const userPrompt = `Visually analyze Page ${pageNumber} of this exam document. Identify all question numbers based on visual layout, spacing, and headings across columns. Detect if the page starts with an orphan fragment.`;

  try {
    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      imageBase64: imageJpegBase64,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
      temperature: 0,
    });
    const parsed = parseJsonObject(rawOutput);
    const nums = Array.isArray(parsed?.question_numbers)
      ? parsed.question_numbers.map((n: any) => String(n).replace(/[^\d\w]/g, "").trim()).filter(Boolean)
      : [];
    const pageStartsWithOrphan = Boolean(parsed?.page_starts_with_orphan_fragment);
    const orphanType = parsed?.orphan_type ? String(parsed.orphan_type) : null;
    return { questionNumbers: nums, pageStartsWithOrphan, orphanType };
  } catch (err) {
    console.warn(`[Discovery] failed for page ${pageNumber}:`, err);
    return { questionNumbers: [], pageStartsWithOrphan: false, orphanType: null };
  }
}

async function extractSingleQuestionFocused(opts: {
  pageNumber: number;
  imageJpegBase64: string;
  questionNumber: string;
  nextQuestionNumber?: string | null;
  combinationMode: "mode1_keep_original" | "mode2_convert_multiple";
  model: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  customInstructions?: string;
  idx?: number;
}): Promise<ExtractedQuestion | null> {
  const { pageNumber, imageJpegBase64, questionNumber, nextQuestionNumber, combinationMode, model, openaiApiKey, geminiApiKey, customInstructions, idx = 0 } = opts;

  const boundaryRule = nextQuestionNumber
    ? `VISUAL QUESTION BOUNDARY:
   - Question #${questionNumber} starts at its visible question number header.
   - Question #${questionNumber} ENDS immediately before the Question #${nextQuestionNumber} visual header begins.
   - Everything between Question #${questionNumber} and Question #${nextQuestionNumber} belongs EXCLUSIVELY to Question #${questionNumber}.`
    : `VISUAL QUESTION BOUNDARY:
   - Question #${questionNumber} is the LAST question on this page/column.
   - Everything from Question #${questionNumber}'s header to the end of the section belongs EXCLUSIVELY to Question #${questionNumber}.`;

  const systemPrompt = `You are an expert visual document reader analyzing a high-resolution image of a medical examination paper.
YOUR MISSION: Read and extract Question #${questionNumber} from this visual document based strictly on its visual layout, spacing, indentation, and position.

${boundaryRule}

CORE VISUAL EXTRACTION DIRECTIVES:
1. TREAT AS A VISUAL DOCUMENT:
   - Read the question and answer options based on their visual layout and position.
   - Do NOT rely on OCR text order or linear text streams.
2. KEEP QUESTION STEM COMPLETELY SEPARATE FROM ANSWER OPTIONS:
   - The "stem" field MUST contain ONLY the question prompt / scenario.
   - NEVER move or merge an answer option into the question text.
   - NEVER put the question stem into option fields.
   - Keep each question stem completely separate from its answer options.
   - Options are visually indented, lettered blocks (A, B, C, D or a, b, c, d) located below or beside the stem.
3. PRESERVE EXACT ORIGINAL WORDING & FORMATTING:
   - Preserve the exact wording, numbering, symbols, medical terms, numbers, and units verbatim.
   - Preserve symbols (%, ±, µg, /, :, -, >, <) exactly as printed.
   - Do NOT rephrase, correct spelling, modernize, or interpret medical terminology.
4. UNIFORM COMBINATION QUESTION HANDLING:
   - Examine answer options visually:
     • If options contain numeric combinations (e.g. "1,2" or "1.3.4" or "2,3,4") or "All of the above" alongside numbers → COMBINATION QUESTION.
     • For combination questions, the numbered statements (1. ..., 2. ..., 3. ..., 4. ...) appear as a visual list between the stem and the options, or in an adjacent column.
     • You MUST extract every numbered statement into the "statements" array verbatim.
     • Do NOT merge numbered statements into options, and do NOT omit them.
${combinationMode === "mode1_keep_original"
  ? `   • MODE 1 (KEEP ORIGINAL): Put combination choices directly into "options" [{"letter":"A","text":"1,2"},{"letter":"B","text":"1.3.4"}...] and set question_type: "combination".`
  : `   • MODE 2 (CONVERT): Numbered statements become "options" (A: statement 1, B: statement 2...) and set question_type: "multiple_answer". Original combination codes go to "printed_combinations".`
}
5. NO GUESSING / UNCLEAR TEXT:
   - If any text, term, number, option, or statement is obscured, blurry, cut off at a margin, or visually ambiguous: DO NOT GUESS.
   - Mark "needs_review": true and explain the exact unclear visual element in "review_reason".

VISUAL ANTI-ERROR CHECKLIST:
❌ NEVER move an answer option into the question text.
❌ NEVER put the question stem into the options array.
❌ NEVER duplicate one option's text into other options — all 4 options must be distinct.
❌ NEVER use numbered statement digits (1, 2, 3, 4) as option letters.
❌ NEVER omit the numbered statements of a combination question.
❌ NEVER invent or hallucinate options that are not visually present.
✅ Keep stem, statements, and options in their strictly separate visual fields.
✅ Preserve exact symbols, numbers, units, and medical terms verbatim.
✅ If any part is unclear: do NOT guess; mark needs_review: true.
${customInstructions ? `\nSpecial User Instructions:\n${customInstructions}\n` : ""}

Return STRICT JSON:
{
  "question": {
    "number": "${questionNumber}",
    "question_type": "ordinary|combination|multiple_answer",
    "stem": "question prompt verbatim — separate from options and statements",
    "statements": [
      "1. First statement verbatim",
      "2. Second statement verbatim",
      "3. Third statement verbatim",
      "4. Fourth statement verbatim"
    ],
    "options": [
      { "letter": "A", "text": "choice A text verbatim" },
      { "letter": "B", "text": "choice B text verbatim" },
      { "letter": "C", "text": "choice C text verbatim" },
      { "letter": "D", "text": "choice D text verbatim" }
    ],
    "printed_combinations": [
      { "letter": "A", "text": "1,2" }
    ],
    "detected_answer": null,
    "needs_review": false,
    "review_reason": null,
    "is_approved": true
  }
}`;

  const userPrompt = `Visually inspect Page ${pageNumber} of this exam document. Locate Question #${questionNumber} by its visual layout and position. Extract its stem, statements, and options as separate visual blocks verbatim. Do NOT move any options into the question stem. Preserve exact medical terms, numbers, units, and symbols. If any part is unclear, mark needs_review: true.`;

  try {
    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      imageBase64: imageJpegBase64,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
      temperature: 0,
    });

    const parsed = parseJsonObject(rawOutput);
    const qObj = parsed?.question || (Array.isArray(parsed?.questions) ? parsed.questions[0] : null);
    if (!qObj) return null;

    let normalized = normalizeExtractedQuestion(qObj, pageNumber, idx);

    // ── Auto-Retry if incomplete or flagged ──────────────────────────────────
    if (normalized.needsReview || (normalized.options.length < 4 && !normalized.isApproved)) {
      try {
        const retryPrompt = `FOCUSED VISUAL INSPECTION FOR QUESTION #${questionNumber}:
Locate Question #${questionNumber} on Page ${pageNumber} using its visual layout, spacing, and position across all columns.
Ensure the question stem is completely separate from answer options.
Preserve exact wording, numbering, symbols, and units. If combination question, capture all numbered statements (1, 2, 3, 4).
Do NOT guess unclear text — mark needs_review: true if ambiguous.
${boundaryRule}`;

        const retryOutput = await callUnifiedAi({
          model,
          systemPrompt,
          userPrompt: retryPrompt,
          imageBase64: imageJpegBase64,
          openaiApiKey,
          geminiApiKey,
          jsonMode: true,
          temperature: 0,
        });

        const retryParsed = parseJsonObject(retryOutput);
        const retryQObj = retryParsed?.question || (Array.isArray(retryParsed?.questions) ? retryParsed.questions[0] : null);
        if (retryQObj) {
          const retryNorm = normalizeExtractedQuestion(retryQObj, pageNumber, idx);
          if (!retryNorm.needsReview || retryNorm.options.length > normalized.options.length) {
            normalized = retryNorm;
          }
        }
      } catch (retryErr) {
        console.warn(`[Auto-retry] failed for Q#${questionNumber}:`, retryErr);
      }
    }

    return normalized;
  } catch (err) {
    console.warn(`[Extract Q#${questionNumber}] failed on page ${pageNumber}:`, err);
    return null;
  }
}

// ── 1. Page Vision Extraction (Per-Question Focus Strategy with Fallback) ─────

const ExtractPageInput = z.object({
  pageNumber: z.number().int().min(1),
  imageJpegBase64: z.string().min(10),
  combinationMode: z.enum(["mode1_keep_original", "mode2_convert_multiple"]),
  model: z.string(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  customInstructions: z.string().optional(),
});

export const extractPageQuestions124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ExtractPageInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { pageNumber, imageJpegBase64, combinationMode, model, openaiApiKey, geminiApiKey, customInstructions } = data;

    // ── STEP 1: Direct Visual Page Extraction (Fast 1-Shot Vision AI Call) ────
    // Sends the page image directly to the vision model with visual document layout instructions.
    // Transcribes all questions, stems, statements, and options in a single visual pass (5-8 seconds).
    const systemPrompt = buildExtractionSystemPrompt(combinationMode, customInstructions);
    const userPrompt = `Extract EVERY single question on Page ${pageNumber} in strict sequential order from the very top to the bottom (do NOT skip questions at the top). Read 2x2 grids of statements (1/3, 2/4) and options (a/c, b/d) within each question. Do NOT bleed options from one question into another. Do NOT convert ordinary options into numbered statements. Extract 100% verbatim.`;

    let questions: ExtractedQuestion[] = [];
    try {
      const rawOutput = await callUnifiedAi({
        model,
        systemPrompt,
        userPrompt,
        imageBase64: imageJpegBase64,
        openaiApiKey,
        geminiApiKey,
        jsonMode: true,
        temperature: 0,
      });

      const parsed = parseJsonObject(rawOutput);
      const rawQs = Array.isArray(parsed?.questions) ? parsed.questions : [];
      questions = rawQs.map((q: any, idx: number) => normalizeExtractedQuestion(q, pageNumber, idx));
    } catch (err) {
      console.error(`[Page ${pageNumber}] Visual extraction call failed:`, err);
    }

    // ── STEP 2 (Targeted Self-Healing): Only for broken combination/option questions ──
    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const isBrokenCombo = q.questionType === "combination" && (!q.options.length || !/1[\.\s].+2[\.\s]/s.test(q.stem));
      if (q.needsReview && (isBrokenCombo || q.options.length < 2)) {
        try {
          const repaired = await extractSingleQuestionFocused({
            pageNumber,
            imageJpegBase64,
            questionNumber: q.number,
            combinationMode,
            model,
            openaiApiKey,
            geminiApiKey,
            customInstructions,
            idx,
          });
          if (repaired && (!repaired.needsReview || repaired.options.length > q.options.length)) {
            questions[idx] = repaired;
          }
        } catch (repairErr) {
          console.warn(`[Targeted Repair Q#${q.number}] skipped:`, repairErr);
        }
      }
    }

    // ── Determine page quality ─────────────────────────────────────────────
    const nonOrphanQs = questions.filter((q) => !String(q.number).startsWith("~"));
    const pageQuality: "ok" | "unclear" | "empty" =
      nonOrphanQs.length > 0 ? "ok" : questions.length === 0 ? "unclear" : "empty";

    return { pageNumber, questions, pageQuality };
  });

// ── 1B. Re-Extract Single Question (Alternate Model Selector) ────────────────
const ReextractSingleQuestionInput = z.object({
  pageNumber: z.number().int().min(1),
  imageJpegBase64: z.string().min(10),
  questionNumber: z.string(),
  combinationMode: z.enum(["mode1_keep_original", "mode2_convert_multiple"]).default("mode1_keep_original"),
  model: z.string(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  customInstructions: z.string().optional(),
});

export const reextractSingleQuestion124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ReextractSingleQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { pageNumber, imageJpegBase64, questionNumber, combinationMode, model, openaiApiKey, geminiApiKey, customInstructions } = data;

    const question = await extractSingleQuestionFocused({
      pageNumber,
      imageJpegBase64,
      questionNumber,
      combinationMode,
      model,
      openaiApiKey,
      geminiApiKey,
      customInstructions,
    });

    if (!question) {
      throw new Error(`Failed to re-extract Question #${questionNumber} from page ${pageNumber}.`);
    }

    return { question };
  });

// ── 2. AI Missing Distractor Generator (Single & Bulk) ────────────────────────
const FillMissingInput = z.object({
  stem: z.string().min(1),
  currentOptions: z.array(z.object({ letter: z.string(), text: z.string() })),
  model: z.string(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export const fillMissingOptions124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => FillMissingInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { stem, currentOptions, model, openaiApiKey, geminiApiKey } = data;
    const needed = 4 - currentOptions.length;
    if (needed <= 0) return { options: currentOptions };

    const systemPrompt = `You are a medical exam editor.
The following medical MCQ is missing ${needed} answer choice(s).
Generate exactly ${needed} plausible, high-yield medical distractor(s) that fit the difficulty, tone, and clinical context of the stem and existing choices.

Return STRICT JSON:
{
  "new_options": [
    { "text": "generated plausible distractor text" }
  ]
}`;

    const userPrompt = `Question Stem:
${stem}

Existing Options:
${currentOptions.map((o) => `${o.letter}) ${o.text}`).join("\n")}

Generate ${needed} additional medical distractor(s) to complete 4 total options.`;

    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
    });

    const parsed = parseJsonObject(rawOutput);
    const newOptions = Array.isArray(parsed?.new_options) ? parsed.new_options : [];

    const resultOptions = [...currentOptions];
    const letters = ["A", "B", "C", "D", "E", "F"];

    for (const no of newOptions) {
      if (resultOptions.length >= 4) break;
      const nextLetter = letters[resultOptions.length] || "D";
      resultOptions.push({
        letter: nextLetter,
        text: String(no.text || "").trim(),
      });
    }

    return { options: resultOptions };
  });

// Bulk Fill Missing Options
const FillAllMissingInput = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      stem: z.string(),
      options: z.array(z.object({ letter: z.string(), text: z.string() })),
    })
  ),
  model: z.string(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export const fillAllMissingOptions124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => FillAllMissingInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { questions, model, openaiApiKey, geminiApiKey } = data;
    const updatedMap: Record<string, Array<{ letter: string; text: string }>> = {};

    for (const q of questions) {
      const needed = 4 - q.options.length;
      if (needed <= 0) continue;

      try {
        const systemPrompt = `You are a medical exam editor.
The following medical MCQ is missing ${needed} answer choice(s).
Generate exactly ${needed} plausible, high-yield medical distractor(s) that fit the difficulty, tone, and clinical context of the stem and existing choices.

Return STRICT JSON:
{
  "new_options": [
    { "text": "generated plausible distractor text" }
  ]
}`;

        const userPrompt = `Question Stem:
${q.stem}

Existing Options:
${q.options.map((o) => `${o.letter}) ${o.text}`).join("\n")}

Generate ${needed} additional medical distractor(s) to complete 4 total options.`;

        const rawOutput = await callUnifiedAi({
          model,
          systemPrompt,
          userPrompt,
          openaiApiKey,
          geminiApiKey,
          jsonMode: true,
        });

        const parsed = parseJsonObject(rawOutput);
        const newOptions = Array.isArray(parsed?.new_options) ? parsed.new_options : [];

        const resultOptions = [...q.options];
        const letters = ["A", "B", "C", "D", "E", "F"];

        for (const no of newOptions) {
          if (resultOptions.length >= 4) break;
          const nextLetter = letters[resultOptions.length] || "D";
          resultOptions.push({
            letter: nextLetter,
            text: String(no.text || "").trim(),
          });
        }
        updatedMap[q.id] = resultOptions;
      } catch {
        // preserve existing if single item fails
        updatedMap[q.id] = q.options;
      }
    }

    return { updatedMap };
  });

// ── 3. Deduplication Utility ─────────────────────────────────────────────────
export function detectDuplicates124<T extends ExtractedQuestion>(questions: T[]): {
  cleaned: T[];
  duplicateCount: number;
} {
  const seen = new Map<string, string>();
  let dupCount = 0;

  const cleaned = questions.map((q) => {
    const normStem = q.stem.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
    const normOpts = q.options.map((o) => o.text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)).sort().join("|");
    const key = `${normStem}::${normOpts}`;

    if (seen.has(key)) {
      dupCount++;
      return { ...q, isDuplicate: true };
    }
    seen.set(key, q.id);
    return { ...q, isDuplicate: false };
  });

  return { cleaned, duplicateCount: dupCount };
}

// ── 4. Solve and Generate AquavisionX Explanation (with Source Citation) ──────
const SolveQuestionInput = z.object({
  question: z.object({
    id: z.string(),
    number: z.string(),
    stem: z.string(),
    questionType: z.string(),
    options: z.array(z.object({ letter: z.string(), text: z.string() })),
    comboSets: z.array(z.array(z.string())).optional(),
    originalCombinations: z.array(z.object({ letter: z.string(), text: z.string() })).optional(),
    detectedAnswer: z.string().nullable().optional(),
  }),
  sourceMethod: z.enum(["ai", "source_material", "answer_key"]),
  studyMaterialText: z.string().optional(),
  studyMaterialName: z.string().optional(),
  includeSourceCitation: z.boolean().optional(),
  answerKeyText: z.string().optional(),
  combinationMode: z.enum(["mode1_keep_original", "mode2_convert_multiple"]),
  model: z.string(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export function buildSolvePrompts124(params: {
  question: {
    number: number | string;
    stem: string;
    options: Array<{ letter: string; text: string }>;
    detectedAnswer?: string | null;
  };
  sourceMethod: "ai" | "source_material" | "answer_key";
  studyMaterialText?: string;
  studyMaterialName?: string;
  includeSourceCitation?: boolean;
  answerKeyText?: string;
  combinationMode: "mode1_keep_original" | "mode2_convert_multiple";
}) {
  const { question, sourceMethod, studyMaterialText, studyMaterialName, includeSourceCitation, answerKeyText, combinationMode } = params;

  let authorityPrompt = "";
  if (sourceMethod === "source_material" && studyMaterialText) {
    authorityPrompt = `PRIMARY AUTHORITY SOURCE DOCUMENT ("${studyMaterialName || "Reference Material"}"):
${studyMaterialText.slice(0, 50000)}
END OF AUTHORITY SOURCE.

CRITICAL SOLVING RULE:
- You MUST solve the question strictly according to the facts, classifications, and diagnostic criteria stated in the authority source.
- If the question requires clinical reasoning beyond direct quotation, use the source as your primary foundational basis.
${
  includeSourceCitation
    ? `- SOURCE CITATION REQUIREMENT:
  You must identify and state the exact location (e.g. Chapter title, Section name, Page number, or verbatim excerpt) in the provided study material where the question's concept and answer are found.
  Include this in a dedicated section in the explanation:
  **Source Reference**
  [Exact section / page / chapter / quoted text reference from source]`
    : ""
}`;
  } else if (sourceMethod === "answer_key" && answerKeyText) {
    authorityPrompt = `PROVIDED ANSWER KEY REFERENCE:
${answerKeyText.slice(0, 10000)}
END OF ANSWER KEY.

Use this answer key to identify the intended correct answer for Question #${question.number}.`;
  }

  const systemPrompt = `You are a world-class medical professor and examination tutor.
You will solve this medical MCQ and write a comprehensive, professional clinical explanation following the AquavisionX standard.

${authorityPrompt}

COMBINATION QUESTION CONSTRAINTS:
${
  combinationMode === "mode1_keep_original"
    ? `- This is Mode 1 (Keep Original Format).
- The answer MUST be ONE of the printed combination choices (e.g. A, B, C, or D).
- Do not invent a new combination that is not in the options.`
    : `- This is Mode 2 (Multiple Answer statements).
- Determine which individual statements are true based on the best combination, and mark all matching statement options correct.`
}

EXPLANATION REQUIREMENTS (AQUAVISIONX STANDARD):
The explanation must be formatted in clean GitHub-flavored Markdown with the following exact sections separated by blank lines:

**Concept**
2-3 precise sentences explaining the core pathophysiology, diagnostic hallmark, or pharmacological mechanism tested.

**Why the correct answer is right**
- 2-3 detailed clinical bullet points explaining why the chosen option is correct.

**Why the other options are wrong**
List ONLY the incorrect options. Each bullet MUST begin with the option's text in **bold** (DO NOT include the option letter prefix like A. or B.), followed by an em-dash (—), and a clear, specific medical sentence explaining why it is incorrect or inapplicable.
Example:
- **Kanamycin** — is an aminoglycoside second-line TB agent associated with ototoxicity and nephrotoxicity, not pellagra-like dermatitis.

${
  includeSourceCitation && sourceMethod === "source_material"
    ? `**Source Reference**
Explicitly state where in the provided source document this concept/answer is located (Section/Page/Excerpt).`
    : ""
}

SUMMARY TABLE REQUIREMENT:
Provide a GitHub-flavored Markdown summary table comparing all choices:
| Option | Verdict | Medical Reason |
|---|---|---|
| Option text verbatim (no letter) | ✓ Correct | Clinical reason |
| Option text verbatim (no letter) | ✗ Incorrect | Clinical reason |

Return STRICT JSON:
{
  "selected_answer": "Letter or statement numbers (e.g. B or 1,3)",
  "correct_option_letters": ["B"],
  "concept": "<=8 words naming the core concept",
  "source_reference": "Section / page / excerpt if applicable",
  "explanation": "**Concept**\\n...\\n\\n**Why the correct answer is right**\\n...\\n\\n**Why the other options are wrong**\\n...",
  "summary_table": "| Option | Verdict | Medical Reason |\\n|---|---|---|\\n..."
}`;

  const userPrompt = `Question #${question.number}:
${question.stem}

Options:
${question.options.map((o) => `${o.letter}) ${o.text}`).join("\n")}
${question.detectedAnswer ? `\n(Physical page had detected mark: ${question.detectedAnswer})` : ""}

Solve this question and generate the complete AquavisionX medical explanation and summary table.`;

  return { systemPrompt, userPrompt };
}

export function parseSolvedQuestionOutput124(
  questionId: string,
  options: Array<{ letter: string; text: string; is_correct?: boolean }>,
  rawOutput: string
) {
  const parsed = parseJsonObject(rawOutput);

  const selectedLetters: string[] = Array.isArray(parsed?.correct_option_letters)
    ? parsed.correct_option_letters.map((l: any) => String(l).toUpperCase())
    : [String(parsed?.selected_answer || "A").trim().toUpperCase()];

  const updatedOptions = options.map((o) => ({
    ...o,
    is_correct: selectedLetters.includes(o.letter.toUpperCase()),
  }));

  return {
    questionId,
    selectedAnswer: String(parsed?.selected_answer || selectedLetters.join(", ")),
    options: updatedOptions,
    concept: String(parsed?.concept || ""),
    sourceReference: parsed?.source_reference ? String(parsed.source_reference) : undefined,
    explanation: String(parsed?.explanation || ""),
    summaryTable: String(parsed?.summary_table || ""),
  };
}

export const solveAndExplain124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SolveQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { question, sourceMethod, studyMaterialText, studyMaterialName, includeSourceCitation, answerKeyText, combinationMode, model, openaiApiKey, geminiApiKey } = data;

    const { systemPrompt, userPrompt } = buildSolvePrompts124({
      question,
      sourceMethod,
      studyMaterialText,
      studyMaterialName,
      includeSourceCitation,
      answerKeyText,
      combinationMode,
    });

    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
    });

    return parseSolvedQuestionOutput124(question.id, question.options, rawOutput);
  });

// ── 5. Batch API Handlers (50% Discount Asynchronous Mode) ────────────────────

// A. Create OpenAI Batch Extraction Job
const CreateBatchExtractionInput = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      imageJpegBase64: z.string().min(10),
    })
  ),
  combinationMode: z.enum(["mode1_keep_original", "mode2_convert_multiple"]),
  model: z.string(),
  openaiApiKey: z.string(),
  customInstructions: z.string().optional(),
});

export const createOpenAiBatchExtraction124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateBatchExtractionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { pages, combinationMode, model, openaiApiKey, customInstructions } = data;
    const actualModel = model === "gpt-4.1-mini" ? "gpt-4o-mini" : model === "gpt-4.1" ? "gpt-4o" : model;
    const systemPrompt = buildExtractionSystemPrompt(combinationMode, customInstructions);

    // Build JSONL lines
    const jsonlLines = pages.map((p) => {
      const lineObj = {
        custom_id: `page-${p.pageNumber}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: actualModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Visually analyze Page ${p.pageNumber} of this exam document. Identify all questions and options based on their visual layout, spacing, and position. Keep question stems strictly separate from answer options. Preserve exact wording, numbers, units, and medical terms verbatim. If any part is unclear, mark needs_review: true.`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${p.imageJpegBase64}`, detail: "high" },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        },
      };
      return JSON.stringify(lineObj);
    });

    const jsonlContent = jsonlLines.join("\n");
    const blob = new Blob([jsonlContent], { type: "application/jsonl" });
    const formData = new FormData();
    formData.append("purpose", "batch");
    formData.append("file", blob, `batch-extract-${Date.now()}.jsonl`);

    // 1. Upload File
    const fileRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formData,
    });
    const fileJson = await fileRes.json();
    if (!fileRes.ok) throw new Error(`OpenAI file upload failed: ${fileJson?.error?.message || JSON.stringify(fileJson)}`);

    const fileId = fileJson.id;

    // 2. Create Batch Job
    const batchRes = await fetch("https://api.openai.com/v1/batches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_file_id: fileId,
        endpoint: "/v1/chat/completions",
        completion_window: "24h",
      }),
    });
    const batchJson = await batchRes.json();
    if (!batchRes.ok) throw new Error(`OpenAI batch creation failed: ${batchJson?.error?.message || JSON.stringify(batchJson)}`);

    return {
      batchId: batchJson.id as string,
      status: batchJson.status as string,
      totalPages: pages.length,
      createdAt: new Date().toISOString(),
    };
  });

// B. Check Batch Status
const CheckBatchInput = z.object({
  batchId: z.string(),
  openaiApiKey: z.string(),
});

export const checkOpenAiBatchStatus124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CheckBatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { batchId, openaiApiKey } = data;
    const res = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${openaiApiKey}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Batch status check failed: ${json?.error?.message || JSON.stringify(json)}`);

    return {
      batchId: json.id as string,
      status: json.status as string, // validating, in_progress, completed, failed, expired, cancelling, cancelled
      requestCounts: json.request_counts || { total: 0, completed: 0, failed: 0 },
      outputFileId: json.output_file_id as string | null,
      errorFileId: json.error_file_id as string | null,
    };
  });

// C. Retrieve Batch Extraction Results
const RetrieveBatchInput = z.object({
  outputFileId: z.string(),
  openaiApiKey: z.string(),
});

export const retrieveOpenAiBatchExtractionResults124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RetrieveBatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { outputFileId, openaiApiKey } = data;
    const res = await fetch(`https://api.openai.com/v1/files/${outputFileId}/content`, {
      headers: { Authorization: `Bearer ${openaiApiKey}` },
    });
    if (!res.ok) throw new Error("Failed to download batch output file content.");

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());
    const allQuestions: ExtractedQuestion[] = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const customId = String(item.custom_id || "");
        const pageMatch = customId.match(/page-(\d+)/);
        const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : 1;

        const bodyContent = item.response?.body?.choices?.[0]?.message?.content;
        const parsed = parseJsonObject(bodyContent);
        const rawQs = Array.isArray(parsed?.questions) ? parsed.questions : [];

        for (let idx = 0; idx < rawQs.length; idx++) {
          const q = rawQs[idx];
          allQuestions.push(normalizeExtractedQuestion(q, pageNumber, idx));
        }
      } catch {}
    }

    allQuestions.sort((a, b) => a.pageNumber - b.pageNumber);
    return { questions: allQuestions };
  });

// D. Create OpenAI Batch Solving Job (50% Discount)
const CreateBatchSolvingInput = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      number: z.union([z.number(), z.string()]),
      stem: z.string(),
      options: z.array(z.object({ letter: z.string(), text: z.string() })),
      detectedAnswer: z.string().nullable().optional(),
    })
  ),
  sourceMethod: z.enum(["ai", "source_material", "answer_key"]),
  studyMaterialText: z.string().optional(),
  studyMaterialName: z.string().optional(),
  includeSourceCitation: z.boolean().optional(),
  answerKeyText: z.string().optional(),
  combinationMode: z.enum(["mode1_keep_original", "mode2_convert_multiple"]),
  model: z.string(),
  openaiApiKey: z.string(),
});

export const createOpenAiBatchSolving124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateBatchSolvingInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const {
      questions,
      sourceMethod,
      studyMaterialText,
      studyMaterialName,
      includeSourceCitation,
      answerKeyText,
      combinationMode,
      model,
      openaiApiKey,
    } = data;

    const actualModel = model === "gpt-4.1-mini" ? "gpt-4o-mini" : model === "gpt-4.1" ? "gpt-4o" : model.startsWith("gpt") ? model : "gpt-4o-mini";

    const jsonlLines = questions.map((q) => {
      const { systemPrompt, userPrompt } = buildSolvePrompts124({
        question: q,
        sourceMethod,
        studyMaterialText,
        studyMaterialName,
        includeSourceCitation,
        answerKeyText,
        combinationMode,
      });

      const lineObj = {
        custom_id: `q-${q.id}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: actualModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        },
      };
      return JSON.stringify(lineObj);
    });

    const jsonlContent = jsonlLines.join("\n");
    const blob = new Blob([jsonlContent], { type: "application/jsonl" });
    const formData = new FormData();
    formData.append("purpose", "batch");
    formData.append("file", blob, `batch-solve-${Date.now()}.jsonl`);

    // 1. Upload File
    const fileRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formData,
    });
    const fileJson = await fileRes.json();
    if (!fileRes.ok) throw new Error(`OpenAI file upload failed: ${fileJson?.error?.message || JSON.stringify(fileJson)}`);

    const fileId = fileJson.id;

    // 2. Create Batch Job
    const batchRes = await fetch("https://api.openai.com/v1/batches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_file_id: fileId,
        endpoint: "/v1/chat/completions",
        completion_window: "24h",
      }),
    });
    const batchJson = await batchRes.json();
    if (!batchRes.ok) throw new Error(`OpenAI batch creation failed: ${batchJson?.error?.message || JSON.stringify(batchJson)}`);

    return {
      batchId: batchJson.id as string,
      status: batchJson.status as string,
      totalQuestions: questions.length,
      createdAt: new Date().toISOString(),
    };
  });

// E. Retrieve Batch Solving Results (50% Discount)
const RetrieveBatchSolvingInput = z.object({
  outputFileId: z.string(),
  openaiApiKey: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      options: z.array(z.object({ letter: z.string(), text: z.string(), is_correct: z.boolean().optional() })),
    })
  ),
});

export const retrieveOpenAiBatchSolvingResults124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RetrieveBatchSolvingInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { outputFileId, openaiApiKey, questions } = data;
    const res = await fetch(`https://api.openai.com/v1/files/${outputFileId}/content`, {
      headers: { Authorization: `Bearer ${openaiApiKey}` },
    });
    if (!res.ok) throw new Error("Failed to download batch solving output file content.");

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());

    // Map questions by id for fast lookup
    const qMap = new Map<string, Array<{ letter: string; text: string; is_correct?: boolean }>>();
    for (const q of questions) {
      qMap.set(q.id, q.options);
    }

    const results: Array<{
      questionId: string;
      selectedAnswer: string;
      options: Array<{ letter: string; text: string; is_correct?: boolean }>;
      concept: string;
      sourceReference?: string;
      explanation: string;
      summaryTable: string;
    }> = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const customId = String(item.custom_id || "");
        const qId = customId.replace(/^q-/, "");
        const options = qMap.get(qId) || [];

        const bodyContent = item.response?.body?.choices?.[0]?.message?.content || "";
        const parsedResult = parseSolvedQuestionOutput124(qId, options, bodyContent);
        results.push(parsedResult);
      } catch {}
    }

    return { results };
  });

// ── 6. Direct Course Importer ─────────────────────────────────────────────────
const ImportQuestionsInput = z.object({
  courseId: z.string().uuid(),
  groupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  questions: z.array(
    z.object({
      id: z.string(),
      stem: z.string(),
      questionType: z.string(),
      options: z.array(z.object({ letter: z.string(), text: z.string(), is_correct: z.boolean().optional() })),
      explanation: z.string().optional(),
      summaryTable: z.string().optional(),
    })
  ),
});

export const importQuestions124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ImportQuestionsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { subjectId, questions } = data;

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    const { count } = await supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subjectId);
    let currentSort = (count || 0) + 1;

    for (const q of questions) {
      try {
        const fullExplanation = [q.explanation || "", q.summaryTable ? `\n\n${q.summaryTable}` : ""].join("").trim() || null;
        const answerMode = q.questionType === "multiple_answer" ? "multiple" : "single";

        const { data: insertedQ, error: qErr } = await supabase.from("questions").insert({
          subject_id: subjectId,
          stem: q.stem,
          explanation: fullExplanation,
          answer_mode: answerMode,
          sort_order: currentSort++,
        }).select("id").single();

        if (qErr) throw qErr;

        if (insertedQ?.id) {
          const optionRows = q.options.map((o, idx) => ({
            question_id: insertedQ.id,
            label: o.letter || String.fromCharCode(65 + idx),
            text: o.text || "",
            is_correct: !!o.is_correct,
            sort_order: idx + 1,
          }));

          const { error: optErr } = await supabase.from("question_options").insert(optionRows);
          if (optErr) throw optErr;
          inserted++;
        }
      } catch (err: any) {
        skipped++;
        errors.push(`Q "${q.stem.slice(0, 30)}...": ${err?.message || err}`);
      }
    }

    return { inserted, skipped, errors: errors.slice(0, 5) };
  });

// ── Pre-Import AI Quality Review ──────────────────────────────────────────────

export interface QuestionReviewResult {
  questionId: string;
  questionNumber: string | number;
  pageNumber: number;
  stem: string;
  issues: string[];
  severity: "ok" | "warning" | "error";
  suggestion?: string;
}

export interface PreImportReviewReport {
  totalReviewed: number;
  okCount: number;
  warningCount: number;
  errorCount: number;
  results: QuestionReviewResult[];
  reviewedAt: string;
  model: string;
}

const ReviewQuestionsInput = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      number: z.union([z.string(), z.number()]),
      pageNumber: z.number(),
      stem: z.string(),
      questionType: z.string(),
      options: z.array(z.object({ letter: z.string(), text: z.string() })),
      explanation: z.string().optional().nullable(),
    })
  ).max(200),
  modelId: z.string().default("gemini-2.5-flash"),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export const reviewQuestionsBeforeImport124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ReviewQuestionsInput.parse(d))
  .handler(async ({ data, context }): Promise<PreImportReviewReport> => {
    await ensureAdmin(context);
    const { questions, modelId, openaiApiKey, geminiApiKey } = data;

    if (questions.length === 0) {
      return {
        totalReviewed: 0,
        okCount: 0,
        warningCount: 0,
        errorCount: 0,
        results: [],
        reviewedAt: new Date().toISOString(),
        model: modelId,
      };
    }

    const BATCH_SIZE = 10;
    const allResults: QuestionReviewResult[] = [];

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);

      const questionsJson = batch.map((q, idx) => ({
        index: i + idx + 1,
        id: q.id,
        number: q.number,
        page: q.pageNumber,
        type: q.questionType,
        stem: q.stem.slice(0, 500),
        options: q.options.map((o) => `${o.letter}) ${o.text.slice(0, 200)}`),
      }));

      const systemPrompt = `You are a medical MCQ quality reviewer. You review multiple choice questions for:
1. Clarity, medical validity, and grammatical correctness of the question stem
2. Completeness (does it have enough options? At least 4 for ordinary MCQs)
3. Whether the question makes sense medically or contains nonsensical / garbled fragments
4. Obvious typos, missing statements, repeated choices, or contradictory options
5. Extraction artifacts (e.g. truncated stem, missing combination statements, orphaned options)

For each question, return a JSON array where each object has:
- "id": string (the question id, copy exactly)
- "issues": string[] (list of specific problems found, or empty array [] if question is good)
- "severity": "ok" | "warning" | "error"
  * "ok" = question is medically and structurally valid
  * "warning" = minor typo or wording issue, but usable
  * "error" = question is broken, nonsensical, missing options, or contains medical contradictions
- "suggestion": string (short actionable suggestion for fixing if severity is warning or error)

Output ONLY a valid JSON array of objects. No markdown fences.`;

      const userPrompt = `Review these ${batch.length} MCQ questions:\n\n${JSON.stringify(questionsJson, null, 2)}`;

      try {
        const rawResponse = await callUnifiedAi({
          model: modelId,
          systemPrompt,
          userPrompt,
          openaiApiKey,
          geminiApiKey,
          jsonMode: true,
          temperature: 0,
        });

        const parsed = (() => {
          const s = stripFences(rawResponse);
          try { return JSON.parse(s); } catch {}
          const lb = s.indexOf("["), rb = s.lastIndexOf("]");
          if (lb !== -1 && rb > lb) {
            try { return JSON.parse(s.slice(lb, rb + 1)); } catch {}
          }
          return null;
        })();

        if (Array.isArray(parsed)) {
          for (const q of batch) {
            const found = parsed.find((r: any) => String(r.id) === String(q.id));
            allResults.push({
              questionId: q.id,
              questionNumber: q.number,
              pageNumber: q.pageNumber,
              stem: q.stem.slice(0, 300),
              issues: Array.isArray(found?.issues) ? found.issues.map(String) : [],
              severity: ["ok", "warning", "error"].includes(found?.severity) ? found.severity : "ok",
              suggestion: found?.suggestion ? String(found.suggestion).slice(0, 400) : undefined,
            });
          }
        } else {
          for (const q of batch) {
            allResults.push({
              questionId: q.id,
              questionNumber: q.number,
              pageNumber: q.pageNumber,
              stem: q.stem.slice(0, 300),
              issues: ["AI review response parsing failed for this batch"],
              severity: "warning",
            });
          }
        }
      } catch (err: any) {
        for (const q of batch) {
          allResults.push({
            questionId: q.id,
            questionNumber: q.number,
            pageNumber: q.pageNumber,
            stem: q.stem.slice(0, 300),
            issues: [`Review call failed: ${err?.message || "unknown"}`],
            severity: "warning",
          });
        }
      }
    }

    const okCount = allResults.filter((r) => r.severity === "ok").length;
    const warningCount = allResults.filter((r) => r.severity === "warning").length;
    const errorCount = allResults.filter((r) => r.severity === "error").length;

    return {
      totalReviewed: allResults.length,
      okCount,
      warningCount,
      errorCount,
      results: allResults,
      reviewedAt: new Date().toISOString(),
      model: modelId,
    };
  });
