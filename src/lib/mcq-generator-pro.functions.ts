// MCQ Generator Pro — Server Functions
// Phase 1: extraction only (questions + answer options from scanned PDF pages)
// No answer solving, no answer key PDF — that is Phase 2.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ─── Supported models ────────────────────────────────────────────────────────

const MODELS = {
  "gemini-2.5-flash-lite": {
    provider: "gemini" as const,
    apiModel: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
  },
  "gemini-2.5-flash": {
    provider: "gemini" as const,
    apiModel: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
  },
  "gemini-2.5-pro": {
    provider: "gemini" as const,
    apiModel: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
  },
  "gemini-3.1-pro": {
    provider: "gemini" as const,
    apiModel: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
  },
  "openai-gpt4o": {
    provider: "openai" as const,
    apiModel: "gpt-4o",
    label: "OpenAI GPT-4o",
  },
} as const;

export const MODEL_OPTIONS = Object.entries(MODELS).map(([id, m]) => ({
  id,
  label: m.label,
  provider: m.provider,
}));

type ModelId = keyof typeof MODELS;

export const ModelIdSchema = z.enum([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-pro",
  "openai-gpt4o",
]);

const SESSIONS_TABLE = "mcq_pro_sessions";
const QUESTIONS_TABLE = "mcq_pro_questions";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase, userId } as { supabase: any; userId: string };
}

// ─── AI key helpers ───────────────────────────────────────────────────────────

async function getGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys")
    .select("api_key")
    .eq("provider", "gemini")
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key)
    throw new Error("No Gemini API key configured. Add one in /admin/ai-keys.");
  return data.api_key as string;
}

async function getOpenAIKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys")
    .select("api_key")
    .eq("provider", "openai")
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key)
    throw new Error("No OpenAI API key configured. Add one in /admin/ai-keys.");
  return data.api_key as string;
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

