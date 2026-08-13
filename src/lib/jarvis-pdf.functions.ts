import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getGeminiPool, callGeminiJSON, type GeminiPool } from "@/lib/gemini-pool";

const Provider = z.enum(["gemini", "lovable"]);

const SubjectCandidates = z.array(z.string().min(1).max(80)).max(80).optional();

const ChunkInput = z.object({
  pdfBase64: z.string().min(100),
  provider: Provider.default("gemini"),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  hint: z.string().optional(),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
  subjectCandidates: SubjectCandidates,
});

const QuestionSchema = z.object({
  prompt: z.string().min(1),
  options: z
    .array(
      z.object({
        letter: z.enum(["A", "B", "C", "D", "E", "F"]),
        body: z.string().min(1),
        is_correct: z.boolean(),
      }),
    )
    .min(2)
    .max(6),
  explanation: z.string().default(""),
  subject_hint: z.string().optional(),
  subject_reason: z.string().optional(),
});
const ResultSchema = z.object({ questions: z.array(QuestionSchema) });

// Append a "classify into subject" block to any system prompt when the caller
// provides a candidate subject list. Keeps cost low: candidates are sent ONCE
// per chunk, model adds ~25 tokens per question for the tag.
function withSubjectClassifier(systemPrompt: string, candidates?: string[]): string {
  if (!candidates || candidates.length === 0) return systemPrompt;
  const list = candidates.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
  return `${systemPrompt}

SUBJECT CLASSIFICATION (ADDITIONAL REQUIREMENT):
For EACH question you output, ALSO include two extra fields:
  "subject_hint":   one of the EXACT subject names below (copy verbatim, case-sensitive). If none clearly fit, use "UNKNOWN".
  "subject_reason": ≤8 words explaining why (a key term that drove the choice).

Available subjects (pick the most clinically appropriate one):
${list}

Rules:
- Match by the medical topic the question tests, not by surface keywords alone.
- Never invent a subject name not in the list. Use "UNKNOWN" instead.
- Keep "subject_reason" short — it's just a hint for the human reviewer.`;
}

const SYSTEM_PROMPT = `You extract multiple-choice questions from a PDF of medical study material.

Return STRICT JSON only (no markdown fences, no commentary) in this exact shape:
{
  "questions": [
    {
      "prompt": "the question stem, plain text",
      "options": [
        {"letter":"A","body":"...","is_correct":true|false}
      ],
      "explanation": "Markdown explanation"
    }
  ]
}

Rules:
- Extract EVERY numbered question in the supplied pages, preserving order — INCLUDING questions that only show one answer.
- For each question output EXACTLY 4 options labelled A, B, C, D with exactly one is_correct=true. (5-6 only when the source genuinely shows that many choices.)
- If the source ALREADY lists multiple choices, copy them verbatim in the order they appear.
- If the source shows only the STEM and the single CORRECT answer (no full A–D list), you MUST INVENT 3 plausible but clearly wrong distractors that are:
  * medically/contextually related to the same topic, same category, similar length and register
  * unambiguously incorrect (not synonyms of the correct answer, not partially correct)
  * shuffled — the correct answer should NOT always be option A.
- If the PDF already marks the correct letter (e.g. "Answer: a", a highlighted choice, ✓), respect it. Otherwise pick the medically correct option.
- The "explanation" field must be GitHub-flavored Markdown following this template exactly:

**Concept**

2-4 short sentences. Bold **key terms** inline.

**Why the correct answer is right**

- 3-5 bullets. Bold the **mechanism** or **key fact** in each.
- End with a one-line clinical pearl bullet.

**Why the other options are wrong**

- **A) <short option text>** — one tight sentence (skip the correct letter, only list real options).

**Summary**

| Option | Verdict | One-line reason |
|---|---|---|
| A | ✗ | … |
| B | ✓ Correct | … |
(One row per option in order. Mark correct row with ✓ Correct.)

- Write in English unless the hint asks otherwise.
- If no valid MCQs are found, return {"questions": []}.
- Output JSON only — no code fences, no commentary outside the JSON.`;

