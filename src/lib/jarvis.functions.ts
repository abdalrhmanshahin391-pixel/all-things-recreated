import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getGeminiPool, callGeminiJSON, loadModelLimits, getPoolStatus, resetModelBuckets, type GeminiPool } from "@/lib/gemini-pool";

const InputSchema = z.object({
  subjectId: z.string().uuid(),
  provider: z.enum(["lovable", "gemini", "openai", "anthropic"]),
  imageBase64: z.string().min(10),
  mimeType: z.string().default("image/jpeg"),
  hint: z.string().optional(),
});

const ResultSchema = z.object({
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
});

const SYSTEM_PROMPT = `You are Jarvis, a medical-quiz extraction assistant.
Look at the screenshot of a multiple choice question and return STRICT JSON ONLY (no markdown fences, no commentary) with this exact shape:

{
  "prompt": "the question stem, plain text",
  "options": [
    {"letter":"A","body":"...","is_correct":true|false},
    {"letter":"B","body":"...","is_correct":true|false}
    // every option visible in the image, in order
  ],
  "explanation": "Markdown text following the EXACT template below"
}

Rules for options:
- Include EVERY option shown in the image (typically 4 or 5, sometimes up to 6), labelled A, B, C, D, E, F in order. Never invent or drop options.
- Exactly one option must have is_correct=true.
- If the image already shows which answer is correct (highlighted/marked/green), respect it. Otherwise pick the medically correct one.

Rules for the explanation — follow this template exactly, in clean GitHub-flavored Markdown:

**Concept**

2-4 short sentences of background. Bold the **key terms** inline. No leading "**Concept**" repetition inside the body.

**Why the correct answer is right**

- One bullet per reason (3-5 bullets total).
- Bold the **mechanism** or **key fact** in each bullet.
- End with a one-line clinical pearl bullet.

**Why the other options are wrong**

- **A) <short option text>** — one tight sentence explaining why it is not the best answer.
- **C) <short option text>** — one tight sentence.
- **D) <short option text>** — one tight sentence.
- **E) <short option text>** — one tight sentence (only if option E exists).
(Skip the row for the correct letter. Use the real letters/text from the image.)

**Summary**

| Option | Verdict | One-line reason |
|---|---|---|
| A | ✗ | … |
| B | ✓ Correct | … |
| C | ✗ | … |
| D | ✗ | … |
| E | ✗ | … |

Summary table rules:
- One row for EVERY option in the image, in order.
- Mark the correct row with ✓ Correct, all others with ✗.
- Keep each reason under ~12 words.

General:
- Write in English unless the hint asks otherwise.
- Output JSON only — no code fences, no commentary outside the JSON.`;


async function callLovable(imageBase64: string, mimeType: string, hint?: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: hint || "Extract the question." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
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

async function callGemini(
  pool: GeminiPool,
  imageBase64: string,
  mimeType: string,
  hint?: string,
) {
  return await callGeminiJSON({
    pool,
    systemPrompt: SYSTEM_PROMPT,
    userParts: [
      { text: hint || "Extract the question." },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    timeoutMs: 60_000,
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
  });
}

async function callOpenAI(apiKey: string, imageBase64: string, mimeType: string, hint?: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: hint || "Extract the question." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, imageBase64: string, mimeType: string, hint?: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: hint || "Extract the question and return JSON only." },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const block = j.content?.find((b: any) => b.type === "text");
  return block?.text ?? "";
}

function extractJson(text: string): any {
  let cleaned = text.trim().replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // Strip control chars except \n \r \t
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {}
    // remove trailing commas
    const repaired = slice.replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {}
  }
  throw new Error(`AI returned malformed JSON: ${cleaned.slice(0, 200)}`);
}

async function callAndParseQuestion(
  supabase: any,
  data: z.infer<typeof InputSchema>,
): Promise<z.infer<typeof ResultSchema>> {
  let raw = "";
  if (data.provider === "lovable") {
    raw = await callLovable(data.imageBase64, data.mimeType, data.hint);
  } else if (data.provider === "gemini") {
    const pool = await getGeminiPool(supabase);
    raw = await callGemini(pool, data.imageBase64, data.mimeType, data.hint);
  } else {
    const { data: row, error } = await supabase
      .from("admin_ai_keys")
      .select("api_key")
      .eq("provider", data.provider)
      .order("slot", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!row?.api_key) throw new Error(`No API key saved for ${data.provider}. Add it in /admin/ai-keys.`);
    if (data.provider === "openai") raw = await callOpenAI(row.api_key, data.imageBase64, data.mimeType, data.hint);
    else raw = await callAnthropic(row.api_key, data.imageBase64, data.mimeType, data.hint);
  }
  const parsed = ResultSchema.parse(extractJson(raw));
  if (parsed.options.filter((o) => o.is_correct).length !== 1) {
    parsed.options = parsed.options.map((o, i) => ({ ...o, is_correct: i === 0 }));
  }
  return parsed;
}

