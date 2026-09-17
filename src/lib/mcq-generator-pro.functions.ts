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

export function isMissingTableError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");
  return (
    code === "PGRST204" ||
    code === "42P01" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

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

    try {
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

      if (error) {
        if (isMissingTableError(error)) {
          return {
            sessionId: `local-${Date.now()}`,
            isLocal: true,
            tableMissing: true,
          };
        }
        throw error;
      }
      return { sessionId: session.id as string, isLocal: false, tableMissing: false };
    } catch (err: any) {
      if (isMissingTableError(err)) {
        return {
          sessionId: `local-${Date.now()}`,
          isLocal: true,
          tableMissing: true,
        };
      }
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. processPageImage — core extraction per page
// ─────────────────────────────────────────────────────────────────────────────

const ProcessPageInput = z.object({
  sessionId: z.string(),
  pageNumber: z.number().int().min(1),
  imageBase64: z.string().min(100).max(20_000_000),
  sessionConfig: z
    .object({
      totalPages: z.number().int().min(1),
      model: ModelIdSchema,
      combinationMode: z.enum(["keep", "convert"]).default("keep"),
      missingOptsMode: z.enum(["manual", "ai_generate"]).default("manual"),
      aiNotes: z.string().max(4000).optional(),
    })
    .optional(),
});

export const processPageImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProcessPageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const isLocal = data.sessionId.startsWith("local-");
    let session: any = null;

    if (!isLocal) {
      try {
        const { data: s, error: sErr } = await supabase
          .from(SESSIONS_TABLE)
          .select(
            "id, total_pages, model, combination_mode, missing_opts_mode, ai_notes, status",
          )
          .eq("id", data.sessionId)
          .single();
        if (!sErr && s) session = s;
      } catch {}
    }

    if (!session) {
      if (!data.sessionConfig) {
        throw new Error("Session configuration not provided for local execution.");
      }
      session = {
        id: data.sessionId,
        total_pages: data.sessionConfig.totalPages,
        model: data.sessionConfig.model,
        combination_mode: data.sessionConfig.combinationMode,
        missing_opts_mode: data.sessionConfig.missingOptsMode,
        ai_notes: data.sessionConfig.aiNotes,
        status: "running",
      };
    }

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
      if (!isLocal) {
        try {
          const { data: curOnErr } = await supabase
            .from(SESSIONS_TABLE)
            .select("pages_processed")
            .eq("id", data.sessionId)
            .single();
          await supabase
            .from(SESSIONS_TABLE)
            .update({ pages_processed: (curOnErr?.pages_processed ?? 0) + 1 })
            .eq("id", data.sessionId);
        } catch {}
      }
      throw new Error(
        `AI call failed on page ${data.pageNumber}: ${aiErr?.message ?? String(aiErr)}`,
      );
    }

    const parsed = extractJson(rawText);
    const rawQuestions: any[] = Array.isArray(parsed?.questions)
      ? parsed.questions
      : [];

    let rows: any[] = [];
    if (rawQuestions.length > 0) {
      let nextOrder = (data.pageNumber - 1) * 20 + 1;
      if (!isLocal) {
        try {
          const { data: maxRow } = await supabase
            .from(QUESTIONS_TABLE)
            .select("sort_order")
            .eq("session_id", data.sessionId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (maxRow?.sort_order != null) nextOrder = maxRow.sort_order + 1;
        } catch {}
      }

      rows = rawQuestions.map((q: any, i: number) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        return {
          id: crypto.randomUUID(),
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
          review_status: "pending",
          sort_order: nextOrder + i,
        };
      });

      if (!isLocal) {
        try {
          await supabase.from(QUESTIONS_TABLE).insert(rows);
        } catch (insErr: any) {
          if (!isMissingTableError(insErr)) throw insErr;
        }
      }
    }

    if (!isLocal) {
      try {
        const { data: cur } = await supabase
          .from(SESSIONS_TABLE)
          .select("pages_processed, questions_extracted")
          .eq("id", data.sessionId)
          .single();
        await supabase
          .from(SESSIONS_TABLE)
          .update({
            pages_processed: (cur?.pages_processed ?? 0) + 1,
            questions_extracted: (cur?.questions_extracted ?? 0) + rows.length,
          })
          .eq("id", data.sessionId);
      } catch {}
    }

    return {
      pageNumber: data.pageNumber,
      questionsFound: rows.length,
      extractedQuestions: rows,
      isLocal,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3. finalizeSession — mark done + run duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

const FinalizeInput = z.object({
  sessionId: z.string(),
  failed: z.boolean().optional().default(false),
  questionsData: z.array(z.any()).optional(),
});

export const finalizeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FinalizeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const isLocal = data.sessionId.startsWith("local-");

    if (data.failed) {
      if (!isLocal) {
        try {
          await supabase
            .from(SESSIONS_TABLE)
            .update({ status: "failed" })
            .eq("id", data.sessionId);
        } catch {}
      }
      return { duplicatesFound: 0 };
    }

    // Load all questions for this session (from DB or questionsData)
    let questions = data.questionsData;
    if (!questions && !isLocal) {
      try {
        const { data: qData, error: qErr } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id, stem, options")
          .eq("session_id", data.sessionId)
          .order("sort_order", { ascending: true });
        if (!qErr) questions = qData ?? [];
      } catch {}
    }

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

    // Mark duplicates in DB if available
    if (!isLocal) {
      try {
        if (dupeUpdates.length > 0) {
          for (const { id, duplicate_of_id } of dupeUpdates) {
            await supabase
              .from(QUESTIONS_TABLE)
              .update({ is_duplicate: true, duplicate_of_id })
              .eq("id", id);
          }
        }

        await supabase
          .from(SESSIONS_TABLE)
          .update({ status: "done", duplicates_found: dupeUpdates.length })
          .eq("id", data.sessionId);
      } catch {}
    }

    return {
      duplicatesFound: dupeUpdates.length,
      duplicateIds: dupeUpdates.map((d) => d.id),
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4. cancelSession
// ─────────────────────────────────────────────────────────────────────────────

const CancelInput = z.object({ sessionId: z.string() });

export const cancelMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);
    try {
      const { error } = await supabase
        .from(SESSIONS_TABLE)
        .update({ status: "cancelled" })
        .eq("id", data.sessionId);
      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 5. listMcqSessions
// ─────────────────────────────────────────────────────────────────────────────

export const listMcqSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    try {
      const { data, error } = await supabase
        .from(SESSIONS_TABLE)
        .select(
          "id, pdf_name, total_pages, pages_processed, questions_extracted, duplicates_found, status, model, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return data ?? [];
    } catch (err: any) {
      if (isMissingTableError(err)) return [];
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 6. getMcqSession — session details + all questions
// ─────────────────────────────────────────────────────────────────────────────

const GetSessionInput = z.object({ sessionId: z.string() });

export const getMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) {
      return { session: null, questions: [] };
    }
    const { supabase } = await ensureAdmin(context);
    try {
      const { data: session, error: sErr } = await supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("id", data.sessionId)
        .single();
      if (sErr) {
        if (isMissingTableError(sErr)) return { session: null, questions: [] };
        throw sErr;
      }

      const { data: questions, error: qErr } = await supabase
        .from(QUESTIONS_TABLE)
        .select("*")
        .eq("session_id", data.sessionId)
        .order("sort_order", { ascending: true });
      if (qErr) {
        if (isMissingTableError(qErr)) return { session, questions: [] };
        throw qErr;
      }

      return { session, questions: questions ?? [] };
    } catch (err: any) {
      if (isMissingTableError(err)) return { session: null, questions: [] };
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 7. deleteMcqSession
// ─────────────────────────────────────────────────────────────────────────────

const DeleteSessionInput = z.object({ sessionId: z.string() });

export const deleteMcqSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);
    try {
      const { error } = await supabase
        .from(SESSIONS_TABLE)
        .delete()
        .eq("id", data.sessionId);
      if (error && !isMissingTableError(error)) throw error;
      return { ok: true };
    } catch (err: any) {
      if (isMissingTableError(err)) return { ok: true };
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 8. updateQuestion — stem/options/type edits + accept/reject
// ─────────────────────────────────────────────────────────────────────────────

const UpdateQuestionInput = z.object({
  questionId: z.string(),
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

    try {
      const { error } = await supabase
        .from(QUESTIONS_TABLE)
        .update(patch)
        .eq("id", data.questionId);
      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 9. bulkReviewStatus — accept/reject many questions at once
// ─────────────────────────────────────────────────────────────────────────────

const BulkReviewInput = z.object({
  questionIds: z.array(z.string()).min(1).max(2000),
  review_status: z.enum(["accepted", "rejected", "pending"]),
});

export const bulkUpdateReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    try {
      const { error } = await supabase
        .from(QUESTIONS_TABLE)
        .update({ review_status: data.review_status })
        .in("id", data.questionIds);
      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 10. rejectAllDuplicates — reject all is_duplicate=true questions in a session
// ─────────────────────────────────────────────────────────────────────────────

const RejectDupesInput = z.object({ sessionId: z.string() });

export const rejectAllDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RejectDupesInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { rejectedCount: 0 };
    const { supabase } = await ensureAdmin(context);
    try {
      const { data: updated, error } = await supabase
        .from(QUESTIONS_TABLE)
        .update({ review_status: "rejected" })
        .eq("session_id", data.sessionId)
        .eq("is_duplicate", true)
        .select("id");
      if (error && !isMissingTableError(error)) throw error;
      return { rejectedCount: updated?.length ?? 0 };
    } catch (err: any) {
      if (isMissingTableError(err)) return { rejectedCount: 0 };
      throw err;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 11. importSessionQuestions — write accepted questions to live courses DB
// ─────────────────────────────────────────────────────────────────────────────

const ImportInput = z.object({
  sessionId: z.string(),
  subjectId: z.string(),
  questionIds: z.array(z.string()).min(1).max(2000).optional(),
  questionsData: z.array(z.any()).optional(),
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

    let questions: any[] = [];
    if (data.questionsData && data.questionsData.length > 0) {
      questions = data.questionsData.filter((q: any) => {
        if (q.review_status !== "accepted") return false;
        if (data.questionIds && data.questionIds.length > 0) {
          return data.questionIds.includes(q.id);
        }
        return true;
      });
    } else {
      // Build query for questions to import from DB
      let qQuery = supabase
        .from(QUESTIONS_TABLE)
        .select("id, stem, options, question_type, selected_answer, answer_text, source_reference, explanation")
        .eq("session_id", data.sessionId)
        .eq("review_status", "accepted")
        .order("sort_order", { ascending: true });

      if (data.questionIds && data.questionIds.length > 0) {
        qQuery = qQuery.in("id", data.questionIds);
      }

      const { data: dbQuestions, error: qErr } = await qQuery;
      if (qErr) throw qErr;
      questions = dbQuestions ?? [];
    }

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
              explanation: q.explanation || null,
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
          `Q(${String(q.id).slice(0, 8)}): ${e?.message ?? String(e)}`.slice(0, 200),
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
  sessionId: z.string(),
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
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);

    const modelDef = data.model ? MODELS[data.model] : null;

    try {
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

      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 14. solveSingleQuestion (Method A & B)
// ─────────────────────────────────────────────────────────────────────────────

const SolveQuestionInput = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  method: z.enum(["ai", "study_material"]),
  model: ModelIdSchema,
  instructions: z.string().max(4000).optional(),
  studyMaterialText: z.string().max(100_000).optional(),
  questionData: z.any().optional(),
});

export const solveSingleQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SolveQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const isLocal = data.sessionId.startsWith("local-");

    // Fetch the question (from questionData or DB)
    let q = data.questionData;
    if (!q) {
      try {
        const { data: qDb, error: qErr } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id, stem, options, question_type, question_number")
          .eq("id", data.questionId)
          .single();
        if (!qErr && qDb) q = qDb;
      } catch {}
    }

    if (!q) throw new Error("Question not found");

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
      if (!isLocal) {
        try {
          await supabase
            .from(QUESTIONS_TABLE)
            .update({
              answering_status: "failed",
              needs_review: true,
              review_reason: `AI API error: ${apiErr?.message || String(apiErr)}`,
            })
            .eq("id", data.questionId);
        } catch {}
      }
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

    if (!isLocal) {
      try {
        await supabase
          .from(QUESTIONS_TABLE)
          .update(updatePayload)
          .eq("id", data.questionId);

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
      } catch {}
    }

    return {
      questionId: data.questionId,
      selectedAnswer: validation.selectedAnswer,
      answerText: validation.answerText,
      needsReview,
      reviewReason,
      confidence,
      sourceReference: parsed.source_reference ? String(parsed.source_reference).trim() : null,
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
  sessionId: z.string(),
  entries: z.array(
    z.object({
      number: z.string().optional(),
      letter: z.string().min(1),
    })
  ).min(1).max(2000),
  questionsData: z.array(z.any()).optional(),
});

export const applyAnswerKeyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyAnswerKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const isLocal = data.sessionId.startsWith("local-");

    let questions: any[] = [];
    if (data.questionsData && data.questionsData.length > 0) {
      questions = data.questionsData;
    } else {
      try {
        const { data: qData, error: qErr } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id, stem, options, question_type, question_number, sort_order")
          .eq("session_id", data.sessionId)
          .order("sort_order", { ascending: true });
        if (!qErr && qData) questions = qData;
      } catch {}
    }

    if (!questions || questions.length === 0) {
      throw new Error("Could not load questions for session");
    }

    // Index questions by printed question_number and by array index
    const qByNumber = new Map<string, any>();
    questions.forEach((q: any) => {
      if (q.question_number != null) {
        qByNumber.set(String(q.question_number), q);
      }
    });

    let appliedCount = 0;
    let needsReviewCount = 0;
    const updatedMap: Record<string, any> = {};

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

      const payload = {
        answer_source: "user_answer_key",
        selected_answer: validation.selectedAnswer,
        answer_text: validation.answerText,
        confidence: "high" as const,
        needs_review: needsReview,
        review_reason: needsReview
          ? (validation.errorReason || "Answer key does not match question options")
          : null,
        answering_status: needsReview ? "needs_review" : "answered",
        answered_at: new Date().toISOString(),
      };

      updatedMap[targetQ.id] = payload;

      if (!isLocal) {
        try {
          await supabase
            .from(QUESTIONS_TABLE)
            .update(payload)
            .eq("id", targetQ.id);
        } catch {}
      }

      appliedCount++;
    }

    if (!isLocal) {
      try {
        await supabase
          .from(SESSIONS_TABLE)
          .update({
            answering_method: "user_answer_key",
            answering_status: "completed",
            total_answered: appliedCount,
            total_needs_review: needsReviewCount,
          })
          .eq("id", data.sessionId);
      } catch {}
    }

    return { appliedCount, totalEntries: data.entries.length, needsReviewCount, updatedMap };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 18. updateQuestionAnswerManual (Admin manual edit)
// ─────────────────────────────────────────────────────────────────────────────

const UpdateManualAnswerInput = z.object({
  questionId: z.string(),
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

    try {
      const { error } = await supabase
        .from(QUESTIONS_TABLE)
        .update(patch)
        .eq("id", data.questionId);

      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 19. clearSessionAnswers
// ─────────────────────────────────────────────────────────────────────────────

const ClearAnswersInput = z.object({ sessionId: z.string() });

export const clearSessionAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearAnswersInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);

    try {
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
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 20. completeAnsweringSession
// ─────────────────────────────────────────────────────────────────────────────

const CompleteAnsweringInput = z.object({ sessionId: z.string() });

export const completeAnsweringSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteAnsweringInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);

    try {
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
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }

    return { ok: true };
  });

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 3 — AI EXPLANATION GENERATION (AQUAVISIONX-ENHANCED)
// ═════════════════════════════════════════════════════════════════════════════

/** Keyword-based chunk retrieval to extract relevant pages/paragraphs from study material without blowing token limits */
export function retrieveRelevantSourceContext(
  sourceText: string,
  stem: string,
  options: Array<{ letter: string; body: string }>
): { context: string; approximateLocation?: string } {
  const cleanSource = String(sourceText || "").trim();
  if (!cleanSource) return { context: "" };
  if (cleanSource.length <= 6000) {
    return { context: cleanSource };
  }

  // Split into chunks by page/section breaks or paragraphs
  const rawChunks = cleanSource.split(/\n\s*---\s*\n|\n\s*===+\s*\n|\n\n\n+/);
  const chunks: Array<{ text: string; location: string }> = [];

  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i].trim();
    if (chunk.length < 40) continue;
    const pageMatch = chunk.match(/(?:Page|p\.|Chapter|Section)\s*(\d+[A-Za-z0-9.-]*)/i);
    const location = pageMatch ? pageMatch[0] : `Section ${i + 1}`;
    chunks.push({ text: chunk, location });
  }

  if (chunks.length <= 2) {
    return { context: cleanSource.slice(0, 8000) };
  }

  // Extract keywords from stem + options
  const combinedQuery = `${stem} ${options.map((o) => o.body).join(" ")}`.toLowerCase();
  const words = combinedQuery
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !["which", "where", "these", "those", "about", "following", "patient", "presents", "history"].includes(w)
    );

  const uniqueKeywords = [...new Set(words)];

  // Score each chunk
  const scored = chunks.map((c) => {
    let score = 0;
    const lowerText = c.text.toLowerCase();
    for (const kw of uniqueKeywords) {
      if (lowerText.includes(kw)) {
        score += 1;
        if (kw.length >= 6) score += 1;
      }
    }
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, 3).filter((c) => c.score > 0);

  if (topChunks.length === 0) {
    return { context: cleanSource.slice(0, 6000), approximateLocation: "Opening sections" };
  }

  const mergedContext = topChunks
    .map((c) => `[Source Location: ${c.location}]\n${c.text}`)
    .join("\n\n---\n\n")
    .slice(0, 8000);

  return {
    context: mergedContext,
    approximateLocation: topChunks.map((c) => c.location).join(", "),
  };
}

const PHASE3_EXPLANATION_SYSTEM = `You are an expert medical educator and examination tutor.
Your task is to write a high-yield, structured medical explanation for the given question and its DETERMINED CORRECT ANSWER.

CRITICAL ARCHITECTURAL RULES:
1. EXPLAIN THE DETERMINED ANSWER (ANSWER INVARIANCE):
   - The correct answer has ALREADY been decided in Phase 2 and is given to you.
   - You MUST explain why this determined answer is right.
   - Do NOT silently change the answer.
   - If you medically believe the determined answer might be incorrect or controversial, set "possible_answer_conflict": true and explain your concern in "answer_conflict_note", but STILL write your explanation for the determined answer.
2. MEDICAL ACCURACY & HIGH YIELD:
   - Provide accurate pathophysiology, anatomy, physiology, pharmacology, or clinical guidelines.
   - Be educational, logical, and clear.
3. STRUCTURE OF "explanation":
   Write GitHub-flavored Markdown with the following mandatory sections:

   **Concept**
   2-3 sentences explaining the core medical mechanism, classification, or foundational principle tested by this question.

   **Why the correct answer is right**
   2-4 concise bullets detailing why the correct option is the accurate answer to the clinical scenario or question stem.

   **Why the other options are wrong**
   List ONLY the incorrect options. Each bullet MUST start with the option's OWN TEXT in **bold** (no letter prefix like A. or B.), followed by a dash, then one clear, specific medical sentence explaining why it is wrong.
   Example:
   - **Histiocytes** — are involved in chronic granulomas, but are not the primary acute mediators in this scenario.

4. "summary_table":
   A GitHub-flavored Markdown table summarizing all options:
   | Option | Result | Summary |
   |---|---|---|
   | [Option text] | ✓ Correct | [Short 1-line reason why it is correct] |
   | [Option text] | ✗ Incorrect | [Short 1-line reason why it is wrong] |

   CRITICAL: The Summary column MUST contain a short explanatory reason (e.g. "Primarily causes alpha-1 vasoconstriction"), NOT just the words "Wrong" or "Correct".

5. "book_answer":
   If study material is provided:
   - State what the provided study source says regarding this question and cite the page/chapter/section.
   - If the source does not contain enough info, write: "Answer from the Book: Not found in the provided source."
   - Set "book_answer_found": true if found, false otherwise.
   If no study material was provided, set "book_answer": null and "book_answer_found": false.

Return STRICT JSON only:
{
  "concept": "<=12 words naming core concept",
  "explanation": "Markdown text with Concept, Why the correct answer is right, and Why the other options are wrong",
  "summary_table": "Markdown table per specification",
  "book_answer": "Citation and finding from book, or 'Answer from the Book: Not found in the provided source.'",
  "book_answer_found": true,
  "possible_answer_conflict": false,
  "answer_conflict_note": null
}`;

// ─────────────────────────────────────────────────────────────────────────────
// 21. initiateExplanationSession
// ─────────────────────────────────────────────────────────────────────────────

const InitiateExplanationInput = z.object({
  sessionId: z.string(),
  model: ModelIdSchema,
  instructions: z.string().max(4000).optional(),
  showBookAnswer: z.boolean().default(true),
});

export const initiateExplanationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InitiateExplanationInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);
    const modelDef = MODELS[data.model];

    try {
      const { error } = await supabase
        .from(SESSIONS_TABLE)
        .update({
          phase3_model: data.model,
          phase3_provider: modelDef?.provider,
          phase3_instructions: data.instructions ?? null,
          phase3_show_book_answer: data.showBookAnswer,
          phase3_status: "running",
        })
        .eq("id", data.sessionId);

      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 22. generateSingleExplanation
// ─────────────────────────────────────────────────────────────────────────────

const GenerateExplanationInput = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  model: ModelIdSchema,
  instructions: z.string().max(4000).optional(),
  showBookAnswer: z.boolean().default(true),
  questionData: z.any().optional(),
  studyMaterialText: z.string().max(100_000).optional(),
  studyMaterialName: z.string().max(300).optional(),
});

export const generateSingleExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateExplanationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const isLocal = data.sessionId.startsWith("local-");

    let sess: any = null;
    if (!isLocal) {
      try {
        const { data: s, error: sErr } = await supabase
          .from(SESSIONS_TABLE)
          .select("study_material_text, study_material_name")
          .eq("id", data.sessionId)
          .single();
        if (!sErr && s) sess = s;
      } catch {}
    }

    const studyText = data.studyMaterialText || sess?.study_material_text || "";
    const studyName = data.studyMaterialName || sess?.study_material_name || "";

    let q = data.questionData;
    if (!q) {
      try {
        const { data: qDb, error: qErr } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id, stem, options, question_type, selected_answer, answer_text, page_number, question_number")
          .eq("id", data.questionId)
          .single();
        if (!qErr && qDb) q = qDb;
      } catch {}
    }

    if (!q) throw new Error("Question not found");

    const optionsList: Array<{ letter: string; body: string }> = Array.isArray(q.options)
      ? q.options
      : [];

    const formattedOptions = optionsList
      .map((o) => `  ${o.letter}) ${o.body}`)
      .join("\n");

    const determinedAnswerStr = Array.isArray(q.selected_answer)
      ? q.selected_answer.join(", ")
      : String(q.selected_answer ?? "Unspecified");

    // Retrieve relevant context from study material if present
    let retrievedContext = "";
    if (studyText.trim()) {
      const retrieved = retrieveRelevantSourceContext(
        studyText,
        q.stem,
        optionsList
      );
      if (retrieved.context) {
        retrievedContext = `RELEVANT STUDY MATERIAL EXCERPT (${studyName || "Provided Source"}):\n"""\n${retrieved.context}\n"""\n\n`;
      }
    }

    let userPrompt = `${retrievedContext}QUESTION:
${q.stem}

OPTIONS:
${formattedOptions}

QUESTION TYPE:
${q.question_type || "single_choice"}

DETERMINED CORRECT ANSWER (FROM PHASE 2):
Option ${determinedAnswerStr}${q.answer_text ? ` (${JSON.stringify(q.answer_text)})` : ""}
`;

    if (data.instructions?.trim()) {
      userPrompt += `\nADDITIONAL USER INSTRUCTIONS FOR EXPLANATION:\n${data.instructions.trim()}\n`;
    }

    userPrompt += `\nGenerate the structured explanation and summary table according to system instructions.`;

    const modelDef = MODELS[data.model];
    if (!modelDef) throw new Error(`Unknown model: ${data.model}`);
    let rawOutput = "";

    try {
      if (modelDef.provider === "gemini") {
        const apiKey = await getGeminiKey(supabase);
        rawOutput = await callGeminiText(
          apiKey,
          modelDef.apiModel,
          PHASE3_EXPLANATION_SYSTEM,
          userPrompt
        );
      } else {
        const apiKey = await getOpenAIKey(supabase);
        rawOutput = await callOpenAIText(
          apiKey,
          modelDef.apiModel,
          PHASE3_EXPLANATION_SYSTEM,
          userPrompt
        );
      }
    } catch (apiErr: any) {
      if (!isLocal) {
        try {
          await supabase
            .from(QUESTIONS_TABLE)
            .update({
              explanation_status: "failed",
            })
            .eq("id", data.questionId);
        } catch {}
      }
      throw apiErr;
    }

    const parsed = extractJson(rawOutput) || {};
    let fullExplanation = String(parsed.explanation || "").trim();

    // If summary table not embedded, append it
    if (parsed.summary_table && !fullExplanation.includes(parsed.summary_table)) {
      fullExplanation += `\n\n${parsed.summary_table}`;
    }

    // If showBookAnswer is enabled and book_answer exists, append it
    if (data.showBookAnswer && studyText && parsed.book_answer) {
      fullExplanation += `\n\n**Answer from the Book**\n${parsed.book_answer}`;
    }

    const hasConflict = Boolean(parsed.possible_answer_conflict);
    const conflictNote = parsed.answer_conflict_note ? String(parsed.answer_conflict_note).trim() : null;

    const updatePayload = {
      concept: parsed.concept ? String(parsed.concept).trim().slice(0, 300) : null,
      explanation: fullExplanation,
      explanation_summary_table: parsed.summary_table ? String(parsed.summary_table).trim() : null,
      book_answer: parsed.book_answer ? String(parsed.book_answer).trim() : null,
      book_answer_found: Boolean(parsed.book_answer_found),
      possible_answer_conflict: hasConflict,
      answer_conflict_note: conflictNote,
      explanation_model: data.model,
      explanation_status: "explained",
      explained_at: new Date().toISOString(),
    };

    if (!isLocal) {
      try {
        await supabase
          .from(QUESTIONS_TABLE)
          .update(updatePayload)
          .eq("id", data.questionId);

        // Recalculate session explanation counters
        const { count: expCount } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id", { count: "exact", head: true })
          .eq("session_id", data.sessionId)
          .eq("explanation_status", "explained");

        const { count: conflictCount } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id", { count: "exact", head: true })
          .eq("session_id", data.sessionId)
          .eq("possible_answer_conflict", true);

        await supabase
          .from(SESSIONS_TABLE)
          .update({
            total_explanations: expCount ?? 0,
            total_conflicts: conflictCount ?? 0,
          })
          .eq("id", data.sessionId);
      } catch {}
    }

    return {
      questionId: data.questionId,
      hasConflict,
      conflictNote,
      bookAnswerFound: Boolean(parsed.book_answer_found),
      concept: updatePayload.concept,
      explanation: fullExplanation,
      explanationSummaryTable: updatePayload.explanation_summary_table,
      bookAnswer: updatePayload.book_answer,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 23. completeExplanationSession
// ─────────────────────────────────────────────────────────────────────────────

const CompleteExplanationInput = z.object({ sessionId: z.string() });

export const completeExplanationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteExplanationInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);

    try {
      const { count: expCount } = await supabase
        .from(QUESTIONS_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("session_id", data.sessionId)
        .eq("explanation_status", "explained");

      const { count: conflictCount } = await supabase
        .from(QUESTIONS_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("session_id", data.sessionId)
        .eq("possible_answer_conflict", true);

      await supabase
        .from(SESSIONS_TABLE)
        .update({
          phase3_status: "completed",
          total_explanations: expCount ?? 0,
          total_conflicts: conflictCount ?? 0,
        })
        .eq("id", data.sessionId);
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }

    return { ok: true };
  });

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 4 — INDEPENDENT QUALITY CONTROL & VERIFICATION (OPTIONAL)
// ═════════════════════════════════════════════════════════════════════════════

export type VerificationProblemType =
  | "extraction_error"
  | "missing_text"
  | "wrong_option"
  | "answer_error"
  | "combination_mapping_error"
  | "multiple_answer_error"
  | "source_mismatch"
  | "book_answer_error"
  | "explanation_error"
  | "medical_accuracy_issue"
  | "citation_error"
  | "other";

export type VerificationIssue = {
  problem_type: VerificationProblemType;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  affected_component: "question" | "options" | "answer" | "explanation" | "source" | "book_answer";
  pdf_page_number: number;
  suggested_action: string;
};

const PHASE4_VERIFICATION_SYSTEM = `You are an independent Senior Medical Quality Control Auditor.
Your job is to audit an exam question across 6 dimensions and identify ANY errors, discrepancies, or defects.

AUDITING DIMENSIONS:
1. Question Extraction: Is the stem complete? Missing words? Truncated clinical vignette?
2. Options Integrity: Are all choices present? Labels preserved? Original combination statements preserved?
3. Correct Answer: Is the indicated correct answer medically sound and corresponding to an existing option?
4. Study Source: If study material was provided, does it genuinely support the selected answer?
5. Explanation Quality: Is the explanation medically accurate, logically consistent, and correctly explains both the right answer and each distractor?
6. Book Answer: Is the book citation accurate and verified in the source?

CRITICAL NON-DESTRUCTIVE RULE:
You do NOT modify the question or fix the answer yourself. You only AUDIT and REPORT any detected issues.

If everything is sound and no defects are detected, return status "passed" and an empty issues list.
If you detect any issues, return status "flagged" or "error", and list each issue in the "issues" array.

Return STRICT JSON only:
{
  "status": "passed" | "flagged" | "error",
  "issues": [
    {
      "problem_type": "extraction_error" | "missing_text" | "wrong_option" | "answer_error" | "combination_mapping_error" | "multiple_answer_error" | "source_mismatch" | "book_answer_error" | "explanation_error" | "medical_accuracy_issue" | "citation_error" | "other",
      "description": "Clear explanation of what is wrong",
      "severity": "low" | "medium" | "high" | "critical",
      "affected_component": "question" | "options" | "answer" | "explanation" | "source" | "book_answer",
      "suggested_action": "Suggested resolution or fix"
    }
  ]
}`;

// ─────────────────────────────────────────────────────────────────────────────
// 24. initiateVerificationSession
// ─────────────────────────────────────────────────────────────────────────────

const InitiateVerificationInput = z.object({
  sessionId: z.string(),
  model: ModelIdSchema,
});

export const initiateVerificationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InitiateVerificationInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);
    const modelDef = MODELS[data.model];

    try {
      const { error } = await supabase
        .from(SESSIONS_TABLE)
        .update({
          phase4_model: data.model,
          phase4_provider: modelDef?.provider,
          phase4_status: "running",
        })
        .eq("id", data.sessionId);

      if (error && !isMissingTableError(error)) throw error;
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 25. verifySingleQuestion
// ─────────────────────────────────────────────────────────────────────────────

const VerifyQuestionInput = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  model: ModelIdSchema,
  questionData: z.any().optional(),
  studyMaterialText: z.string().max(100_000).optional(),
});

export const verifySingleQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const isLocal = data.sessionId.startsWith("local-");

    // Fetch session
    let sess: any = null;
    if (!isLocal) {
      try {
        const { data: s } = await supabase
          .from(SESSIONS_TABLE)
          .select("study_material_text, study_material_name")
          .eq("id", data.sessionId)
          .single();
        if (s) sess = s;
      } catch {}
    }

    const studyText = data.studyMaterialText || sess?.study_material_text || "";

    // Fetch question (from questionData or DB)
    let q = data.questionData;
    if (!q) {
      try {
        const { data: qDb, error: qErr } = await supabase
          .from(QUESTIONS_TABLE)
          .select(
            "id, page_number, question_number, stem, options, question_type, selected_answer, answer_text, source_reference, concept, explanation, book_answer"
          )
          .eq("id", data.questionId)
          .single();
        if (!qErr && qDb) q = qDb;
      } catch {}
    }

    if (!q) throw new Error("Question not found");

    const optionsList: Array<{ letter: string; body: string }> = Array.isArray(q.options)
      ? q.options
      : [];

    const formattedOptions = optionsList
      .map((o) => `  ${o.letter}) ${o.body}`)
      .join("\n");

    const determinedAnswerStr = Array.isArray(q.selected_answer)
      ? q.selected_answer.join(", ")
      : String(q.selected_answer ?? "None");

    let sourceContext = "";
    if (studyText.trim()) {
      const ret = retrieveRelevantSourceContext(studyText, q.stem, optionsList);
      sourceContext = `AVAILABLE STUDY MATERIAL EXCERPT:\n"""\n${ret.context}\n"""\n\n`;
    }

    const auditPrompt = `${sourceContext}QUESTION UNDER AUDIT (PDF Page ${q.page_number}${q.question_number ? `, Question #${q.question_number}` : ""}):
Stem:
${q.stem}

Options:
${formattedOptions}

Question Type:
${q.question_type || "single_choice"}

Phase 2 Selected Correct Answer:
Option ${determinedAnswerStr}${q.answer_text ? ` (${JSON.stringify(q.answer_text)})` : ""}

Source Reference Citation:
${q.source_reference || "None"}

Phase 3 Explanation:
${q.explanation || "No explanation generated yet"}

Book Answer Cited:
${q.book_answer || "None"}

Audit all 6 dimensions strictly according to the system instructions. Attach accurate problem_type and severity to any detected issues.`;

    const modelDef = MODELS[data.model];
    if (!modelDef) throw new Error(`Unknown model: ${data.model}`);
    let rawOutput = "";

    try {
      if (modelDef.provider === "gemini") {
        const apiKey = await getGeminiKey(supabase);
        rawOutput = await callGeminiText(
          apiKey,
          modelDef.apiModel,
          PHASE4_VERIFICATION_SYSTEM,
          auditPrompt
        );
      } else {
        const apiKey = await getOpenAIKey(supabase);
        rawOutput = await callOpenAIText(
          apiKey,
          modelDef.apiModel,
          PHASE4_VERIFICATION_SYSTEM,
          auditPrompt
        );
      }
    } catch (apiErr: any) {
      if (!isLocal) {
        try {
          await supabase
            .from(QUESTIONS_TABLE)
            .update({
              verification_status: "error",
            })
            .eq("id", data.questionId);
        } catch {}
      }
      throw apiErr;
    }

    const parsed = extractJson(rawOutput) || {};
    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];

    // Ensure every reported issue explicitly preserves pdf_page_number
    const verifiedIssues: VerificationIssue[] = rawIssues.map((iss: any) => ({
      problem_type: iss.problem_type || "other",
      description: String(iss.description || "Unspecified issue"),
      severity: ["low", "medium", "high", "critical"].includes(iss.severity) ? iss.severity : "medium",
      affected_component: iss.affected_component || "question",
      pdf_page_number: q.page_number,
      suggested_action: String(iss.suggested_action || "Review manually"),
    }));

    const status: "passed" | "flagged" | "error" =
      verifiedIssues.length === 0
        ? "passed"
        : verifiedIssues.some((i) => i.severity === "critical" || i.severity === "high")
        ? "error"
        : "flagged";

    if (!isLocal) {
      try {
        await supabase
          .from(QUESTIONS_TABLE)
          .update({
            verification_status: status,
            verification_report: verifiedIssues,
            verified_at: new Date().toISOString(),
          })
          .eq("id", data.questionId);

        // Recalculate session verification counters
        const { count: totalChecked } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id", { count: "exact", head: true })
          .eq("session_id", data.sessionId)
          .in("verification_status", ["passed", "flagged", "error"]);

        const { count: issuesCount } = await supabase
          .from(QUESTIONS_TABLE)
          .select("id", { count: "exact", head: true })
          .eq("session_id", data.sessionId)
          .in("verification_status", ["flagged", "error"]);

        await supabase
          .from(SESSIONS_TABLE)
          .update({
            phase4_total_checked: totalChecked ?? 0,
            phase4_issues_count: issuesCount ?? 0,
          })
          .eq("id", data.sessionId);
      } catch {}
    }

    return {
      questionId: data.questionId,
      status,
      issuesCount: verifiedIssues.length,
      issues: verifiedIssues,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 26. completeVerificationSession
// ─────────────────────────────────────────────────────────────────────────────

const CompleteVerificationInput = z.object({ sessionId: z.string() });

export const completeVerificationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteVerificationInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.sessionId.startsWith("local-")) return { ok: true };
    const { supabase } = await ensureAdmin(context);

    try {
      const { count: totalChecked } = await supabase
        .from(QUESTIONS_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("session_id", data.sessionId)
        .in("verification_status", ["passed", "flagged", "error"]);

      const { count: issuesCount } = await supabase
        .from(QUESTIONS_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("session_id", data.sessionId)
        .in("verification_status", ["flagged", "error"]);

      await supabase
        .from(SESSIONS_TABLE)
        .update({
          phase4_status: "completed",
          phase4_total_checked: totalChecked ?? 0,
          phase4_issues_count: issuesCount ?? 0,
        })
        .eq("id", data.sessionId);
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }

    return { ok: true };
  });