function extractJson(text: string): any | null {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {}
  // Try to find first [ or { and last ] or }
  const lb = cleaned.search(/[[{]/);
  const rb = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (lb !== -1 && rb > lb) {
    try {
      return JSON.parse(cleaned.slice(lb, rb + 1));
    } catch {}
  }
  return null;
}

// ─── Extraction prompt ────────────────────────────────────────────────────────

function buildExtractionPrompt(opts: {
  combinationMode: "keep" | "convert";
  missingOptsMode: "manual" | "ai_generate";
  aiNotes?: string | null;
  pageNumber: number;
  totalPages: number;
}): string {
  const combinationRule =
    opts.combinationMode === "keep"
      ? `- COMBINATION QUESTIONS: If a question lists numbered statements (1, 2, 3…) and then asks "which of the following is correct?" with letter options (A, B, C, D) combining those numbers, keep it exactly as-is. Extract it as a single question of type "single_choice". Copy the stem and all options verbatim.`
      : `- COMBINATION QUESTIONS: If a question lists numbered statements (1, 2, 3…) and then asks "which of the following is correct?" with letter options combining those numbers, CONVERT each numbered statement into a separate boolean option. Set question_type to "multiple_answer". Each individual statement becomes one option, marked whether it is part of the correct combination.`;

  const missingOptsRule =
    opts.missingOptsMode === "manual"
      ? `- MISSING OPTIONS: If a question has a stem but is missing some or all answer choices (e.g. only the stem is visible, or only one option is legible), set needs_manual_options=true and include only the options you can read. Do NOT invent or guess options.`
      : `- MISSING OPTIONS: If a question has a stem but is missing some or all answer choices, generate plausible but clearly wrong medical distractors to complete the options list. Set options_generated_by_ai=true for each invented option.`;

  const userNotes = opts.aiNotes?.trim()
    ? `\n\nEXTRA INSTRUCTIONS FROM ADMIN:\n${opts.aiNotes.trim()}\nFollow these instructions strictly.`
    : "";

  return `You are an expert at reading scanned exam papers. You are given ONE PAGE IMAGE from a PDF (page ${opts.pageNumber} of ${opts.totalPages}).

The page is a scanned/photographed image of a physical A4 paper. Text may be blurry, low-resolution, skewed, rotated, have shadows, handwriting, or image-quality issues. You MUST visually read the image — do NOT rely on any embedded text layer.

Your ONLY task is to EXTRACT all MCQ questions from this page. Do NOT answer or solve them. Do NOT add explanations.

Return STRICT JSON only (no markdown fences, no commentary):
{
  "questions": [
    {
      "question_number": 1,
      "stem": "The full question text, exactly as it appears on the page",
      "options": [
        {"letter": "A", "body": "Option text exactly as written"},
        {"letter": "B", "body": "Option text exactly as written"},
        {"letter": "C", "body": "Option text exactly as written"},
        {"letter": "D", "body": "Option text exactly as written"}
      ],
      "question_type": "single_choice",
      "needs_manual_options": false,
      "options_generated_by_ai": false
    }
  ]
}

EXTRACTION RULES:
- Extract EVERY numbered question visible on this page.
- Preserve question numbers exactly as they appear (e.g. if the page shows "Q.47" or "47." use 47).
- Copy stems and option bodies verbatim — do not paraphrase, do not correct spelling or grammar.
- Preserve all original option labels (A, B, C, D, E, F, a, b, c, d — normalize to uppercase).
- If a question spans this page and the previous page (partial question), extract whatever is visible.
- Do NOT include page headers, footers, instructions pages, or name/date lines.
- If there are NO questions on this page, return {"questions": []}.
- question_type is "single_choice" by default. Only set "multiple_answer" if the question explicitly asks to select multiple answers.
${combinationRule}
${missingOptsRule}${userNotes}`;
}

// ─── AI call helpers ──────────────────────────────────────────────────────────

async function callGeminiVision(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  imageBase64: string,
): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          {
            text: "Extract all MCQ questions from this page and return the JSON exactly as described in the system prompt.",
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(
      `Gemini API error (${res.status}): ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOpenAIVision(
  apiKey: string,
  systemPrompt: string,
  imageBase64: string,
): Promise<string> {
  const body = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: "Extract all MCQ questions from this page and return the JSON exactly as described in the system prompt.",
          },
        ],
      },
    ],
    max_tokens: 16384,
    temperature: 0.1,
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(
      `OpenAI API error (${res.status}): ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return json?.choices?.[0]?.message?.content ?? "";
}

// ─── Duplicate detection helper ───────────────────────────────────────────────

function normalizeForDupe(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[،,\.!?؟]/g, "");
}

function optionsBodies(options: any[]): string {
  return (Array.isArray(options) ? options : [])
    .map((o: any) => normalizeForDupe(String(o?.body ?? "")))
    .sort()
    .join("|");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createMcqSession
// ─────────────────────────────────────────────────────────────────────────────

const CreateSessionInput = z.object({
  pdfName: z.string().min(1).max(300),
  totalPages: z.number().int().min(1).max(2000),
  model: ModelIdSchema,
  combinationMode: z.enum(["keep", "convert"]).default("keep"),
  missingOptsMode: z.enum(["manual", "ai_generate"]).default("manual"),
  aiNotes: z.string().max(4000).optional(),
});

export const createMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);

    const { data: session, error } = await supabase
      .from(SESSIONS_TABLE)
      .insert({
        user_id: userId,
        pdf_name: data.pdfName,
        total_pages: data.totalPages,
        model: data.model,
        combination_mode: data.combinationMode,
        missing_opts_mode: data.missingOptsMode,
        ai_notes: data.aiNotes ?? null,
        status: "running",
      })
      .select("id")
      .single();

    if (error) throw error;
    return { sessionId: session.id as string };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. processPageImage — core extraction per page
// ─────────────────────────────────────────────────────────────────────────────

const ProcessPageInput = z.object({
  sessionId: z.string().uuid(),
  pageNumber: z.number().int().min(1),
  imageBase64: z.string().min(100).max(20_000_000),
});

export const processPageImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProcessPageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    // Load session config
    const { data: session, error: sErr } = await supabase
      .from(SESSIONS_TABLE)
      .select(
        "id, total_pages, model, combination_mode, missing_opts_mode, ai_notes, status",
      )
      .eq("id", data.sessionId)
      .single();
    if (sErr) throw sErr;
    if (session.status === "cancelled")
      throw new Error("Session was cancelled.");

    const modelId = session.model as ModelId;
    const modelDef = MODELS[modelId];
    if (!modelDef) throw new Error(`Unknown model: ${modelId}`);

    const systemPrompt = buildExtractionPrompt({
      combinationMode: session.combination_mode as "keep" | "convert",
      missingOptsMode: session.missing_opts_mode as "manual" | "ai_generate",
      aiNotes: session.ai_notes,
      pageNumber: data.pageNumber,
      totalPages: session.total_pages,
    });

    // Call AI
    let rawText: string;
    try {
      if (modelDef.provider === "gemini") {
        const apiKey = await getGeminiKey(supabase);
        rawText = await callGeminiVision(
          apiKey,
          modelDef.apiModel,
          systemPrompt,
          data.imageBase64,
        );
      } else {
        const apiKey = await getOpenAIKey(supabase);
        rawText = await callOpenAIVision(apiKey, systemPrompt, data.imageBase64);
      }
    } catch (aiErr: any) {
      // Increment pages_processed even on error so progress advances
      const { data: curOnErr } = await supabase
        .from(SESSIONS_TABLE)
        .select("pages_processed")
        .eq("id", data.sessionId)
        .single();
      await supabase
        .from(SESSIONS_TABLE)
        .update({ pages_processed: (curOnErr?.pages_processed ?? 0) + 1 })
        .eq("id", data.sessionId);
      throw new Error(
        `AI call failed on page ${data.pageNumber}: ${aiErr?.message ?? String(aiErr)}`,
      );
    }

    const parsed = extractJson(rawText);
    const rawQuestions: any[] = Array.isArray(parsed?.questions)
      ? parsed.questions
      : [];

    let insertedCount = 0;
    if (rawQuestions.length > 0) {
      // Get current max sort_order for this session
      const { data: maxRow } = await supabase
        .from(QUESTIONS_TABLE)
        .select("sort_order")
        .eq("session_id", data.sessionId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextOrder = (maxRow?.sort_order ?? 0) + 1;

      const rows = rawQuestions.map((q: any, i: number) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        return {
          session_id: data.sessionId,
          page_number: data.pageNumber,
          question_number:
            typeof q.question_number === "number" ? q.question_number : null,
          stem: String(q.stem ?? "").trim().slice(0, 5000),
          options: opts.map((o: any) => ({
            letter: String(o?.letter ?? "").toUpperCase().slice(0, 3),
            body: String(o?.body ?? "").trim(),
          })),
          question_type:
            q.question_type === "multiple_answer"
              ? "multiple_answer"
              : "single_choice",
          needs_manual_options: Boolean(q.needs_manual_options),
          options_generated_by_ai: Boolean(q.options_generated_by_ai),
          sort_order: nextOrder + i,
        };
      });

      const { data: inserted, error: insErr } = await supabase
        .from(QUESTIONS_TABLE)
        .insert(rows)
        .select("id");
      if (insErr) throw insErr;
      insertedCount = inserted?.length ?? 0;
    }

    // Increment pages_processed + questions_extracted on session (read then write)
    const { data: cur } = await supabase
      .from(SESSIONS_TABLE)
      .select("pages_processed, questions_extracted")
      .eq("id", data.sessionId)
      .single();
    await supabase
      .from(SESSIONS_TABLE)
      .update({
        pages_processed: (cur?.pages_processed ?? 0) + 1,
        questions_extracted: (cur?.questions_extracted ?? 0) + insertedCount,
      })
      .eq("id", data.sessionId);

    return {
      pageNumber: data.pageNumber,
      questionsFound: insertedCount,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3. finalizeSession — mark done + run duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

const FinalizeInput = z.object({
  sessionId: z.string().uuid(),
  failed: z.boolean().optional().default(false),
});

export const finalizeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FinalizeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    if (data.failed) {
      await supabase
        .from(SESSIONS_TABLE)
        .update({ status: "failed" })
        .eq("id", data.sessionId);
      return { duplicatesFound: 0 };
    }

    // Load all questions for this session
    const { data: questions, error: qErr } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id, stem, options")
      .eq("session_id", data.sessionId)
      .order("sort_order", { ascending: true });
    if (qErr) throw qErr;

    // Duplicate detection: same normalized stem + same option bodies
    const seen = new Map<string, string>(); // key → first question id
    const dupeUpdates: { id: string; duplicate_of_id: string }[] = [];

    for (const q of questions ?? []) {
      const key = `${normalizeForDupe(q.stem)}::${optionsBodies(q.options)}`;
      if (seen.has(key)) {
        dupeUpdates.push({ id: q.id, duplicate_of_id: seen.get(key)! });
      } else {
        seen.set(key, q.id);
      }
    }

    // Mark duplicates
    if (dupeUpdates.length > 0) {
      for (const { id, duplicate_of_id } of dupeUpdates) {
        await supabase
          .from(QUESTIONS_TABLE)
          .update({ is_duplicate: true, duplicate_of_id })
          .eq("id", id);
      }
    }

    // Mark session done
    await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "done", duplicates_found: dupeUpdates.length })
      .eq("id", data.sessionId);

    return { duplicatesFound: dupeUpdates.length };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4. cancelSession
// ─────────────────────────────────────────────────────────────────────────────

const CancelInput = z.object({ sessionId: z.string().uuid() });

export const cancelMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "cancelled" })
      .eq("id", data.sessionId);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 5. listMcqSessions