async function callGeminiPdf(
  pool: GeminiPool,
  pdfBase64: string,
  userText: string,
  systemPrompt: string = SYSTEM_PROMPT,
  modelOverride?: string,
  lockModel?: boolean,
): Promise<string> {
  return await callGeminiJSON({
    pool,
    systemPrompt,
    userParts: [
      { text: userText },
      { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
    ],
    timeoutMs: 120_000,
    generationConfig: { temperature: 0.15, maxOutputTokens: 32768 },
    onlyModel: "gemini-2.5-flash-lite",
  });
}

// Stricter retry prompt — used when first pass returned fewer questions than the
// page seemed to contain. Forces the model to enumerate EVERY visible question.
const STRICT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

ACCURACY MODE — READ CAREFULLY:
- The previous extraction missed questions. Re-read the page and extract EVERY single visible question without exception.
- Count the questions on the page first. The returned "questions" array MUST have that exact count.
- Do NOT skip a question because its options are incomplete, partially highlighted, or unclear — extract it and invent 3 plausible distractors as already instructed.
- Do NOT merge two questions into one.
- Keep the FULL Markdown explanation template (Concept, Why right, Why others wrong, Summary table) — do not shorten it.`;

async function callLovablePdf(
  pdfBase64: string,
  userText: string,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "file",
              file: {
                filename: "pages.pdf",
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`Lovable AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// Robust extractor: tolerates truncated output by recovering the longest valid
// prefix of the `questions` array. Returns { questions: [...] } even when the
// model's reply ends mid-token.
function extractJson(text: string): any {
  let cleaned = text.trim().replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 1. happy path
  try { return JSON.parse(cleaned); } catch {}

  // 2. slice between outer braces
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
    const repaired = slice.replace(/,(\s*[}\]])/g, "$1");
    try { return JSON.parse(repaired); } catch {}
  }

  // 3. recover questions array by parsing top-level objects one by one
  const arrIdx = cleaned.indexOf('"questions"');
  if (arrIdx !== -1) {
    const bracketIdx = cleaned.indexOf("[", arrIdx);
    if (bracketIdx !== -1) {
      const recovered: any[] = [];
      let i = bracketIdx + 1;
      while (i < cleaned.length) {
        // skip whitespace/commas
        while (i < cleaned.length && /[\s,]/.test(cleaned[i])) i++;
        if (i >= cleaned.length || cleaned[i] === "]") break;
        if (cleaned[i] !== "{") break;
        // walk balanced braces, respecting strings
        let depth = 0;
        let inStr = false;
        let esc = false;
        const objStart = i;
        for (; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (esc) { esc = false; continue; }
          if (ch === "\\") { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) { i++; break; }
          }
        }
        if (depth !== 0) break; // truncated mid-object → stop
        const objText = cleaned.slice(objStart, i);
        try {
          recovered.push(JSON.parse(objText));
        } catch {
          try { recovered.push(JSON.parse(objText.replace(/,(\s*[}\]])/g, "$1"))); } catch {}
        }
      }
      if (recovered.length > 0) return { questions: recovered };
    }
  }

  throw new Error(`Model returned malformed JSON: ${cleaned.slice(0, 200)}`);
}

// Filter to questions that satisfy our schema (drop the rest instead of failing the whole batch).
// Now KEEPS questions that have only 1 option (the correct answer) — they will be expanded
// with AI-generated distractors by expandIncompleteQuestions() before insert.
function salvageQuestions(parsed: any): { questions: any[] } {
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const out: any[] = [];
  for (const q of list) {
    if (!q || typeof q.prompt !== "string" || !q.prompt.trim()) continue;
    const opts = Array.isArray(q.options) ? q.options : [];
    const cleaned: { letter: "A"|"B"|"C"|"D"|"E"|"F"; body: string; is_correct: boolean }[] = opts
      .filter((o: any) => o && typeof o.body === "string" && o.body.trim())
      .slice(0, 6)
      .map((o: any, i: number) => ({
        letter: (["A","B","C","D","E","F"] as const)[i],
        body: String(o.body).trim(),
        is_correct: !!o.is_correct,
      }));
    if (cleaned.length < 1) continue;
    if (cleaned.filter((o) => o.is_correct).length !== 1) {
      cleaned.forEach((o, i) => { o.is_correct = i === 0; });
    }
    out.push({
      prompt: q.prompt.trim(),
      options: cleaned,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
      subject_hint: typeof q.subject_hint === "string" ? q.subject_hint.trim() : undefined,
      subject_reason: typeof q.subject_reason === "string" ? q.subject_reason.trim() : undefined,
      concept_tag: typeof q.concept_tag === "string" ? q.concept_tag.trim() : undefined,
    });
  }
  return { questions: out };
}

// ─── Distractor generation for incomplete MCQs ───────────────────────────────
// When the source PDF only shows "Question? <highlighted correct answer>" with no
// A/B/C/D list, the extractor returns 1 option (the correct one). We then call
// Lovable AI (free, fast) to generate 3 plausible-but-wrong distractors and
// assemble a real 4-option MCQ with the correct answer shuffled to a random slot.