async function insertParsedQuestion(
  supabase: any,
  subjectId: string,
  parsed: z.infer<typeof ResultSchema>,
): Promise<{ questionId: string | null; inserted: boolean }> {
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subjectId);

  // Upsert via the (subject_id, stem_hash) unique index. ignoreDuplicates means
  // a re-run of the same import does NOT insert again and does NOT throw — it
  // simply returns no row. Caller treats `inserted=false` as "already in DB".
  const { data: q, error: qErr } = await supabase
    .from("questions")
    .upsert(
      {
        subject_id: subjectId,
        stem: parsed.prompt,
        explanation: parsed.explanation || null,
        sort_order: (count ?? 0) + 1,
      },
      { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (qErr) throw qErr;
  if (!q?.id) {
    // Duplicate — question already exists for this subject. Skip options too.
    return { questionId: null, inserted: false };
  }

  const rows = parsed.options.map((o, i) => ({
    question_id: q.id,
    label: o.letter,
    text: o.body,
    is_correct: o.is_correct,
    sort_order: i + 1,
  }));
  const { error: oErr } = await supabase.from("question_options").insert(rows);
  if (oErr) throw oErr;
  return { questionId: q.id as string, inserted: true };
}

export const generateQuestionFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const parsed = await callAndParseQuestion(supabase, data);
    const r = await insertParsedQuestion(supabase, data.subjectId, parsed);
    return { questionId: r.questionId, inserted: r.inserted };
  });

// Extract-only (no DB write) — used by frame-by-frame video flow to dedupe before insert
export const extractQuestionFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    return await callAndParseQuestion(supabase, data);
  });

const InsertInputSchema = z.object({
  subjectId: z.string().uuid(),
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
});

export const insertExtractedQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InsertInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    if (data.options.filter((o) => o.is_correct).length !== 1) {
      data.options = data.options.map((o, i) => ({ ...o, is_correct: i === 0 }));
    }
    const r = await insertParsedQuestion(supabase, data.subjectId, {
      prompt: data.prompt,
      options: data.options,
      explanation: data.explanation,
    });
    return { questionId: r.questionId, inserted: r.inserted };
  });


const KeyInput = z.object({
  provider: z.enum(["gemini", "openai", "anthropic"]),
  apiKey: z.string().min(8).max(500),
  slot: z.number().int().min(1).max(5).default(1),
});

export const saveAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => KeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabase
      .from("admin_ai_keys")
      .upsert({
        provider: data.provider,
        slot: data.slot,
        api_key: data.apiKey,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      } as any);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: z.enum(["gemini", "openai", "anthropic"]),
        slot: z.number().int().min(1).max(5).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabase
      .from("admin_ai_keys")
      .delete()
      .eq("provider", data.provider)
      .eq("slot", data.slot);
    if (error) throw error;
    return { ok: true };
  });

export const savePreferredGeminiModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ model: z.string().min(2).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const limits = await loadModelLimits(supabase);
    if (!limits[data.model]) throw new Error("Unknown model");
    const { error } = await supabase
      .from("admin_ai_keys")
      .update({ preferred_model: data.model } as any)
      .eq("provider", "gemini");
    if (error) throw error;
    return { ok: true };
  });

export const listAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await supabase
      .from("admin_ai_keys")
      .select("provider, slot, updated_at, preferred_model")
      .order("slot", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as {
      provider: string;
      slot: number;
      updated_at: string;
      preferred_model: string | null;
    }[];
    const limits = await loadModelLimits(supabase);
    const enabled = Object.entries(limits).filter(([, l]) => l.enabled).sort((a, b) => a[1].sortOrder - b[1].sortOrder);
    const models = enabled.map(([id, l]) => ({
      id,
      label: `${l.label} — ${l.rpm}/min · ${l.rpd}/day${l.supportsVision ? "" : " (text-only)"}`,
    }));
    const preferredModel =
      rows.find((r) => r.provider === "gemini" && r.preferred_model)?.preferred_model ||
      (enabled[0]?.[0] ?? "gemini-2.5-flash-lite");
    return { keys: rows, preferredModel, models };
  });