// ─────────────────────────────────────────────────────────────────────────────

export const listMcqSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select(
        "id, pdf_name, total_pages, pages_processed, questions_extracted, duplicates_found, status, model, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────────────────────
// 6. getMcqSession — session details + all questions
// ─────────────────────────────────────────────────────────────────────────────

const GetSessionInput = z.object({ sessionId: z.string().uuid() });

export const getMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const { data: session, error: sErr } = await supabase
      .from(SESSIONS_TABLE)
      .select("*")
      .eq("id", data.sessionId)
      .single();
    if (sErr) throw sErr;

    const { data: questions, error: qErr } = await supabase
      .from(QUESTIONS_TABLE)
      .select("*")
      .eq("session_id", data.sessionId)
      .order("sort_order", { ascending: true });
    if (qErr) throw qErr;

    return { session, questions: questions ?? [] };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 7. deleteMcqSession
// ─────────────────────────────────────────────────────────────────────────────

const DeleteSessionInput = z.object({ sessionId: z.string().uuid() });

export const deleteMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    // Questions cascade-delete automatically
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .delete()
      .eq("id", data.sessionId);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 8. updateQuestion — stem/options/type edits + accept/reject
// ─────────────────────────────────────────────────────────────────────────────

const UpdateQuestionInput = z.object({
  questionId: z.string().uuid(),
  stem: z.string().min(1).max(5000).optional(),
  options: z
    .array(
      z.object({
        letter: z.string().min(1).max(3),
        body: z.string().min(0).max(2000),
      }),
    )
    .min(1)
    .max(10)
    .optional(),
  question_type: z.enum(["single_choice", "multiple_answer"]).optional(),
  review_status: z.enum(["pending", "accepted", "rejected"]).optional(),
});

export const updateMcqQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const patch: Record<string, any> = {};
    if (data.stem !== undefined) patch.stem = data.stem;
    if (data.options !== undefined) patch.options = data.options;
    if (data.question_type !== undefined)
      patch.question_type = data.question_type;
    if (data.review_status !== undefined)
      patch.review_status = data.review_status;

    const { error } = await supabase
      .from(QUESTIONS_TABLE)
      .update(patch)
      .eq("id", data.questionId);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 9. bulkReviewStatus — accept/reject many questions at once
// ─────────────────────────────────────────────────────────────────────────────

const BulkReviewInput = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(2000),
  review_status: z.enum(["accepted", "rejected", "pending"]),
});