const DISTRACTOR_SYSTEM = `You write WRONG English answer choices to be used as distractors for a medical MCQ.

Return STRICT JSON only:
{"wrong":["...","...","..."]}

Rules:
- Exactly 3 strings.
- Each must be a PLAUSIBLE-LOOKING answer to the given question but UNAMBIGUOUSLY INCORRECT.
- Same topic/category, similar length and register as the correct answer.
- Do NOT include the correct answer, its synonyms, or near-paraphrases.
- No markdown, no numbering, no commentary.`;

async function generateDistractors(stem: string, correct: string): Promise<string[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [`not "${correct}" (A)`, `not "${correct}" (B)`, `not "${correct}" (C)`];
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: DISTRACTOR_SYSTEM },
          { role: "user", content: `Question: ${stem}\nCorrect answer: ${correct}\n\nReturn JSON {"wrong":[...]} with 3 wrong choices.` },
        ],
        response_format: { type: "json_object" },
      }),
    }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed?.wrong) ? parsed.wrong : [];
    const cleaned = arr.map((w: any) => String(w).trim())
      .filter((w: string) => w && w.toLowerCase() !== correct.toLowerCase())
      .slice(0, 3);
    while (cleaned.length < 3) cleaned.push(`none of the above (${cleaned.length + 1})`);
    return cleaned;
  } catch {
    return [`not "${correct}" (A)`, `not "${correct}" (B)`, `not "${correct}" (C)`];
  }
}

async function expandIncompleteQuestions(qs: any[]): Promise<any[]> {
  const tasks = qs.map(async (q) => {
    if (q.options.length >= 4) return q;
    const correct = q.options.find((o: any) => o.is_correct) ?? q.options[0];
    const wrong = await generateDistractors(q.prompt, correct.body);
    const pool = [
      { body: correct.body, is_correct: true },
      { body: wrong[0], is_correct: false },
      { body: wrong[1], is_correct: false },
      { body: wrong[2], is_correct: false },
    ];
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const letters = ["A","B","C","D"] as const;
    return {
      ...q,
      options: pool.map((o, i) => ({ letter: letters[i], body: o.body, is_correct: o.is_correct })),
    };
  });
  return await Promise.all(tasks);
}


async function runProvider(
  supabase: any,
  provider: "gemini" | "lovable",
  pdfBase64: string,
  userText: string,
  strict: boolean = false,
  modelOverride?: string,
  subjectCandidates?: string[],
  lockModel?: boolean,
): Promise<string> {
  const base = strict ? STRICT_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const systemPrompt = withSubjectClassifier(base, subjectCandidates);
  if (provider === "lovable") {
    return await callLovablePdf(pdfBase64, userText, systemPrompt);
  }
  const pool = await getGeminiPool(supabase);
  return await callGeminiPdf(pool, pdfBase64, userText, systemPrompt, modelOverride, lockModel);
}

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return supabase;
}


export const extractQuestionsFromPdfChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    ChunkInput.extend({ strict: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const userText = `${hintLine}This PDF contains pages ${data.startPage}-${data.endPage} of a larger document. Extract EVERY multiple-choice question (MCQ) on these pages — do not skip any. Return JSON.`;
    const raw = await runProvider(supabase, data.provider, data.pdfBase64, userText, !!data.strict, data.modelOverride, data.subjectCandidates, !!data.lockModel);
    const parsed = extractJson(raw);
    const salvaged = salvageQuestions(parsed);
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    return salvaged;
  });

const SingleInput = z.object({
  pdfBase64: z.string().min(100),
  provider: Provider.default("gemini"),
  pageNumber: z.number().int().positive(),
  hint: z.string().optional(),
  strict: z.boolean().optional(),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
  subjectCandidates: SubjectCandidates,
});

export const extractQuestionsFromSinglePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SingleInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const userText = `${hintLine}This single-page PDF is page ${data.pageNumber} of a larger document. Extract EVERY MCQ on it (do not skip any) and return JSON.`;
    const raw = await runProvider(supabase, data.provider, data.pdfBase64, userText, !!data.strict, data.modelOverride, data.subjectCandidates, !!data.lockModel);
    const salvaged = salvageQuestions(extractJson(raw));
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    return salvaged;
  });

