import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  AI_PROVIDERS,
  buildQuestionPrompt,
  callGeminiQuestions,
  callOpenAiQuestions,
  defaultModelFor,
  resolveModelFor,
  pingGemini,
  pingOpenAi,
  QUESTION_MODES,
  type AiProvider,
} from "@/lib/question-generator.server";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

async function readKey(context: { supabase: any }, provider: AiProvider) {
  const { data, error } = await context.supabase
    .from("admin_ai_keys")
    .select("api_key, preferred_model, slot")
    .eq("provider", provider)
    .order("slot", { ascending: true })
    .limit(5);
  if (error) throw error;
  const rows = (data ?? []) as { api_key: string | null; preferred_model: string | null }[];
  const row = rows.find((r) => (r.api_key ?? "").trim().length > 10);
  const key = (row?.api_key ?? "").trim();
  if (!key) {
    throw new Error(
      `No ${provider === "gemini" ? "Gemini" : "OpenAI"} key saved yet. Add your key at the top of this page${provider === "gemini" ? " or on the Gemini keys page" : ""}.`,
    );
  }
  return { key, model: (row?.preferred_model || defaultModelFor(provider)) as string };
}

const ProviderInput = z.object({ provider: z.enum(AI_PROVIDERS).default("openai") });

export const saveApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        provider: z.enum(AI_PROVIDERS).default("openai"),
        apiKey: z.string().min(20).max(300),
        model: z.string().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("admin_ai_keys").upsert(
      {
        provider: data.provider,
        slot: 1,
        api_key: data.apiKey.trim(),
        preferred_model: data.model?.trim() || defaultModelFor(data.provider),
        updated_at: new Date().toISOString(),
        updated_by: (context as any).userId,
      },
      { onConflict: "provider,slot" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const getApiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ProviderInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { data: row } = await (context as any).supabase
      .from("admin_ai_keys")
      .select("api_key, preferred_model, updated_at")
      .eq("provider", data.provider)
      .order("slot", { ascending: true })
      .limit(1)
      .maybeSingle();
    const key = (row?.api_key ?? "") as string;
    return {
      provider: data.provider,
      saved: key.length > 10,
      masked: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : "",
      model: resolveModelFor(data.provider, row?.preferred_model ?? null),
      updatedAt: (row?.updated_at ?? null) as string | null,
    };
  });

export const testApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ProviderInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { key, model } = await readKey(context as any, data.provider);
    return data.provider === "gemini" ? await pingGemini(key, model) : await pingOpenAi(key, model);
  });

const JobInput = z.object({
  provider: z.enum(AI_PROVIDERS).default("openai"),
  mode: z.enum(QUESTION_MODES),
  text: z.string().max(160_000).default(""),
  images: z
    .array(z.object({ mime: z.string().max(40), base64: z.string().min(100) }))
    .max(6)
    .optional(),
  referenceText: z.string().max(160_000).optional(),
  notes: z.string().max(4_000).optional(),
  count: z.number().int().min(1).max(40).optional(),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  language: z.enum(["en", "ar"]).default("en"),
});

export const runQuestionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const parsed = JobInput.parse(data);
    if (parsed.text.trim().length < 20 && !(parsed.images?.length)) {
      throw new Error("Provide some text or at least one page image.");
    }
    return parsed;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { key, model } = await readKey(context as any, data.provider);
    const images = data.images ?? [];
    const prompt = buildQuestionPrompt({ ...data, hasImages: images.length > 0 });
    const result =
      data.provider === "gemini"
        ? await callGeminiQuestions(key, model, prompt.system, prompt.user, images)
        : await callOpenAiQuestions(key, model, prompt.system, prompt.user, images);
    return {
      provider: data.provider,
      model: result.modelUsed || model,
      questions: result.questions,
      note: result.note,
      truncated: !!result.truncated,
      rawPreview: result.questions.length === 0 ? result.rawPreview : "",
    };
  });

