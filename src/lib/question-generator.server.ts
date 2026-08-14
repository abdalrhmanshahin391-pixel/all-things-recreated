// Server-only helpers for the admin Questions Generator.
// Calls the admin's own OpenAI / Gemini account (keys stored in admin_ai_keys).

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

/** Concrete model ids that are known to work with the keys saved on this site. */
export const GEMINI_MODEL_CHAIN = ["gemini-2.5-flash-lite", "gemini-2.5-flash"] as const;

/** Aliases that have proven unreliable — never used on their own. */
const GEMINI_ALIASES = new Set(["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest"]);

function geminiCandidates(preferred?: string): string[] {
  const out: string[] = [];
  const p = (preferred ?? "").trim();
  if (p && !GEMINI_ALIASES.has(p)) out.push(p);
  for (const m of GEMINI_MODEL_CHAIN) if (!out.includes(m)) out.push(m);
  return out;
}

export const AI_PROVIDERS = ["openai", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function defaultModelFor(provider: AiProvider) {
  return provider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
}

export type InputImage = { mime: string; base64: string };

export const QUESTION_MODES = ["extract", "generate", "solve_ref", "solve"] as const;
export type QuestionMode = (typeof QUESTION_MODES)[number];

export type GeneratedOption = {
  letter: string;
  body: string;
  is_correct: boolean;
  wrong_reason: string;
};

export type GeneratedQuestion = {
  stem: string;
  options: GeneratedOption[];
  correct_explanation: string;
  reference_note: string;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stem: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                letter: { type: "string" },
                body: { type: "string" },
                is_correct: { type: "boolean" },
                wrong_reason: { type: "string" },
              },
              required: ["letter", "body", "is_correct", "wrong_reason"],
            },
          },
          correct_explanation: { type: "string" },
          reference_note: { type: "string" },
        },
        required: ["stem", "options", "correct_explanation", "reference_note"],
      },
    },
  },
  required: ["questions"],
} as const;


const BASE_RULES = `You are a medical exam question editor.
Return STRICT JSON matching the provided schema. Rules for every question:
- "stem": the full question text, cleaned of page numbers, headers and OCR noise.
- "options": 4 options unless the source clearly has a different number (2-6 allowed). Letters A, B, C, ...
- Exactly ONE option has is_correct = true.
- For the correct option, set "wrong_reason" to "" (empty string).
- For EVERY wrong option, "wrong_reason" must explain in one or two sentences WHY that option is wrong.
- "correct_explanation": explain WHY the correct answer is correct (mechanism / reasoning, not just a restatement).
- "reference_note": chapter, section or source sentence you relied on; "" if none.
- Never invent an answer you are unsure about — say so inside correct_explanation instead.`;

export function buildQuestionPrompt(input: {
  mode: QuestionMode;
  text: string;
  referenceText?: string;
  notes?: string;
  count?: number;
  difficulty?: string;
  language?: string;
  hasImages?: boolean;
}): { system: string; user: string } {
  const lang = input.language === "ar" ? "Arabic" : "English";
  const src = input.hasImages ? "attached page IMAGES" : "SOURCE below";
  let task = "";
  switch (input.mode) {
    case "extract":
      task = `The ${src} already contains exam questions. Extract and clean EVERY question you find, split stem and options, mark the correct answer, and write the explanations. Do not invent extra questions.`;
      break;
    case "generate":
      task = `The ${src} is study material. Write ${input.count ?? 10} NEW multiple-choice questions from it, ${input.difficulty ?? "mixed"} difficulty, covering the important points.`;
      break;
    case "solve_ref":
      task = `The ${src} contains questions to be ANSWERED. Use the REFERENCE material as your primary evidence, and cite it in "reference_note". Keep the original wording of the stems and options; only decide the correct answer and write the explanations.`;
      break;
    case "solve":
      task = `The ${src} contains questions to be ANSWERED using standard medical knowledge. Keep the original wording of the stems and options; only decide the correct answer and write the explanations.`;
      break;
  }

  const system = `${BASE_RULES}\nWrite all output in ${lang}.`;
  const parts = [task];
  if (input.hasImages) {
    parts.push(
      `The attached images are scanned pages of a PDF. Read every question visible on them (including options), transcribe the text accurately, and ignore page headers, footers and watermarks.`,
    );
  }
  if (input.notes?.trim()) parts.push(`ADMIN NOTES (follow these strictly):\n${input.notes.trim()}`);
  if (input.mode === "solve_ref" && input.referenceText?.trim()) {
    parts.push(`REFERENCE MATERIAL:\n"""\n${input.referenceText.trim().slice(0, 120_000)}\n"""`);
  }
  if (input.text.trim()) parts.push(`SOURCE:\n"""\n${input.text.slice(0, 120_000)}\n"""`);
  return { system, user: parts.join("\n\n") };
}

class OpenAiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`OpenAI ${status}: ${message}`);
    this.status = status;
  }
}

async function openAiFetch(apiKey: string, body: unknown): Promise<any> {
  // No client-side timeout on purpose: long documents legitimately take minutes.
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    let message = raw.slice(0, 400);
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? message;
    } catch {
      /* keep raw */
    }
    throw new OpenAiError(res.status, message);
  }
  return JSON.parse(raw);
}

export async function pingOpenAi(apiKey: string, model: string) {
  const json = await openAiFetch(apiKey, {
    model,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
    max_completion_tokens: 8,
  });
  const text = json?.choices?.[0]?.message?.content ?? "";
  return { ok: true, model, reply: String(text).slice(0, 40) };
}

function normalize(list: any[]): GeneratedQuestion[] {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const out: GeneratedQuestion[] = [];
  for (const q of list) {
    const stem = String(q?.stem ?? "").trim();
    const rawOptions = Array.isArray(q?.options) ? q.options : [];
    if (!stem || rawOptions.length < 2) continue;
    const options: GeneratedOption[] = rawOptions.slice(0, 6).map((o: any, i: number) => ({
      letter: letters[i] ?? String(i + 1),
      body: String(o?.body ?? o?.text ?? "").trim(),
      is_correct: !!o?.is_correct,
      wrong_reason: String(o?.wrong_reason ?? "").trim(),
    }));
    if (options.some((o) => !o.body)) continue;
    if (!options.some((o) => o.is_correct)) options[0].is_correct = true;
    // Keep exactly one correct option.
    let seen = false;
    for (const o of options) {
      if (o.is_correct && seen) o.is_correct = false;
      else if (o.is_correct) seen = true;
      if (o.is_correct) o.wrong_reason = "";
    }
    out.push({
      stem,
      options,
      correct_explanation: String(q?.correct_explanation ?? "").trim(),
      reference_note: String(q?.reference_note ?? "").trim(),
    });
  }
  return out;
}

/** Pull complete {...} objects out of a possibly truncated JSON array body. */
function salvageObjects(text: string): any[] {
  const out: any[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (obj && typeof obj === "object" && "stem" in obj) out.push(obj);
        } catch {
          /* skip */
        }
        start = -1;
      }
    }
  }
  return out;
}

function extractQuestions(content: string): {
  questions: GeneratedQuestion[];
  parsed: boolean;
  salvaged: boolean;
} {
  let text = content.trim();
  // Strip markdown fences some models add around JSON.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    let ok = false;
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
        ok = true;
      } catch {
        /* fall through to salvage */
      }
    }
    if (!ok) {
      // Truncated reply: keep every question that was fully written before the cut.
      const salvagedList = salvageObjects(text);
      const questions = normalize(salvagedList);
      return { questions, parsed: questions.length > 0, salvaged: true };
    }
  }
  const list = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
      ? parsed
      : [];
  return { questions: normalize(list), parsed: true, salvaged: false };
}

export type QuestionCallResult = {
  questions: GeneratedQuestion[];
  note: string;
  rawPreview: string;
  truncated?: boolean;
  modelUsed?: string;
};


export async function callOpenAiQuestions(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  images: InputImage[] = [],
): Promise<QuestionCallResult> {
  const userContent: any = images.length
    ? [
        { type: "text", text: user },
        ...images.map((im) => ({
          type: "image_url",
          image_url: { url: `data:${im.mime};base64,${im.base64}` },
        })),
      ]
    : user;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];

  let json: any;
  let note = "";
  try {
    json = await openAiFetch(apiKey, {
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "question_batch", strict: true, schema: RESPONSE_SCHEMA },
      },
    });
  } catch (e) {
    const status = e instanceof OpenAiError ? e.status : 0;
    if (status !== 400 && status !== 404 && status !== 422) throw e;
    // Fallback: plain JSON mode for models that reject strict structured output.
    note = `Structured output rejected (${e instanceof Error ? e.message : "error"}); retried in plain JSON mode.`;
    json = await openAiFetch(apiKey, {
      model,
      messages: [
        { role: "system", content: `${system}\nRespond with a single JSON object: {"questions": [...]}.` },
        ...messages.slice(1),
      ],
      response_format: { type: "json_object" },
    });
  }

  const content = String(json?.choices?.[0]?.message?.content ?? "");
  const finish = json?.choices?.[0]?.finish_reason ?? "";
  const { questions, parsed, salvaged } = extractQuestions(content || "{}");
  const cut = finish === "length" || salvaged;
  if (!parsed && !cut) {
    throw new Error(`The model did not return valid JSON${finish ? ` (finish_reason: ${finish})` : ""}.`);
  }
  if (cut) {
    note = `${note} Reply was cut off — kept ${questions.length} complete question(s); the rest of this part will be split and retried.`.trim();
  }
  return { questions, note, rawPreview: content.slice(0, 600), truncated: cut };
}