export const listGeminiModelLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const sel = "model_id,label,rpm,rpd,supports_vision,enabled,smooth_pacing,cooldown_seconds,sort_order,max_concurrent,api_model_id,use_json_mime,last_error,last_error_at";
    let { data, error } = await (supabase.from as any)("admin_ai_model_limits")
      .select(sel)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    // Self-heal: if the Flash-Lite row is missing (fresh remix / empty table),
    // seed it so the admin UI always has an editable row.
    const hasLite = (data ?? []).some((r: any) => r.model_id === "gemini-2.5-flash-lite");
    if (!hasLite) {
      await (supabase.from as any)("admin_ai_model_limits").upsert({
        model_id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        rpm: 15, rpd: 1000,
        supports_vision: true, enabled: true,
        smooth_pacing: false, cooldown_seconds: 30,
        sort_order: 10, max_concurrent: 4,
        api_model_id: "gemini-flash-lite-latest",
        use_json_mime: true,
      }, { onConflict: "model_id" });
      const r2 = await (supabase.from as any)("admin_ai_model_limits")
        .select(sel).order("sort_order", { ascending: true });
      data = r2.data ?? [];
    }
    return { rows: data ?? [] };
  });

const ModelLimitUpdate = z.object({
  model_id: z.string().min(2).max(64),
  rpm: z.number().int().min(1).max(10000).optional(),
  rpd: z.number().int().min(1).max(1_000_000).optional(),
  enabled: z.boolean().optional(),
  smooth_pacing: z.boolean().optional(),
  cooldown_seconds: z.number().int().min(0).max(3600).optional(),
  supports_vision: z.boolean().optional(),
  label: z.string().min(1).max(200).optional(),
  max_concurrent: z.number().int().min(1).max(32).optional(),
  api_model_id: z.string().min(2).max(128).optional(),
  use_json_mime: z.boolean().optional(),
});

export const updateGeminiModelLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ModelLimitUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { model_id, ...patch } = data;
    // Upsert so a missing row (fresh remix / wiped table) is created, not
    // silently no-op'd. We provide safe defaults for required NOT NULL cols.
    const defaults = {
      model_id,
      label: "Gemini 2.5 Flash-Lite",
      rpm: 15, rpd: 1000,
      supports_vision: true, enabled: true,
      smooth_pacing: false, cooldown_seconds: 30,
      sort_order: 10, max_concurrent: 4,
      api_model_id: model_id,
      use_json_mime: true,
    };
    const { error } = await (supabase.from as any)("admin_ai_model_limits")
      .upsert({ ...defaults, ...patch, model_id, updated_by: userId }, { onConflict: "model_id" });
    if (error) throw error;
    // Clear any in-memory cooldowns/error state for this model so the new
    // limits (esp. lowered cooldown_seconds) take effect immediately.
    resetModelBuckets(model_id);
    return { ok: true };
  });

export const resetGeminiModelStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ model_id: z.string().min(2).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    resetModelBuckets(data.model_id);
    await (supabase.from as any)("admin_ai_model_limits")
      .update({ last_error: null, last_error_at: null })
      .eq("model_id", data.model_id);
    return { ok: true };
  });

export const getGeminiPoolStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const pool = await getGeminiPool(supabase);
    const rows = getPoolStatus(pool, true);
    return {
      keyCount: pool.keys.length,
      preferredModel: pool.preferredModel,
      rows,
    };
  });



// ─────────────────────────────────────────────────────────────
// VIDEO → questions (whole video to Gemini, returns N questions)
// ─────────────────────────────────────────────────────────────

const VideoInputSchema = z.object({
  subjectId: z.string().uuid(),
  videoBase64: z.string().min(100),
  mimeType: z.string().default("video/mp4"),
  hint: z.string().optional(),
});

const VideoResultSchema = z.object({
  questions: z.array(ResultSchema).min(1).max(100),
});