export const bulkUpdateReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase
      .from(QUESTIONS_TABLE)
      .update({ review_status: data.review_status })
      .in("id", data.questionIds);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 10. rejectAllDuplicates — reject all is_duplicate=true questions in a session
// ─────────────────────────────────────────────────────────────────────────────

const RejectDupesInput = z.object({ sessionId: z.string().uuid() });

export const rejectAllDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RejectDupesInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: updated, error } = await supabase
      .from(QUESTIONS_TABLE)
      .update({ review_status: "rejected" })
      .eq("session_id", data.sessionId)
      .eq("is_duplicate", true)
      .select("id");
    if (error) throw error;
    return { rejectedCount: updated?.length ?? 0 };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 11. importSessionQuestions — write accepted questions to live courses DB
// ─────────────────────────────────────────────────────────────────────────────

const ImportInput = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(2000).optional(),
  // if questionIds omitted, imports ALL accepted questions
});

function isOptionSelected(letter: string, body: string, selectedAnswer: any): boolean {
  if (selectedAnswer == null) return false;
  const normLetter = letter.trim().toUpperCase();
  const normBody = body.trim().toLowerCase();

  if (Array.isArray(selectedAnswer)) {
    return selectedAnswer.some((item) => {
      const s = String(item).trim();
      return s.toUpperCase() === normLetter || s.toLowerCase() === normBody;
    });
  }

  const s = String(selectedAnswer).trim();
  if (s.toUpperCase() === normLetter) return true;
  if (s.toLowerCase() === normBody) return true;

  const cleanS = s.replace(/[\s,]+/g, "").toUpperCase();
  const cleanBody = body.replace(/[\s,]+/g, "").toUpperCase();
  if (cleanS && cleanBody && cleanS === cleanBody) return true;

  return false;
}

export const importSessionQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    // Build query for questions to import
    let qQuery = supabase
      .from(QUESTIONS_TABLE)
      .select("id, stem, options, question_type, selected_answer, answer_text, source_reference")
      .eq("session_id", data.sessionId)
      .eq("review_status", "accepted")
      .order("sort_order", { ascending: true });

    if (data.questionIds && data.questionIds.length > 0) {
      qQuery = qQuery.in("id", data.questionIds);
    }

    const { data: questions, error: qErr } = await qQuery;
    if (qErr) throw qErr;
    if (!questions || questions.length === 0) {
      return { inserted: 0, skipped: 0, errors: [] };
    }

    // Get current max sort_order in target subject
    const { data: maxRow } = await supabase
      .from("questions")
      .select("sort_order")
      .eq("subject_id", data.subjectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextOrder = (maxRow?.sort_order ?? 0) + 1;

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const q of questions) {
      try {
        const stem = String(q.stem ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 5000);

        // Upsert question (dedupe on stem_hash + subject_id)
        const { data: qRow, error: qInsErr } = await supabase
          .from("questions")
          .upsert(
            {
              subject_id: data.subjectId,
              stem,
              explanation: null,
              sort_order: nextOrder,
            },
            { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();

        if (qInsErr) throw qInsErr;
        if (!qRow?.id) {
          skipped++;
          continue;
        }

        // Insert options with is_correct determined from Phase 2 selected_answer
        const opts: any[] = Array.isArray(q.options) ? q.options : [];
        if (opts.length > 0) {
          const optRows = opts.map((o: any, idx: number) => ({
            question_id: qRow.id,
            label: String(o?.letter ?? "").toUpperCase().slice(0, 3),
            text: String(o?.body ?? "").trim() || null,
            is_correct: isOptionSelected(
              String(o?.letter ?? ""),
              String(o?.body ?? ""),
              q.selected_answer
            ),
            sort_order: idx + 1,
          }));
          const { error: oErr } = await supabase
            .from("question_options")
            .insert(optRows);
          if (oErr) throw oErr;
        }

        inserted++;
        nextOrder++;
      } catch (e: any) {
        errors.push(
          `Q(${q.id.slice(0, 8)}): ${e?.message ?? String(e)}`.slice(0, 200),
        );
      }
    }

    return { inserted, skipped, errors: errors.slice(0, 20) };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 12. getKeyStatus — check which AI keys are configured
// ─────────────────────────────────────────────────────────────────────────────

export const getMcqKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data } = await supabase
      .from("admin_ai_keys")
      .select("provider")
      .in("provider", ["gemini", "openai"]);

    const providers = new Set((data ?? []).map((r: any) => r.provider));
    return {
      hasGemini: providers.has("gemini"),
      hasOpenAI: providers.has("openai"),
    };
  });

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2 — MCQ ANSWERING / SOLVING
// ═════════════════════════════════════════════════════════════════════════════