// ---- FAST path for scanned PDFs --------------------------------------------
// Sends ONE PDF page directly to Gemini (it OCRs scanned PDFs natively).
// Uses a tiny prompt + short explanations so the round-trip is fast and the
// JSON cannot get truncated mid-response. This is the new primary path for
// "Scanned / Image PDF (Vision)" mode and removes the need for browser-side
// canvas rendering on most files.
const FAST_SYSTEM_PROMPT = `You extract multiple-choice questions from a single scanned page of a medical exam.

Return STRICT JSON only (no markdown fences, no commentary) in this exact shape:
{"questions":[{"prompt":"...","options":[{"letter":"A","body":"...","is_correct":true|false}],"explanation":"Markdown explanation"}]}

Rules:
- Read EVERY visible numbered question on the page.
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true (5 only when the source truly has 5).
- If the source shows multiple choices (a, b, c, d, sometimes e), copy them verbatim in their order.
- If the source shows only the STEM and the single CORRECT answer (no full choice list), INVENT 3 plausible but clearly wrong distractors — same topic/category, similar length, unambiguously incorrect, and SHUFFLE so the correct answer is not always A.
- If a handwritten tick / checkmark / circle / underline marks one letter, that is the correct answer. Otherwise pick the medically correct one.
- SKIP a question only when its STEM itself is unreadable or cut off by the page edge.
- The "explanation" field MUST be GitHub-flavored Markdown following this template exactly:

**Concept**

2-4 short sentences. Bold **key terms** inline.

**Why the correct answer is right**

- 3-5 bullets. Bold the **mechanism** or **key fact** in each.
- End with a one-line clinical pearl bullet.

**Why the other options are wrong**

- **A) <short option text>** — one tight sentence (skip the correct letter, only list real options).

**Summary**

| Option | Verdict | One-line reason |
|---|---|---|
| A | ✗ | … |
| B | ✓ Correct | … |
(One row per option in order. Mark correct row with ✓ Correct.)

- Write in English unless the hint asks otherwise.
- If no complete MCQ is visible, return {"questions":[]}.
- Output JSON only — no code fences, no commentary outside the JSON.`;

async function runProviderFast(
  supabase: any,
  provider: "gemini" | "lovable",
  pdfBase64: string,
  userText: string,
  modelOverride?: string,
  subjectCandidates?: string[],
  lockModel?: boolean,
): Promise<string> {
  const systemPrompt = withSubjectClassifier(FAST_SYSTEM_PROMPT, subjectCandidates);
  if (provider === "lovable") {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "file", file: { filename: "page.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) throw new Error(`Lovable AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return j.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("Lovable AI timed out after 90s");
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  const pool = await getGeminiPool(supabase);
  return await callGeminiJSON({
    pool,
    systemPrompt,
    userParts: [
      { text: userText },
      { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
    ],
    timeoutMs: 90_000,
    generationConfig: { temperature: 0.15, maxOutputTokens: 24576 },
    onlyModel: "gemini-2.5-flash-lite",
  });
}

export const extractScannedPdfPageFast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SingleInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const userText = `${hintLine}This is page ${data.pageNumber} of a scanned medical exam booklet. OCR the page and extract every complete MCQ. Return JSON only.`;
    const raw = await runProviderFast(supabase, data.provider, data.pdfBase64, userText, data.modelOverride, data.subjectCandidates, !!data.lockModel);
    const salvaged = salvageQuestions(extractJson(raw));
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    return salvaged;
  });

// ---- TEXT-FIRST path -------------------------------------------------------
// For text-readable PDFs, send only the already-extracted text instead of the
// whole PDF bytes. Cuts input tokens dramatically — especially valuable on
// gemini-2.5-flash for large 500-question imports.
const TextInput = z.object({
  pageText: z.string().min(20),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  hint: z.string().optional(),
  strict: z.boolean().optional(),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
  subjectCandidates: SubjectCandidates,
});

export const extractQuestionsFromPageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TextInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const rangeLabel = data.startPage === data.endPage
      ? `page ${data.startPage}`
      : `pages ${data.startPage}-${data.endPage}`;
    const userText = `${hintLine}Below is the RAW EXTRACTED TEXT of ${rangeLabel} from a medical MCQ booklet. Parse EVERY numbered multiple-choice question and return JSON only. Follow the JSON shape and the Markdown explanation template exactly.\n\n--- BEGIN PAGE TEXT ---\n${data.pageText}\n--- END PAGE TEXT ---`;
    const pool = await getGeminiPool(supabase);
    const base = data.strict ? STRICT_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const systemPrompt = withSubjectClassifier(base, data.subjectCandidates);
    const raw = await callGeminiJSON({
      pool,
      systemPrompt,
      userParts: [{ text: userText }],
      timeoutMs: 120_000,
      generationConfig: { temperature: 0.15, maxOutputTokens: 32768 },
      onlyModel: "gemini-2.5-flash-lite",
    });
    const salvaged = salvageQuestions(extractJson(raw));
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    return salvaged;
  });

// ---- BATCH SUBJECT CLASSIFIER ----------------------------------------------
// One cheap text-only Gemini call classifies many question stems at once.
// Sent ONCE per batch instead of appended to every extraction prompt.
// Returns [{i, s}] where i = 1-based index, s = exact subject name or "UNKNOWN".
const ClassifyInput = z.object({
  stems: z.array(z.string().min(1).max(2000)).min(1).max(40),
  candidates: z.array(z.string().min(1).max(120)).min(1).max(120),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
});

