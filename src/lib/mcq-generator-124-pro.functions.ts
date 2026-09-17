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
  if (!isAdmin) throw new Error("Restricted Access: Administrator clearance required for MCQ Generator 1.24 Pro.");
  return { supabase, userId } as { supabase: any; userId: string };
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
}

async function callUnifiedAi(options: CallAiOptions): Promise<string> {
  const { model, systemPrompt, userPrompt, imageBase64, openaiApiKey, geminiApiKey, jsonMode = true } = options;
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
          temperature: 0.1,
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
      temperature: 0.1,
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
  isDuplicate?: boolean;
  needsReview?: boolean;
  reviewReason?: string | null;
  isApproved?: boolean;
}

function buildExtractionSystemPrompt(combinationMode: "mode1_keep_original" | "mode2_convert_multiple", customInstructions?: string): string {
  return `You are an expert medical examination transcription engine reading high-resolution photographs/scans of medical exam papers.
Your mission is to transcribe EVERY question from this page VERBATIM with 100% fidelity and zero hallucination.

QUESTION TAXONOMY & EXTRACTION RULES:

1. ORDINARY / STANDARD MCQs (The vast majority of questions):
   - Consists of a question stem (e.g. "All the following are interstitial lung diseases, except:" or "Drugs of first line are all listed below except:") followed by choices labeled a), b), c), d) or A), B), C), D).
   - In ordinary MCQs, choices contain names of drugs, clinical findings, diseases, or standard answer sentences.
   - CRITICAL RULE: ALWAYS extract choices labeled a), b), c), d) into the "options" array with letters "A", "B", "C", "D".
   - STRICT: NEVER convert choices a), b), c), d) into numbers (1, 2, 3, 4).
   - STRICT: NEVER merge choices into the question stem.
   - STRICT: NEVER return an empty options array for ordinary MCQs.
   - Set "question_type": "ordinary".

2. COMBINATION QUESTIONS:
   - A question is a Combination Question ONLY IF the printed paper contains BOTH:
     (a) Numbered statements (1. ... 2. ... 3. ... 4. ...) inside the question body, AND
     (b) Choices referencing those numbers (e.g. "a) 3.4", "b) 1.2.3.4", "c) 2.3", "d) 1.4" or "A) 1, 2").
${
  combinationMode === "mode1_keep_original"
    ? `   - MODE 1 — KEEP ORIGINAL COMBINATION FORMAT:
     * The numbered statements stay inside the "stem" (e.g. "BCG vaccine is a protection against... 1. Post-primary... 2. Primary...").
     * The combination choices MUST be extracted directly into the "options" array:
       [{"letter": "A", "text": "3.4"}, {"letter": "B", "text": "1.2.3.4"}, {"letter": "C", "text": "2.3"}, {"letter": "D", "text": "1.4"}].
     * DO NOT leave "options" empty!
     * Set "question_type": "combination".
     * Also record choices in "printed_combinations".`
    : `   - MODE 2 — CONVERT TO MULTIPLE ANSWERS:
     * The numbered statements become the "options" (A: statement 1, B: statement 2...).
     * Set "question_type": "multiple_answer".
     * The original printed combination choices are preserved in "printed_combinations": [{"letter":"A","text":"3.4"}, {"letter":"B","text":"1.2.3.4"}].`
}

3. ORPHANED / TRUNCATED FRAGMENTS (CRITICAL GUARDRAIL):
   - Look out for fragments cut off from the previous page or column! For example, text starting with "4. positive reaction to treatment" followed by choices a) 1.3.4, b) 2.3.4:
   - Notice that "4." is NOT a question number! It is statement #4 of a multi-statement question whose stem and statements 1, 2, 3 were cut off or printed on the preceding page.
   - In such cases:
     * Extract what is visible so the instructor can review, edit, or delete it.
     * Set "needs_review": true
     * Set "review_reason": "Incomplete combination fragment: choices reference numbered statements (1, 2, 3...) that are missing from this page."
     * Set "is_approved": false

General Rules:
1. Extract every question on this page in natural reading order.
2. If choices are labeled "a)", "A.", "1-", normalize to standard letters A, B, C, D...
3. If an ordinary question is missing some options (e.g. only 3 choices visible due to cropping), transcribe only the visible options. Do not invent options here.
4. If an answer is visibly circled, highlighted, underlined, or explicitly printed (e.g. "Ans: C"), extract it in "detected_answer". If none, return null.
5. If the page has no questions (cover, blank, or header only), return {"questions": []}.
${customInstructions ? `Special User Instructions:\n${customInstructions}\n` : ""}

Return STRICT JSON:
{
  "questions": [
    {
      "number": "6",
      "question_type": "ordinary|combination|multiple_answer",
      "stem": "question prompt verbatim",
      "options": [
        { "letter": "A", "text": "option text" },
        { "letter": "B", "text": "option text" },
        { "letter": "C", "text": "option text" },
        { "letter": "D", "text": "option text" }
      ],
      "printed_combinations": [
        { "letter": "A", "text": "3.4" }
      ],
      "detected_answer": "C or null",
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
    .map((o: any, oIdx: number) => ({
      letter: String(o.letter || String.fromCharCode(65 + oIdx)).toUpperCase(),
      text: String(o.text || o.body || "").trim(),
    }))
    .filter((o: any) => o.text);

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

  // If options are labeled 1. ... 2. ... 3. ... 4. ... without combination numbers, normalize to clean text
  const isComboOptions = options.length > 0 && options.every((o: { letter: string; text: string }) => /^[\d\s.,;+]+$/.test(o.text.trim()));
  if (!isComboOptions && options.length >= 2 && options.every((o: { letter: string; text: string }) => /^[1-4]\.\s*/.test(o.text))) {
    options = options.map((o: { letter: string; text: string }, oIdx: number) => ({
      letter: String.fromCharCode(65 + oIdx),
      text: o.text.replace(/^[1-4]\.\s*/, "").trim(),
    }));
    q.question_type = "ordinary";
  }

  // Check for Orphaned / Incomplete Combination Fragment (User Issue 4)
  // Options are combination numbers ("1.3.4", "2.3.4", etc.) but stem does NOT contain statements 1 and 2
  const stemHasStatements = /1[\.\s].+2[\.\s]/s.test(stem);
  let needsReview = Boolean(q.needs_review);
  let reviewReason = q.review_reason ? String(q.review_reason) : null;
  let isApproved = q.is_approved !== false && !needsReview;

  if (isComboOptions && !stemHasStatements) {
    needsReview = true;
    isApproved = false;
    reviewReason =
      "Incomplete combination fragment: choices reference numbered statements (1, 2, 3...) that are missing from this page or question stem.";
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

// ── 1. Page Vision Extraction (Standard Mode) ─────────────────────────────────
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
    const systemPrompt = buildExtractionSystemPrompt(combinationMode, customInstructions);
    const userPrompt = `Transcribe all medical MCQs visible on Page ${pageNumber} of this exam paper.`;

    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      imageBase64: imageJpegBase64,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
    });

    const parsed = parseJsonObject(rawOutput);
    const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const questions: ExtractedQuestion[] = rawQuestions.map((q: any, idx: number) =>
      normalizeExtractedQuestion(q, pageNumber, idx)
    );

    return { pageNumber, questions };
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

export const solveAndExplain124 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SolveQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { question, sourceMethod, studyMaterialText, studyMaterialName, includeSourceCitation, answerKeyText, combinationMode, model, openaiApiKey, geminiApiKey } = data;

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

    const rawOutput = await callUnifiedAi({
      model,
      systemPrompt,
      userPrompt,
      openaiApiKey,
      geminiApiKey,
      jsonMode: true,
    });

    const parsed = parseJsonObject(rawOutput);

    const selectedLetters: string[] = Array.isArray(parsed?.correct_option_letters)
      ? parsed.correct_option_letters.map((l: any) => String(l).toUpperCase())
      : [String(parsed?.selected_answer || "A").trim().toUpperCase()];

    const updatedOptions = question.options.map((o) => ({
      ...o,
      is_correct: selectedLetters.includes(o.letter.toUpperCase()),
    }));

    return {
      questionId: question.id,
      selectedAnswer: String(parsed?.selected_answer || selectedLetters.join(", ")),
      options: updatedOptions,
      concept: String(parsed?.concept || ""),
      sourceReference: parsed?.source_reference ? String(parsed.source_reference) : undefined,
      explanation: String(parsed?.explanation || ""),
      summaryTable: String(parsed?.summary_table || ""),
    };
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
                { type: "text", text: `Transcribe all medical MCQs visible on Page ${p.pageNumber} of this exam paper.` },
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