async function callGeminiText(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(
      `Gemini API error (${res.status}): ${JSON.stringify(json?.error || json).slice(0, 400)}`,
    );
  }
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOpenAIText(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const body = {
    model: modelName === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.1,
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(
      `OpenAI API error (${res.status}): ${JSON.stringify(json?.error || json).slice(0, 400)}`,
    );
  }
  return json?.choices?.[0]?.message?.content ?? "";
}

const PHASE2_SOLVER_SYSTEM = `You are an expert exam solver. You are given ONE multiple-choice question: its stem, all answer options, and its question type.

YOUR ONLY TASK: Determine the correct answer from the provided options.

CRITICAL RULES:
1. STRICTLY CHOOSE FROM AVAILABLE OPTIONS:
   - You MUST pick an answer that is present in the provided options list.
   - NEVER invent a new option. NEVER output an option letter that does not exist in the options list.
2. QUESTION TYPES:
   - "single_choice" (including original combination MCQ where options are e.g. A) 1,2 B) 1,4 C) 1,2,3):
     Return the EXACT letter (e.g. "A", "B", "C", "D") of the correct option in "selected_answer", and the verbatim option text in "answer_text".
   - "multiple_answer" (converted individual statements):
     Return an array of the letters corresponding to ALL correct statements in "selected_answer" (e.g. ["A", "C"]), and array of their texts in "answer_text".
3. ABSOLUTELY NO EXPLANATIONS:
   - Do NOT write detailed explanations.
   - Do NOT write why other options are wrong.
   - Do NOT provide clinical pearls or educational summaries.
   - You may only include a very short 1-2 sentence "brief_reasoning" for internal record.
4. UNCERTAINTY & MISSING EVIDENCE:
   - Do NOT guess or hallucinate certainty.
   - If the question is ambiguous, stem is incomplete, or options are insufficient, set "needs_review": true and provide a clear explanation in "review_reason".
   - If study material is provided, answer ONLY if supported by the material. If not found in the material, set "needs_review": true and explain in "review_reason".
   - When using study material, cite the location (page, chapter, or section) in "source_reference".

Return STRICT JSON only:
{
  "selected_answer": "C",
  "answer_text": "Option text",
  "confidence": "high",
  "needs_review": false,
  "review_reason": null,
  "source_reference": null,
  "brief_reasoning": "≤2 sentences rationale"
}`;