const CLASSIFY_SYSTEM = `You are a medical MCQ subject classifier. For each question stem, pick the single best matching subject from the provided list. Return ONLY a JSON array of {"i":<1-based index>,"s":"<exact subject name or UNKNOWN>"}. No prose, no markdown.`;

export const classifyQuestionsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClassifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const pool = await getGeminiPool(supabase);
    const candidateList = data.candidates.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const stemList = data.stems
      .map((s, i) => `${i + 1}. ${s.replace(/\s+/g, " ").slice(0, 600)}`)
      .join("\n");
    const userText = `Subjects (use exact names; if none fit, use "UNKNOWN"):\n${candidateList}\n\nQuestions:\n${stemList}\n\nReturn JSON array only.`;
    const raw = await callGeminiJSON({
      pool,
      systemPrompt: CLASSIFY_SYSTEM,
      userParts: [{ text: userText }],
      timeoutMs: 60_000,
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      onlyModel: "gemini-2.5-flash-lite",
    });
    // Parse — accept either array or object wrapper.
    let arr: any[] = [];
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      arr = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed?.results) ? parsed.results
        : Array.isArray(parsed?.x) ? parsed.x
        : [];
    } catch {
      // Try to recover an array slice
      const lb = cleaned.indexOf("[");
      const rb = cleaned.lastIndexOf("]");
      if (lb !== -1 && rb > lb) {
        try { arr = JSON.parse(cleaned.slice(lb, rb + 1)); } catch { arr = []; }
      }
    }
    if (!Array.isArray(arr)) arr = [];
    const validNames = new Set(data.candidates.map((c) => c.toLowerCase()));
    const out: { i: number; subject: string }[] = [];
    for (const row of arr) {
      const i = Number(row?.i ?? row?.index);
      const s = String(row?.s ?? row?.subject ?? "").trim();
      if (!Number.isFinite(i) || i < 1 || i > data.stems.length) continue;
      const matched = validNames.has(s.toLowerCase()) ? s : "UNKNOWN";
      out.push({ i, subject: matched });
    }
    return { results: out };
  });

// Probe which providers are usable (admin Gemini key present, Lovable key always available server-side)
export const listPdfProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = await ensureAdmin(context);
    const { data } = await supabase
      .from("admin_ai_keys")
      .select("provider")
      .eq("provider", "gemini")
      .limit(1);
    return {
      gemini: !!(data && data.length),
      lovable: !!process.env.LOVABLE_API_KEY,
    };
  });

// ============================================================================
// BOOKEND SLICING PIPELINE (cheap, text-only)
// ----------------------------------------------------------------------------
// 1. extractBookends — given a 2-page text chunk, return [{first_4_words,
//    last_4_words}] for every question. ~8 words per question = tiny output.
// 2. solveQuestion   — given ONE pre-sliced question string, return
//    {prompt, options[], explanation, subject_hint} in a single call.
// Both are text-only Gemini calls (no PDF, no images).
// ============================================================================

const BOOKEND_SYSTEM = `You segment medical exam pages into individual questions.

Input: raw text of 1-4 pages from a question bank (MCQs and/or short OSCE prompts).
Output: STRICT JSON array, one object per distinct question, in reading order.

Each element MUST be ONE of these two shapes:

  A. LONG question (the full stem + options is more than ~15 words):
     {"first_words":"<first 5 consecutive words of the stem, verbatim>",
      "last_words":"<last 5 consecutive words of the last option / tail, verbatim>"}

  B. SHORT question (whole question + answer fits in ~15 words or less,
     e.g. one-liner OSCE prompts, "Drug of choice for X? — Y"):
     {"exact_text":"<the entire short question verbatim — stem AND the answer/options if shown>"}

Rules:
- ALWAYS prefer shape B for short or one-line questions: this is what fixes the long-standing problem where short questions were dropped because their first 5 words overlapped with another question.
- For shape A, "first_words" / "last_words" MUST appear VERBATIM in the input text so a substring search can locate them. Preserve case, punctuation, and any leading numbering (e.g. "1." or "Q3)") if present.
- For shape B, "exact_text" MUST also appear VERBATIM in the input text.
- Return the FULL array — EVERY question on these pages must appear, in reading order. Missing questions is the worst possible failure.
- If you cannot fit every question within the response budget, stop at the LAST fully-formed object — never emit a partial object, never pad. The caller will halve the range and retry.
- Do NOT include explanations, page headers, page numbers, chapter titles, or anything that is not a question.
- If there are no questions, return [].
- Output ONLY the JSON array. No prose, no markdown fences.`;