// ── Gemini ───────────────────────────────────────────────────────────

function geminiUrl(model: string) {
  const id = encodeURIComponent(model.trim() || DEFAULT_GEMINI_MODEL);
  return `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`;
}

async function geminiFetch(apiKey: string, model: string, body: unknown): Promise<any> {
  // No client-side timeout on purpose: long documents legitimately take minutes.
  const res = await fetch(geminiUrl(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    let message = raw.slice(0, 400);
    try {
      message = JSON.parse(raw)?.error?.message ?? message;
    } catch {
      /* keep raw */
    }
    throw new Error(`Gemini ${res.status}: ${message}`);
  }
  return JSON.parse(raw);
}

function geminiText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => String(p?.text ?? "")).join("").trim();
}

/** True when the failure is "this model id can't be used", so the next one should be tried. */
function isModelUnavailable(message: string): boolean {
  return (
    /\b404\b/.test(message) ||
    /not found|is not supported|not supported for|unsupported|does not exist/i.test(message)
  );
}

/** Human-readable reason for an empty Gemini reply. */
function emptyReplyReason(json: any): string {
  const cand = json?.candidates?.[0];
  const finish = String(cand?.finishReason ?? "");
  const block = String(json?.promptFeedback?.blockReason ?? "");
  if (block) return `the request was blocked by Gemini's safety filter (${block})`;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "RECITATION") {
    return `Gemini stopped the reply (${finish})`;
  }
  if (finish === "MAX_TOKENS") return "the reply hit the output limit before any question was written";
  if (!cand) return "Gemini returned no candidate at all (usually a quota or key problem)";
  return `Gemini returned an empty reply${finish ? ` (finish: ${finish})` : ""}`;
}

export async function pingGemini(apiKey: string, model: string) {
  let lastError = "";
  for (const candidate of geminiCandidates(model)) {
    try {
      const json = await geminiFetch(apiKey, candidate, {
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
        generationConfig: { maxOutputTokens: 16 },
      });
      return { ok: true, model: candidate, reply: geminiText(json).slice(0, 40) || "ok" };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (!isModelUnavailable(lastError)) throw e;
    }
  }
  throw new Error(lastError || "No usable Gemini model for this key.");
}

export async function callGeminiQuestions(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  images: InputImage[] = [],
): Promise<QuestionCallResult> {
  const parts: any[] = [{ text: user }];
  for (const im of images) {
    parts.push({ inlineData: { mimeType: im.mime, data: im.base64 } });
  }
  const MAX_OUT = 32768;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: MAX_OUT,
    },
  };

  let json: any;
  let note = "";
  try {
    json = await geminiFetch(apiKey, model, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (!/\b(400|404)\b/.test(msg)) throw e;
    note = `First attempt rejected (${msg}); retried in plain JSON mode.`;
    json = await geminiFetch(apiKey, model, {
      ...body,
      systemInstruction: {
        parts: [{ text: `${system}\nRespond with a single JSON object: {"questions": [...]}.` }],
      },
      generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUT },
    });
  }

  const content = geminiText(json);
  const finish = json?.candidates?.[0]?.finishReason ?? "";
  const { questions, parsed, salvaged } = extractQuestions(content || "{}");
  const cut = finish === "MAX_TOKENS" || salvaged;
  if (!parsed && !cut) {
    throw new Error(`Gemini did not return valid JSON${finish ? ` (finish: ${finish})` : ""}.`);
  }
  if (cut) {
    note = `${note} Reply was cut off — kept ${questions.length} complete question(s); the rest of this part will be split and retried.`.trim();
  }
  return { questions, note, rawPreview: content.slice(0, 600), truncated: cut };
}