function validateAnswerSelection(
  rawAnswer: any,
  options: Array<{ letter: string; body: string }>,
  questionType: "single_choice" | "multiple_answer"
): {
  valid: boolean;
  selectedAnswer: any;
  answerText: any;
  errorReason?: string;
} {
  const optsByLetter = new Map<string, string>();
  const optsByBody = new Map<string, string>();

  for (const opt of options) {
    const l = String(opt.letter || "").trim().toUpperCase();
    const b = String(opt.body || "").trim();
    if (l) {
      optsByLetter.set(l, b);
      if (b) optsByBody.set(b.toLowerCase(), l);
    }
  }

  if (questionType === "multiple_answer") {
    const arr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    const resolvedLetters: string[] = [];
    const resolvedTexts: string[] = [];

    for (const item of arr) {
      const s = String(item || "").trim();
      const upper = s.toUpperCase();
      if (optsByLetter.has(upper)) {
        resolvedLetters.push(upper);
        resolvedTexts.push(optsByLetter.get(upper)!);
      } else if (optsByBody.has(s.toLowerCase())) {
        const letter = optsByBody.get(s.toLowerCase())!;
        resolvedLetters.push(letter);
        resolvedTexts.push(optsByLetter.get(letter)!);
      } else {
        return {
          valid: false,
          selectedAnswer: arr,
          answerText: null,
          errorReason: `Selected answer statement "${s}" does not match any valid option`,
        };
      }
    }

    if (resolvedLetters.length === 0) {
      return {
        valid: false,
        selectedAnswer: [],
        answerText: [],
        errorReason: "No valid statement options were selected",
      };
    }

    return {
      valid: true,
      selectedAnswer: resolvedLetters,
      answerText: resolvedTexts,
    };
  }

  // Single choice
  const s = String(rawAnswer ?? "").trim();
  const upper = s.toUpperCase();

  if (optsByLetter.has(upper)) {
    return {
      valid: true,
      selectedAnswer: upper,
      answerText: optsByLetter.get(upper)!,
    };
  }

  if (optsByBody.has(s.toLowerCase())) {
    const letter = optsByBody.get(s.toLowerCase())!;
    return {
      valid: true,
      selectedAnswer: letter,
      answerText: optsByLetter.get(letter)!,
    };
  }

  // Combination format check: e.g. "1,2,3" against "1, 2, 3"
  const cleanS = s.replace(/[\s,]+/g, "").toUpperCase();
  for (const [letter, body] of optsByLetter.entries()) {
    const cleanBody = body.replace(/[\s,]+/g, "").toUpperCase();
    if (cleanS && cleanBody && cleanS === cleanBody) {
      return {
        valid: true,
        selectedAnswer: letter,
        answerText: body,
      };
    }
  }

  const validLetters = [...optsByLetter.keys()].join(", ");
  return {
    valid: false,
    selectedAnswer: s,
    answerText: null,
    errorReason: `Selected answer "${s}" does not match any available option (${validLetters || "None"})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. initiateAnsweringSession
// ─────────────────────────────────────────────────────────────────────────────

const InitiateAnsweringInput = z.object({
  sessionId: z.string().uuid(),
  method: z.enum(["ai", "study_material", "user_answer_key"]),
  model: ModelIdSchema.optional(),
  instructions: z.string().max(4000).optional(),
  studyMaterialName: z.string().max(300).optional(),
  studyMaterialText: z.string().max(100_000).optional(),
});

export const initiateAnsweringSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InitiateAnsweringInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const modelDef = data.model ? MODELS[data.model] : null;

    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        answering_method: data.method,
        answering_model: data.model ?? null,
        answering_provider: modelDef?.provider ?? null,
        answering_instructions: data.instructions ?? null,
        study_material_name: data.studyMaterialName ?? null,
        study_material_text: data.studyMaterialText ?? null,
        answering_status: "running",
      })
      .eq("id", data.sessionId);

    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 14. solveSingleQuestion (Method A & B)
// ─────────────────────────────────────────────────────────────────────────────

const SolveQuestionInput = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  method: z.enum(["ai", "study_material"]),
  model: ModelIdSchema,
  instructions: z.string().max(4000).optional(),
  studyMaterialText: z.string().max(100_000).optional(),
});

export const solveSingleQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SolveQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    // Fetch the question
    const { data: q, error: qErr } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id, stem, options, question_type, question_number")
      .eq("id", data.questionId)
      .single();

    if (qErr || !q) throw new Error("Question not found");

    const modelDef = MODELS[data.model];
    if (!modelDef) throw new Error(`Unknown model: ${data.model}`);

    const optionsList: Array<{ letter: string; body: string }> = Array.isArray(q.options)
      ? q.options
      : [];

    // Format options for the prompt
    const formattedOptions = optionsList
      .map((o) => `  ${o.letter}) ${o.body}`)
      .join("\n");

    let userPrompt = `QUESTION:
${q.stem}

AVAILABLE OPTIONS:
${formattedOptions}

QUESTION TYPE:
${q.question_type || "single_choice"}
`;

    if (data.method === "study_material" && data.studyMaterialText?.trim()) {
      userPrompt = `STUDY MATERIAL / REFERENCE CONTEXT:
"""
${data.studyMaterialText.trim().slice(0, 100_000)}
"""

${userPrompt}
INSTRUCTION FOR METHOD B: Answer strictly according to the study material above. Cite the section/page in "source_reference". If not covered, set needs_review: true.
`;
    }

    if (data.instructions?.trim()) {
      userPrompt += `\nADDITIONAL USER SOLVING INSTRUCTIONS:\n${data.instructions.trim()}\n`;
    }

    userPrompt += `\nDetermine the correct answer and return STRICT JSON per system prompt.`;

    let rawOutput = "";
    try {
      if (modelDef.provider === "gemini") {
        const apiKey = await getGeminiKey(supabase);
        rawOutput = await callGeminiText(
          apiKey,
          modelDef.apiModel,
          PHASE2_SOLVER_SYSTEM,
          userPrompt
        );
      } else {
        const apiKey = await getOpenAIKey(supabase);
        rawOutput = await callOpenAIText(
          apiKey,
          modelDef.apiModel,
          PHASE2_SOLVER_SYSTEM,
          userPrompt
        );
      }
    } catch (apiErr: any) {
      // Record failure on question
      await supabase
        .from(QUESTIONS_TABLE)
        .update({
          answering_status: "failed",
          needs_review: true,
          review_reason: `AI API error: ${apiErr?.message || String(apiErr)}`,
        })
        .eq("id", data.questionId);
      throw apiErr;
    }

    const parsed = extractJson(rawOutput) || {};
    const validation = validateAnswerSelection(
      parsed.selected_answer,
      optionsList,
      q.question_type || "single_choice"
    );

    let needsReview = Boolean(parsed.needs_review);
    let reviewReason = parsed.review_reason ? String(parsed.review_reason).trim() : null;

    if (!validation.valid) {
      needsReview = true;
      reviewReason = validation.errorReason || "AI answer does not match any available option";
    }

    const confidence = ["high", "medium", "low"].includes(String(parsed.confidence).toLowerCase())
      ? (String(parsed.confidence).toLowerCase() as "high" | "medium" | "low")
      : "medium";

    const updatePayload: Record<string, any> = {
      answer_source: data.method,
      selected_answer: validation.selectedAnswer,
      answer_text: validation.answerText,
      confidence,
      needs_review: needsReview,
      review_reason: reviewReason,
      source_reference: parsed.source_reference ? String(parsed.source_reference).trim() : null,
      answering_model: data.model,
      answering_provider: modelDef.provider,
      answering_instructions: data.instructions ?? null,
      answering_status: needsReview ? "needs_review" : "answered",
      internal_reasoning: parsed.brief_reasoning ? String(parsed.brief_reasoning).trim().slice(0, 500) : null,
      answered_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabase
      .from(QUESTIONS_TABLE)
      .update(updatePayload)
      .eq("id", data.questionId);

    if (updErr) throw updErr;

    // Recalculate session counters
    const { count: answeredCount } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId)
      .in("answering_status", ["answered", "needs_review"]);

    const { count: reviewCount } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId)
      .eq("needs_review", true);

    await supabase
      .from(SESSIONS_TABLE)
      .update({
        total_answered: answeredCount ?? 0,
        total_needs_review: reviewCount ?? 0,
      })
      .eq("id", data.sessionId);

    return {
      questionId: data.questionId,
      selectedAnswer: validation.selectedAnswer,
      needsReview,
      reviewReason,
      confidence,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 15. parseAnswerKeyPdf (Method C PDF OCR)
// ─────────────────────────────────────────────────────────────────────────────

export const parseAnswerKeyPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pdfBase64: z.string().min(20).max(25_000_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    const prompt = `You are an expert OCR engine for exam answer keys.
Extract all question numbers and their corresponding correct answer letter(s) or combination(s) from this answer key document.
Return STRICT JSON only:
{
  "answers": [
    { "number": "1", "letter": "A" },
    { "number": "2", "letter": "B" },
    { "number": "3", "letter": "1,2,3" }
  ]
}
Rules:
- Extract EVERY question number and answer choice.
- Keep exact question numbers (e.g. 1, 2, 3, etc.).
- Maintain combinations verbatim (e.g. "1,2" or "1,2,3" or "A,C").
- Output STRICT JSON only.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: data.pdfBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
      },
    );

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(`Answer key PDF OCR failed: ${JSON.stringify(json?.error || json).slice(0, 300)}`);

    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = extractJson(raw);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : (Array.isArray(parsed) ? parsed : []);

    const entries: Array<{ number?: string; letter: string }> = [];
    for (const a of answers) {
      const letter = String(a?.letter || a?.answer || a?.choice || "").trim().toUpperCase();
      const num = a?.number != null ? String(a.number).trim().replace(/^Q/i, "") : undefined;
      if (letter) {
        entries.push({ number: num, letter });
      }
    }

    return { entries };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 16. parseAnswerKeyEntries (Text parsing helper)