const BookendInput = z.object({
  chunkText: z.string().min(20),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  hint: z.string().optional(),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
});

// Lenient parser: recover the longest valid prefix of a JSON array even when
// the model truncated mid-output. Mirrors extractJson() but for top-level arrays.
function parseBookendArray(text: string): any[] {
  let s = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p;
    if (Array.isArray((p as any)?.questions)) return (p as any).questions;
    if (Array.isArray((p as any)?.bookends)) return (p as any).bookends;
  } catch {}
  const lb = s.indexOf("[");
  const rb = s.lastIndexOf("]");
  if (lb !== -1 && rb > lb) {
    const slice = s.slice(lb, rb + 1);
    try { return JSON.parse(slice); } catch {}
    try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1")); } catch {}
  }
  const start = lb !== -1 ? lb + 1 : s.indexOf("{");
  if (start === -1) return [];
  const out: any[] = [];
  let i = start;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length || s[i] === "]") break;
    if (s[i] !== "{") break;
    let depth = 0, inStr = false, esc = false;
    const objStart = i;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    if (depth !== 0) break;
    const txt = s.slice(objStart, i);
    try { out.push(JSON.parse(txt)); }
    catch {
      try { out.push(JSON.parse(txt.replace(/,(\s*[}\]])/g, "$1"))); } catch {}
    }
  }
  return out;
}

export const extractBookends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookendInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const pool = await getGeminiPool(supabase);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const rangeLabel = data.startPage === data.endPage
      ? `page ${data.startPage}`
      : `pages ${data.startPage}-${data.endPage}`;
    const userText = `${hintLine}Below is the raw text of ${rangeLabel}. Find every distinct question (long OR short) and return the hybrid JSON array described in the system prompt — use shape B (exact_text) for any short / one-line question.\n\n--- BEGIN TEXT ---\n${data.chunkText.slice(0, 200_000)}\n--- END TEXT ---`;
    const raw = await callGeminiJSON({
      pool,
      systemPrompt: BOOKEND_SYSTEM,
      userParts: [{ text: userText }],
      timeoutMs: 180_000,
      generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json" },
      onlyModel: "gemini-2.5-flash-lite",
    });

    const arr = parseBookendArray(raw);
    type Out = { first_words?: string; last_words?: string; exact_text?: string };
    const out: Out[] = [];
    for (const row of arr) {
      const exact = String(row?.exact_text ?? row?.exact ?? row?.text ?? "").trim();
      const f = String(row?.first_words ?? row?.first_6_words ?? row?.first_5_words ?? row?.first_4_words ?? row?.first ?? "").trim();
      const l = String(row?.last_words ?? row?.last_6_words ?? row?.last_5_words ?? row?.last_4_words ?? row?.last ?? "").trim();
      if (exact && exact.length >= 5) {
        out.push({ exact_text: exact });
      } else if (f && l) {
        out.push({ first_words: f, last_words: l });
      }
    }
    // Keep legacy field names alongside the new ones so callers still reading
    // first_4_words/last_4_words don't break.
    return {
      bookends: out.map((b) => ({
        first_4_words: b.first_words,
        last_4_words: b.last_words,
        first_words: b.first_words,
        last_words: b.last_words,
        exact_text: b.exact_text,
      })),
    };
  });

// ---- SOLVER: one call per question, returns everything at once -------------