const VIDEO_SYSTEM_PROMPT = `You are Jarvis, a medical-quiz extraction assistant. The input is a SCREEN-RECORDING that scrolls through multiple multiple-choice questions. Watch the entire video carefully and return STRICT JSON ONLY (no markdown, no commentary) with this exact shape:

{
  "questions": [
    {
      "prompt": "...",
      "options": [{"letter":"A","body":"...","is_correct":true|false}, ...],
      "explanation": "..."
    }
  ]
}

Rules:
- Extract EVERY distinct question that appears in the video, in the order they appear. Do not duplicate the same question.
- For each question, include EVERY option visible (typically 4-5, sometimes up to 6), labelled A, B, C, D, E, F in order. Exactly one option must have is_correct=true.
- If the video shows which answer is correct (highlighted/marked/green), respect it. Otherwise pick the medically correct one.
- The "explanation" field must be Markdown following the same template Jarvis uses for single questions: **Concept**, **Why the correct answer is right** (bulleted), **Why the other options are wrong** (one bullet per wrong letter), and a **Summary** table with one row per option (✓ Correct / ✗).
- Write in English unless the hint asks otherwise.
- Output JSON only — no code fences, no commentary outside the JSON.`;

async function callGeminiVideo(
  pool: GeminiPool,
  videoBase64: string,
  mimeType: string,
  hint: string | undefined,
) {
  return await callGeminiJSON({
    pool,
    systemPrompt: VIDEO_SYSTEM_PROMPT,
    userParts: [
      { text: hint || "Extract every question in this video." },
      { inline_data: { mime_type: mimeType, data: videoBase64 } },
    ],
    timeoutMs: 180_000,
    generationConfig: { temperature: 0.3, maxOutputTokens: 32768 },
  });
}

export const generateQuestionsFromVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const sizeBytes = Math.floor((data.videoBase64.length * 3) / 4);
    if (sizeBytes > 20 * 1024 * 1024) {
      throw new Error("Video is larger than 20 MB. Trim it or use frame-by-frame mode.");
    }

    const pool = await getGeminiPool(supabase);
    const raw = await callGeminiVideo(pool, data.videoBase64, data.mimeType, data.hint);
    const parsed = VideoResultSchema.parse(extractJson(raw));

    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", data.subjectId);

    let nextOrder = (count ?? 0) + 1;
    let added = 0;
    for (const q of parsed.questions) {
      if (q.options.filter((o) => o.is_correct).length !== 1) {
        q.options = q.options.map((o, i) => ({ ...o, is_correct: i === 0 }));
      }
      const { data: inserted, error: qErr } = await supabase
        .from("questions")
        .upsert(
          {
            subject_id: data.subjectId,
            stem: q.prompt,
            explanation: q.explanation || null,
            sort_order: nextOrder++,
          },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (qErr) throw qErr;
      if (!inserted?.id) continue; // duplicate — skip silently

      const rows = q.options.map((o, i) => ({
        question_id: inserted.id,
        label: o.letter,
        text: o.body,
        is_correct: o.is_correct,
        sort_order: i + 1,
      }));
      const { error: oErr } = await supabase.from("question_options").insert(rows);
      if (oErr) throw oErr;
      added++;
    }

    return { added };
  });


/**
 * Fire a tiny real request at Google using a saved Gemini key so admins can
 * verify a slot works before starting an expensive batch run.
 */
export const testGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ slot: z.number().int().min(1).max(5) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: row, error } = await supabase
      .from("admin_ai_keys")
      .select("api_key")
      .eq("provider", "gemini")
      .eq("slot", data.slot)
      .maybeSingle();
    if (error) throw error;
    if (!row?.api_key) return { ok: false, error: `No key saved in slot ${data.slot}.` };

    // Try the exact batch model first; if this key's Google project can't use
    // that id, fall back to the always-current Flash-Lite alias so the admin
    // still learns whether the key itself is valid.
    const candidates = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
    let lastError = "";
    for (const model of candidates) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": row.api_key },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
              generationConfig: { maxOutputTokens: 16, temperature: 0 },
            }),
          },
        );
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastError = String(json?.error?.message || `HTTP ${res.status}`).slice(0, 300);
          continue;
        }
        const text =
          json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ") || "";
        return { ok: true, model, reply: String(text).trim().slice(0, 80) || "(empty reply)" };
      } catch (e: any) {
        lastError = String(e?.message || e).slice(0, 300);
      }
    }
    return { ok: false, error: lastError || "Gemini did not respond." };
  });