// ─────────────────────────────────────────────────────────────────────────────

export function parseAnswerKeyEntries(text: string): Array<{ number?: string; letter: string }> {
  const lines = text.split(/[\r\n]+/);
  const entries: Array<{ number?: string; letter: string }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern 1: explicit number + letter / combination e.g. "1. A", "1: A,B", "Q12 - 1,2,3", "47. C"
    const explicitNumbered = [...line.matchAll(/(?:^|[\s,;])(?:Q|Question|q)?\s*(\d+)[\s.:)\-–—=]+([A-Za-z0-9,\s]+)/g)];
    if (explicitNumbered.length > 0) {
      for (const m of explicitNumbered) {
        const val = m[2].trim().replace(/\s*,\s*/g, ",");
        if (/^[A-Za-z0-9,]+$/.test(val)) {
          entries.push({
            number: m[1],
            letter: val.toUpperCase(),
          });
        }
      }
      continue;
    }

    // Pattern 2: Single line item e.g. "A", "C", "A,B", "1,2,3"
    if (/^[A-Za-z0-9,\s]+$/.test(line)) {
      const val = line.replace(/\s*,\s*/g, ",").toUpperCase();
      if (val.length <= 15) {
        entries.push({ letter: val });
        continue;
      }
    }

    // Fallback: match any number + letter
    const fallback = line.match(/(?:(?:Q|Question|q)?\s*(\d+)[\s.:)\-–—=]+)?([A-Za-z])/i);
    if (fallback) {
      entries.push({
        number: fallback[1] || undefined,
        letter: fallback[2].toUpperCase(),
      });
    }
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. applyAnswerKeyBatch (Method C mapping without re-solving)
// ─────────────────────────────────────────────────────────────────────────────

const ApplyAnswerKeyInput = z.object({
  sessionId: z.string().uuid(),
  entries: z.array(
    z.object({
      number: z.string().optional(),
      letter: z.string().min(1),
    })
  ).min(1).max(2000),
});