const SOLVER_SYSTEM = `You are a medical MCQ solver. The user gives you ONE complete question (stem + options, or an OSCE prompt). Solve it and explain it.

Return STRICT JSON only (no markdown fences, no commentary) in this exact shape:
{
  "prompt": "the question stem, plain text",
  "options": [{"letter":"A","body":"...","is_correct":true|false}],
  "explanation": "Markdown explanation (template below)",
  "concept_tag": "≤6 words naming the core concept tested",
  "subject_hint": "exact subject name from the provided list, or UNKNOWN",
  "subject_reason": "≤8 words citing a term from your explanation that justifies subject_hint"
}

IMPORTANT — fill the JSON keys TOP-DOWN in the exact order shown. Do not pick subject_hint before you have written explanation and concept_tag.

Rules:
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true (5-6 only if the source genuinely lists that many).
- If the source already lists choices, copy them verbatim and in order.
- If only the correct answer is shown, INVENT 3 plausible-but-wrong distractors (same topic/category, similar length, unambiguously incorrect) and SHUFFLE so the correct answer is not always A.
- If a letter is marked (✓, tick, highlight, "Answer: c"), that letter is correct. Otherwise pick the medically correct one.
- "explanation" MUST be GitHub-flavored Markdown matching this template exactly:

**Concept**

2-4 short sentences. Bold **key terms** inline.

**Why the correct answer is right**

- 3-5 bullets. Bold the **mechanism** or **key fact** in each.
- End with a one-line clinical pearl bullet.

**Why the other options are wrong**

- **A) <short option text>** — one tight sentence (skip the correct letter, only list real options).

**Summary**

| Option | Verdict | One-line reason |
|---|---|---|
| A | ✗ | … |
| B | ✓ Correct | … |
(One row per option in order. Mark correct row with ✓ Correct.)

- "subject_hint": you will be given the COMPLETE list of subjects for ONE section. Read EVERY entry before choosing. Pick the single subject whose scope best matches the MECHANISM in your explanation. If two seem close, choose the more specific one. Copy the name VERBATIM (including any typos or odd capitalisation). If the list is empty or NO entry could reasonably own this mechanism, output "UNKNOWN". Never invent a subject name.
- Before choosing "subject_hint", re-read your own "explanation" and "concept_tag". The subject MUST be the field that owns the mechanism you just described — NOT just the organ or disease named in the stem.
- If two subjects could fit, pick the one matching the MECHANISM in your explanation (e.g. an MI question whose explanation focuses on troponin kinetics → Biochemistry, not Cardiology; an antibiotic question whose explanation focuses on ribosomal binding → Microbiology/Pharmacology of the mechanism, not the infected organ).
- "concept_tag" and "subject_hint" must be consistent. If they conflict, fix "subject_hint" first.
- Wrong sorting is worse than UNKNOWN. If unsure, output "UNKNOWN".
- Write in English unless the hint asks otherwise.
- Output JSON only.`;

const SolverInput = z.object({
  questionText: z.string().min(5).max(8000),
  subjectCandidates: SubjectCandidates,
  hint: z.string().optional(),
  modelOverride: z.string().optional(),
  lockModel: z.boolean().optional(),
});

// Local guard: confirm the chosen subject is actually grounded in the model's
// own reasoning. Splits subject name into significant tokens (>=4 chars, not
// stopwords) and requires at least one to appear in concept_tag /
// subject_reason / explanation. Cheap, no AI.
const SUBJECT_STOPWORDS = new Set([
  "and","the","for","with","into","from","general","medical","clinical",
  "basic","applied","systems","system","intro","introduction","study","studies",
]);
function subjectMatchesReasoning(subject: string, q: any): boolean {
  const haystack = [
    String(q?.concept_tag || ""),
    String(q?.subject_reason || ""),
    String(q?.explanation || "").slice(0, 600),
  ].join(" ").toLowerCase();
  if (!haystack.trim()) return true; // nothing to check against; trust model
  const tokens = subject
    .toLowerCase()
    .split(/[^a-z\u0600-\u06ff]+/)
    .filter((t) => t.length >= 4 && !SUBJECT_STOPWORDS.has(t));
  if (tokens.length === 0) return true; // subject name is too generic to gate
  // require any significant token, OR a 4-letter stem match (handles plurals/-ology)
  return tokens.some((t) => haystack.includes(t) || haystack.includes(t.slice(0, 5)));
}

export const solveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SolverInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const pool = await getGeminiPool(supabase);
    const subjectsBlock = (data.subjectCandidates && data.subjectCandidates.length)
      ? `\n\nAvailable subjects (pick ONE exact name, case-sensitive, or "UNKNOWN"):\n${data.subjectCandidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
      : "";
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const userText = `${hintLine}Solve this question and return the JSON described in the system prompt.${subjectsBlock}\n\n--- QUESTION ---\n${data.questionText}\n--- END ---`;
    const raw = await callGeminiJSON({
      pool,
      systemPrompt: SOLVER_SYSTEM,
      userParts: [{ text: userText }],
      timeoutMs: 90_000,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      onlyModel: "gemini-2.5-flash-lite",
    });
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const lb = cleaned.indexOf("{");
      const rb = cleaned.lastIndexOf("}");
      if (lb !== -1 && rb > lb) {
        try { parsed = JSON.parse(cleaned.slice(lb, rb + 1)); } catch { parsed = null; }
      }
    }
    if (!parsed) throw new Error("Solver returned malformed JSON");
    const salvaged = salvageQuestions({ questions: [parsed] });
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    const q = salvaged.questions[0];
    if (!q) throw new Error("Solver returned no usable question");
    if (data.subjectCandidates && data.subjectCandidates.length) {
      const valid = new Set(data.subjectCandidates.map((c) => c.toLowerCase()));
      const h = String(q.subject_hint || "").trim();
      if (!h || !valid.has(h.toLowerCase())) q.subject_hint = "UNKNOWN";
      // Do not reject an exact valid subject only because its literal words do
      // not appear in the explanation. Chapter-style subjects often classify by
      // mechanism + local PDF heading, not by repeating the heading text.
    }
    return { question: q };
  });

// --- Vision mode: extract MCQs from scanned / image-based PDFs ---------------

const VISION_SYSTEM_PROMPT = `You are an OCR + MCQ extractor for scanned medical exam pages.