export const applyAnswerKeyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyAnswerKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    // Fetch all questions for this session
    const { data: questions, error: qErr } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id, stem, options, question_type, question_number, sort_order")
      .eq("session_id", data.sessionId)
      .order("sort_order", { ascending: true });

    if (qErr || !questions) throw new Error("Could not load questions for session");

    // Index questions by printed question_number and by array index
    const qByNumber = new Map<string, any>();
    questions.forEach((q, idx) => {
      if (q.question_number != null) {
        qByNumber.set(String(q.question_number), q);
      }
    });

    let appliedCount = 0;
    let needsReviewCount = 0;

    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];
      let targetQ = null;

      if (entry.number && qByNumber.has(entry.number)) {
        targetQ = qByNumber.get(entry.number);
      } else if (entry.number && !isNaN(Number(entry.number))) {
        const idx = Number(entry.number) - 1;
        targetQ = questions[idx] || null;
      } else if (i < questions.length) {
        targetQ = questions[i];
      }

      if (!targetQ) continue;

      const optionsList = Array.isArray(targetQ.options) ? targetQ.options : [];
      const validation = validateAnswerSelection(
        entry.letter,
        optionsList,
        targetQ.question_type || "single_choice"
      );

      const needsReview = !validation.valid;
      if (needsReview) needsReviewCount++;

      await supabase
        .from(QUESTIONS_TABLE)
        .update({
          answer_source: "user_answer_key",
          selected_answer: validation.selectedAnswer,
          answer_text: validation.answerText,
          confidence: "high",
          needs_review: needsReview,
          review_reason: needsReview
            ? (validation.errorReason || "Answer key does not match question options")
            : null,
          answering_status: needsReview ? "needs_review" : "answered",
          answered_at: new Date().toISOString(),
        })
        .eq("id", targetQ.id);

      appliedCount++;
    }

    // Update session status & counters
    await supabase
      .from(SESSIONS_TABLE)
      .update({
        answering_method: "user_answer_key",
        answering_status: "completed",
        total_answered: appliedCount,
        total_needs_review: needsReviewCount,
      })
      .eq("id", data.sessionId);

    return { appliedCount, totalEntries: data.entries.length, needsReviewCount };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 18. updateQuestionAnswerManual (Admin manual edit)
// ─────────────────────────────────────────────────────────────────────────────

const UpdateManualAnswerInput = z.object({
  questionId: z.string().uuid(),
  selected_answer: z.union([z.string(), z.array(z.string())]),
  answer_text: z.union([z.string(), z.array(z.string())]).optional(),
  needs_review: z.boolean().optional(),
  review_reason: z.string().nullable().optional(),
  source_reference: z.string().nullable().optional(),
});

export const updateQuestionAnswerManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateManualAnswerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const patch: Record<string, any> = {
      selected_answer: data.selected_answer,
      answering_status: data.needs_review ? "needs_review" : "answered",
      answered_at: new Date().toISOString(),
    };

    if (data.answer_text !== undefined) patch.answer_text = data.answer_text;
    if (data.needs_review !== undefined) patch.needs_review = data.needs_review;
    if (data.review_reason !== undefined) patch.review_reason = data.review_reason;
    if (data.source_reference !== undefined) patch.source_reference = data.source_reference;

    const { error } = await supabase
      .from(QUESTIONS_TABLE)
      .update(patch)
      .eq("id", data.questionId);

    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 19. clearSessionAnswers
// ─────────────────────────────────────────────────────────────────────────────

const ClearAnswersInput = z.object({ sessionId: z.string().uuid() });

export const clearSessionAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearAnswersInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    await supabase
      .from(QUESTIONS_TABLE)
      .update({
        answer_source: null,
        selected_answer: null,
        answer_text: null,
        confidence: null,
        needs_review: false,
        review_reason: null,
        source_reference: null,
        answering_model: null,
        answering_provider: null,
        answering_instructions: null,
        answering_status: "unanswered",
        internal_reasoning: null,
        answered_at: null,
      })
      .eq("session_id", data.sessionId);

    await supabase
      .from(SESSIONS_TABLE)
      .update({
        answering_status: "idle",
        total_answered: 0,
        total_needs_review: 0,
      })
      .eq("id", data.sessionId);

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 20. completeAnsweringSession
// ─────────────────────────────────────────────────────────────────────────────

const CompleteAnsweringInput = z.object({ sessionId: z.string().uuid() });

export const completeAnsweringSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteAnsweringInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const { count: answeredCount } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId)
      .in("answering_status", ["answered", "needs_review"]);

    const { count: reviewCount } = await supabase
      .from(QUESTIONS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId)
      .eq("needs_review", true);

    await supabase
      .from(SESSIONS_TABLE)
      .update({
        answering_status: "completed",
        total_answered: answeredCount ?? 0,
        total_needs_review: reviewCount ?? 0,
      })
      .eq("id", data.sessionId);

    return { ok: true };
  });