The user will send you 1-2 page IMAGES (photos or scans). Read every visible word and extract every numbered multiple-choice question.

Return STRICT JSON only (no markdown fences, no commentary) in this exact shape:
{
  "questions": [
    {
      "prompt": "the question stem, plain text, exactly as written",
      "options": [
        {"letter":"A","body":"...","is_correct":true|false}
      ],
      "explanation": "Markdown explanation"
    }
  ]
}

Rules:
- Extract EVERY numbered question visible across the supplied images, preserving order — INCLUDING questions that only show the correct answer.
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true (5-6 only when the source truly has that many).
- If multiple choices are shown, copy them verbatim in their order.
- If the source shows only the STEM and the single CORRECT answer (no full choice list), INVENT 3 plausible but clearly wrong distractors — same topic/category, similar length and register, unambiguously incorrect, SHUFFLED so the correct answer is not always A.
- If a handwritten checkmark, tick, circle, or other mark is drawn on a letter (A/B/C/D), treat THAT letter as the correct answer. Otherwise pick the medically correct option.
- A question may span across the two images — combine them when the next image continues the stem or options.
- The "explanation" field must be GitHub-flavored Markdown following this template exactly:

**Concept**

2-4 short sentences. Bold **key terms** inline.

**Why the correct answer is right**

- 3-5 bullets. Bold the **mechanism** or **key fact** in each.
- End with a one-line clinical pearl bullet.

**Why the other options are wrong**

- **A) <short option text>** — one tight sentence (skip the correct letter, only list real options).

**Summary**

| Option | Verdict | One-line reason |
|---|---|---|
| A | ✗ | … |
| B | ✓ Correct | … |
(One row per option in order. Mark correct row with ✓ Correct.)

- Write in English unless the hint asks otherwise.
- If no valid MCQs are visible, return {"questions": []}.
- Output JSON only — no code fences, no commentary outside the JSON.`;

const VisionInput = z.object({
  images: z
    .array(
      z.object({
        base64: z.string().min(100),
        mimeType: z.string().default("image/jpeg"),
      }),
    )
    .min(1)
    .max(4),
  provider: Provider.default("gemini"),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  hint: z.string().optional(),
  modelOverride: z.string().optional(),
  subjectCandidates: SubjectCandidates,
});

async function callLovableVision(
  images: { base64: string; mimeType: string }[],
  userText: string,
  systemPrompt: string,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const content: any[] = [{ type: "text", text: userText }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Lovable AI ${r.status}: ${t.slice(0, 300)}`);
    }
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? "";
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Lovable AI vision timed out after 90s");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiVision(
  pool: GeminiPool,
  images: { base64: string; mimeType: string }[],
  userText: string,
  systemPrompt: string,
  modelOverride?: string,
): Promise<string> {
  const parts: any[] = [{ text: userText }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  return await callGeminiJSON({
    pool,
    systemPrompt,
    userParts: parts,
    timeoutMs: 120_000,
    generationConfig: { temperature: 0.2, maxOutputTokens: 32768 },
    onlyModel: modelOverride,
  });
}

export const extractQuestionsFromPageImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VisionInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await ensureAdmin(context);
    const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
    const rangeLabel =
      data.startPage === data.endPage
        ? `page ${data.startPage}`
        : `pages ${data.startPage}-${data.endPage}`;
    const userText = `${hintLine}These images are ${rangeLabel} of a scanned exam booklet. OCR every word and extract every MCQ. Return JSON only.`;
    const systemPrompt = withSubjectClassifier(VISION_SYSTEM_PROMPT, data.subjectCandidates);

    async function attempt(): Promise<string> {
      if (data.provider === "lovable") {
        return await callLovableVision(data.images, userText, systemPrompt);
      }
      const pool = await getGeminiPool(supabase);
      return await callGeminiVision(pool, data.images, userText, systemPrompt, data.modelOverride);
    }
    let raw: string;
    try {
      raw = await attempt();
    } catch (e: any) {
      // one retry with 1.5s backoff on transient failures
      await new Promise((r) => setTimeout(r, 1500));
      try {
        raw = await attempt();
      } catch (e2: any) {
        throw new Error(
          `Vision extraction failed for ${rangeLabel}: ${e2?.message ?? String(e2)}`,
        );
      }
    }
    const salvaged = salvageQuestions(extractJson(raw));
    salvaged.questions = await expandIncompleteQuestions(salvaged.questions);
    return salvaged;
  });

