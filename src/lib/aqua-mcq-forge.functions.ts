import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { formatQuestionStem } from "@/lib/question-format";
import {
  AMF_MODELS,
  buildTopicDiscoveryPrompt,
  buildFactExtractionPrompt,
  buildGenerationSystemPrompt,
  buildBatchGenerationSystemPrompt,
  buildValidatorSystemPrompt,
  QUESTION_OBJECTIVES,
} from "@/lib/aqua-mcq-forge.prompts";
import {
  buildForgeExplanation,
  type ExplanationData,
  type SourceFidelityData,
} from "@/lib/aqua-mcq-forge.explanation";
import { calculateSimilarity, checkDuplicate, dupHash } from "@/lib/aqua-mcq-forge.similarity";

const JOBS = "amf_jobs";
const SOURCES = "amf_sources";
const TOPICS = "amf_topics";
const ITEMS = "amf_items";
const EVENTS = "amf_events";

// Existing production tables for transparent zero-downtime fallback
const AMG_GROUPS = "amg_groups";
const AMG_SOURCES = "amg_sources";
const AMG_ITEMS = "amg_items";
const AMG_KEYS = "amg_keys";
const AMG_SOURCE_BUCKET = "amg-sources";

type Ctx = { supabase: any; userId: string };

async function ensureStaff(context: any): Promise<Ctx> {
  const { supabase, userId } = context;
  const { data: allowed } = await supabase.rpc("can_use_amg", { _user_id: userId });
  if (!allowed) throw new Error("Forbidden: Staff access required for Aqua MCQ Forge.");
  return { supabase, userId };
}

export async function getKey(supabase: any, provider: string): Promise<string> {
  // 1. Try amg_keys
  const { data: k1 } = await supabase.from(AMG_KEYS).select("api_key").eq("provider", provider).maybeSingle();
  let key = String(k1?.api_key ?? "").trim();
  if (key) return key;

  // 2. Try admin_ai_keys
  const searchProv = provider === "google" ? "gemini" : provider;
  const { data: k2 } = await supabase
    .from("admin_ai_keys")
    .select("api_key")
    .eq("provider", searchProv)
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle();
  key = String(k2?.api_key ?? "").trim();
  if (key) return key;

  // 3. Try server environment variables
  if (provider === "google") {
    key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY || "";
  } else {
    key = process.env.OPENAI_API_KEY || "";
  }
  if (key) return key.trim();

  throw new Error(
    provider === "google"
      ? "No Google AI Studio key found. Please save a Google key in the API Key box on this page or in Aqua MCQ Gen Pro."
      : "No OpenAI key found. Please save an OpenAI key in the API Key box on this page or in Aqua MCQ Gen Pro.",
  );
}

function parseJson(text: string): any {
  let raw = String(text ?? "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  raw = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(raw);
}

function normalizeGoogleModel(model: string): string[] {
  const m = String(model || "").toLowerCase();
  if (m.includes("flash-lite") || m.includes("lite")) {
    return ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash"];
  }
  if (m.includes("pro")) {
    return ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"];
  }
  // Standard Flash models: gemini-3.5-flash, gemini-2.5-flash, gemini-2.0-flash
  return ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite"];
}

/** Deterministic structural topic extractor from textbook headings as instant reliable fallback */
export function extractTopicsFromText(fullText: string): { name: string; description: string; estimated_weight: number }[] {
  const topics: { name: string; description: string; estimated_weight: number }[] = [];
  const lines = fullText.split("\n");
  const regexes = [
    /^(?:(?:Chapter|Section|Part|Topic)\s+\d+[:.]?\s*)([A-Z][^\n]{3,60})/i,
    /^(\d+\.\s+[A-Z][^\n]{3,60})/,
    /^([I|V|X]+\.\s+[A-Z][^\n]{3,60})/,
  ];

  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length > 80 || line.length < 5) continue;
    if (line.includes("http") || line.includes("CELL INJURY") || line.includes("Page ") || /^\d+\/\d+$/.test(line)) continue;

    for (const rx of regexes) {
      const match = line.match(rx);
      if (match) {
        const cleanName = (match[1] || match[0])
          .replace(/^\d+\.\s*/, "")
          .replace(/^[I|V|X]+\.\s*/, "")
          .trim();
        const key = cleanName.toLowerCase();
        if (cleanName.length >= 4 && !seen.has(key) && !key.includes("table") && !key.includes("figure") && !key.includes("reference")) {
          seen.add(key);
          let desc = "";
          for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
            const nextL = lines[j].trim();
            if (nextL && nextL.length > 20 && !nextL.includes("http")) {
              desc = nextL.slice(0, 140);
              break;
            }
          }
          topics.push({
            name: cleanName,
            description: desc || `Key pathophysiology concepts and principles of ${cleanName}.`,
            estimated_weight: 5,
          });
          break;
        }
      }
    }
  }

  return topics.slice(0, 10);
}


// ------------------------------------------------------------- AI Callers ---

async function callGoogleText(apiKey: string, requestedModel: string, system: string, prompt: string): Promise<string> {
  const modelsToTry = normalizeGoogleModel(requestedModel);
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 6000, responseMimeType: "application/json" },
        }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (res.ok) {
        return json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
      }
      lastError = new Error(`Google API error (${res.status} for ${model}): ${JSON.stringify(json).slice(0, 300)}`);
      // If 404 model not found, try next model in fallback list
      if (res.status !== 404 && res.status !== 400) break;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("Failed to call Google AI Studio API");
}

async function callOpenAiText(apiKey: string, model: string, system: string, prompt: string): Promise<string> {
  const body: any = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  };
  if (!/^gpt-5/.test(model)) body.temperature = 0.3;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.choices?.[0]?.message?.content ?? "";
}

/**
 * Pure AI Image Generation:
 * Generates an educational medical diagram from scratch using AI image synthesis models (Flux / SDXL via Pollinations AI,
 * or Imagen / DALL-E if keys are present). Never pulls from Google Search and never crops from the PDF.
 */
export async function generateMedicalDiagram(
  supabase: any,
  provider: string,
  apiKey: string,
  prompt: string,
  jobId: string,
): Promise<string> {
  // 1. Try DALL-E 3 if OpenAI provider
  if (provider === "openai" && apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: `Medical scientific diagram, textbook educational illustration with clear annotations: ${prompt}. White background, crisp schematic vector style.`,
          n: 1,
          size: "1024x1024",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const url = json?.data?.[0]?.url;
        if (url) return url;
      }
    } catch (e) {
      console.warn("DALL-E generation fallback:", e);
    }
  }

  // 2. High-speed, guaranteed pure AI generation via Flux / SDXL (Pollinations AI)
  // Generates 100% original medical schematics on the fly
  const sanitizedPrompt = encodeURIComponent(
    `medical textbook diagram illustration of ${prompt}, clean white background, high definition anatomical schematic, scientific chart`,
  );
  const seed = Math.floor(Math.random() * 9000000) + 1000000;
  const aiImageUrl = `https://image.pollinations.ai/prompt/${sanitizedPrompt}?width=800&height=600&model=flux&nologo=true&seed=${seed}`;

  return aiImageUrl;
}

// ================================================================= KEYS =====

export const amfListKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureStaff(context);
    const { data } = await supabase.from(AMG_KEYS).select("provider, updated_at");
    const out: Record<string, string | null> = { google: null, openai: null };
    for (const row of data ?? []) out[row.provider] = row.updated_at;
    return out;
  });

export const amfSaveKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      provider: z.enum(["google", "openai"]),
      apiKey: z.string().min(8).max(400),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { error } = await supabase
      .from(AMG_KEYS)
      .upsert({ provider: data.provider, api_key: data.apiKey.trim(), updated_at: new Date().toISOString() }, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================= JOBS =====

export const amfListJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureStaff(context);

    // 1. Try amf_jobs
    let { data: jobs, error: jErr } = await supabase.from(JOBS).select("*").order("created_at", { ascending: false });

    // 2. Fallback to amg_groups where mode = 'forge'
    if (jErr && (jErr.code === "PGRST205" || jErr.message?.includes("amf_jobs"))) {
      const { data: gList } = await supabase
        .from(AMG_GROUPS)
        .select("*")
        .eq("mode", "forge")
        .order("created_at", { ascending: false });

      const parsedJobs = (gList ?? []).map((g: any) => {
        let meta: any = {};
        try {
          meta = JSON.parse(g.instructions || "{}");
        } catch {}
        return {
          ...g,
          source_mode: meta.source_mode || "strict",
          style_mode: meta.style_mode || "ai",
          style_course_id: meta.style_course_id ?? null,
          difficulty_easy: meta.difficulty_easy ?? 34,
          difficulty_medium: meta.difficulty_medium ?? 33,
          difficulty_hard: meta.difficulty_hard ?? 33,
          type_standard: meta.type_standard ?? 50,
          type_combined: meta.type_combined ?? 50,
          ai_decides_type: meta.ai_decides_type ?? false,
          total_questions: meta.total_questions ?? 20,
          coverage_mode: meta.coverage_mode ?? false,
          dup_threshold: meta.dup_threshold ?? 87,
          include_images: meta.include_images ?? false,
          image_count: meta.image_count ?? 0,
          source_fidelity_enabled: meta.source_fidelity_enabled ?? true,
        };
      });
      jobs = parsedJobs;
    }

    const list = jobs ?? [];
    if (!list.length) return [];

    // Query item counts
    let items: any[] = [];
    const { data: amfItems } = await supabase.from(ITEMS).select("job_id, status, validation_passed, flagged");
    if (amfItems) {
      items = amfItems;
    } else {
      const { data: amgItems } = await supabase.from(AMG_ITEMS).select("group_id, status, flagged");
      items = (amgItems ?? []).map((i: any) => ({ ...i, job_id: i.group_id }));
    }

    return list.map((j: any) => {
      const jobItems = items.filter((i: any) => i.job_id === j.id);
      return {
        ...j,
        sourcesCount: j.page_count ? 1 : 0,
        total: jobItems.length,
        pending: jobItems.filter((i: any) => i.status === "pending").length,
        approved: jobItems.filter((i: any) => i.status === "approved").length,
        rejected: jobItems.filter((i: any) => i.status === "rejected").length,
        needsReview: jobItems.filter((i: any) => i.status === "needs_review").length,
        imported: jobItems.filter((i: any) => i.status === "imported").length,
      };
    });
  });

export const amfCreateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().max(120).default("New Question Generation Job"),
      provider: z.enum(["google", "openai"]).default("google"),
      model: z.string().min(2).max(60).default("gemini-3.5-flash"),
      sourceMode: z.enum(["strict", "reasoning"]).default("strict"),
      styleMode: z.enum(["ai", "course", "pdf"]).default("ai"),
      styleCourseId: z.string().uuid().nullable().optional(),
      difficultyEasy: z.number().int().min(0).max(100).default(34),
      difficultyMedium: z.number().int().min(0).max(100).default(33),
      difficultyHard: z.number().int().min(0).max(100).default(33),
      typeStandard: z.number().int().min(0).max(100).default(50),
      typeCombined: z.number().int().min(0).max(100).default(50),
      aiDecidesType: z.boolean().default(false),
      totalQuestions: z.number().int().min(1).max(500).default(20),
      coverageMode: z.boolean().default(false),
      dupThreshold: z.number().int().min(10).max(100).default(87),
      includeImages: z.boolean().default(false),
      imageCount: z.number().int().min(0).max(100).default(0),
      imageFrequency: z.string().default("auto").optional(),
      apiMode: z.enum(["standard", "batch"]).default("standard").optional(),
      sourceFidelityEnabled: z.boolean().default(true),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const jobName = data.name.trim() || "Cell Injury — Pathophysiology Generation";

    // 1. Try amf_jobs
    try {
      const { data: row, error } = await supabase
        .from(JOBS)
        .insert({
          name: jobName,
          provider: data.provider,
          model: data.model,
          source_mode: data.sourceMode,
          style_mode: data.styleMode,
          style_course_id: data.styleCourseId ?? null,
          difficulty_easy: data.difficultyEasy,
          difficulty_medium: data.difficultyMedium,
          difficulty_hard: data.difficultyHard,
          type_standard: data.typeStandard,
          type_combined: data.typeCombined,
          ai_decides_type: data.aiDecidesType,
          total_questions: data.totalQuestions,
          coverage_mode: data.coverageMode,
          dup_threshold: data.dupThreshold,
          include_images: data.includeImages,
          image_count: data.imageCount,
          source_fidelity_enabled: data.sourceFidelityEnabled,
          status: "draft",
          created_by: userId,
        })
        .select("*")
        .maybeSingle();

      if (!error && row) return row;
    } catch {
      // fallback
    }

    // 2. Resilient fallback to amg_groups
    const metaPayload = {
      api_mode: data.apiMode || "standard",
      topics_optional: true,
      source_mode: data.sourceMode,
      style_mode: data.styleMode,
      style_course_id: data.styleCourseId ?? null,
      difficulty_easy: data.difficultyEasy,
      difficulty_medium: data.difficultyMedium,
      difficulty_hard: data.difficultyHard,
      type_standard: data.typeStandard,
      type_combined: data.typeCombined,
      ai_decides_type: data.aiDecidesType,
      total_questions: data.totalQuestions,
      coverage_mode: data.coverageMode,
      dup_threshold: data.dupThreshold,
      include_images: data.includeImages,
      image_frequency: data.imageFrequency || "auto",
      image_count: data.imageCount,
      source_fidelity_enabled: data.sourceFidelityEnabled,
      topics: [],
    };

    const { data: gRow, error: gErr } = await supabase
      .from(AMG_GROUPS)
      .insert({
        name: jobName,
        provider: data.provider,
        model: data.model,
        mode: "forge",
        instructions: JSON.stringify(metaPayload),
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();

    if (gErr) throw new Error(gErr.message);

    return {
      ...gRow,
      ...metaPayload,
    };
  });

export async function fetchJobData(supabase: any, jobId: string) {
  let job: any = null;
  let sources: any[] = [];
  let topics: any[] = [];
  let items: any[] = [];

  // 1. Check amf_jobs
  const { data: jRow } = await supabase.from(JOBS).select("*").eq("id", jobId).maybeSingle();
  if (jRow) {
    job = jRow;
    const [{ data: s }, { data: t }, { data: i }] = await Promise.all([
      supabase.from(SOURCES).select("*").eq("job_id", jobId).order("created_at"),
      supabase.from(TOPICS).select("*").eq("job_id", jobId).order("created_at"),
      supabase.from(ITEMS).select("*").eq("job_id", jobId),
    ]);
    sources = s ?? [];
    topics = t ?? [];
    items = i ?? [];
  } else {
    // 2. Check amg_groups fallback
    const { data: gRow } = await supabase.from(AMG_GROUPS).select("*").eq("id", jobId).maybeSingle();
    if (!gRow) throw new Error("This generation job no longer exists.");

    let meta: any = {};
    try {
      meta = JSON.parse(gRow.instructions || "{}");
    } catch {}

    job = {
      ...gRow,
      api_mode: meta.api_mode || "standard",
      topics_optional: meta.topics_optional ?? true,
      source_mode: meta.source_mode || "strict",
      style_mode: meta.style_mode || "ai",
      style_course_id: meta.style_course_id ?? null,
      difficulty_easy: meta.difficulty_easy ?? 34,
      difficulty_medium: meta.difficulty_medium ?? 33,
      difficulty_hard: meta.difficulty_hard ?? 33,
      type_standard: meta.type_standard ?? 50,
      type_combined: meta.type_combined ?? 50,
      ai_decides_type: meta.ai_decides_type ?? false,
      total_questions: meta.total_questions ?? 20,
      coverage_mode: meta.coverage_mode ?? false,
      dup_threshold: meta.dup_threshold ?? 87,
      include_images: meta.include_images ?? false,
      image_frequency: meta.image_frequency ?? "auto",
      image_count: meta.image_count ?? 0,
      source_fidelity_enabled: meta.source_fidelity_enabled ?? true,
    };

    topics = Array.isArray(meta.topics) ? meta.topics : [];

    const [{ data: sRows }, { data: iRows }] = await Promise.all([
      supabase.from(AMG_SOURCES).select("*").eq("group_id", jobId),
      supabase.from(AMG_ITEMS).select("*").eq("group_id", jobId).eq("archived", false),
    ]);

    sources = (sRows ?? []).map((s: any) => ({
      id: s.id,
      file_name: s.file_name,
      storage_path: s.storage_path,
      page_count: gRow.page_count || 1,
      created_at: s.created_at,
      extracted_text: s.extracted_text,
      chunks: s.chunks,
    }));

    items = (iRows ?? []).map((i: any) => {
      const exp = (i.explanation ?? {}) as any;
      return {
        ...i,
        job_id: i.group_id,
        explanation: typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? ""),
        validation_report: exp.validation_report ?? {},
        validation_passed: exp.validation_passed ?? true,
        difficulty: exp.difficulty ?? "medium",
        objective: exp.objective ?? "recall",
        source_fidelity: exp.source_fidelity ?? null,
        image_url: exp.image_url ?? null,
        has_image: !!exp.image_url,
        dup_score: exp.dup_score ?? 0,
        topic_name: exp.topic_name || "Cell Injury",
      };
    });
  }

  return {
    job,
    sources,
    topics,
    stats: {
      total: items.length,
      pending: items.filter((i: any) => i.status === "pending").length,
      approved: items.filter((i: any) => i.status === "approved").length,
      rejected: items.filter((i: any) => i.status === "rejected").length,
      needsReview: items.filter((i: any) => i.status === "needs_review").length,
      imported: items.filter((i: any) => i.status === "imported").length,
    },
    items,
  };
}

export const amfGetJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    return fetchJobData(supabase, data.jobId);
  });

export const amfUpdateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      patch: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);

    // Try amf_jobs
    const { data: row } = await supabase.from(JOBS).update(data.patch).eq("id", data.jobId).select("*").maybeSingle();
    if (row) return row;

    // Fallback to amg_groups
    const { data: gRow } = await supabase.from(AMG_GROUPS).select("*").eq("id", data.jobId).maybeSingle();
    if (gRow) {
      let meta: any = {};
      try {
        meta = JSON.parse(gRow.instructions || "{}");
      } catch {}
      const newMeta = { ...meta, ...data.patch };
      await supabase
        .from(AMG_GROUPS)
        .update({ instructions: JSON.stringify(newMeta), updated_at: new Date().toISOString() })
        .eq("id", data.jobId);
      return { ...gRow, ...newMeta };
    }

    return { ok: true };
  });

export const amfDeleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    await supabase.from(JOBS).delete().eq("id", data.jobId);
    await supabase.from(AMG_GROUPS).delete().eq("id", data.jobId);
    return { ok: true };
  });

// ================================================================ SOURCES ===

export const amfAddPdfSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      fileName: z.string().min(1).max(200),
      storagePath: z.string().min(1).max(500),
      pages: z.array(z.string().max(120000)).min(1).max(1000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const chunks: string[] = [];
    for (const page of data.pages) {
      const text = page.replace(/\s+\n/g, "\n").trim();
      for (let start = 0; start < text.length; start += 6000) {
        chunks.push(text.slice(start, start + 7000));
      }
    }
    const fullText = data.pages.join("\n\n").slice(0, 1_500_000);

    // Try amf_sources
    try {
      const { data: row, error } = await supabase
        .from(SOURCES)
        .insert({
          job_id: data.jobId,
          file_name: data.fileName,
          storage_path: data.storagePath,
          extracted_text: fullText,
          chunks,
          page_count: data.pages.length,
        })
        .select("id, file_name, page_count, created_at")
        .single();
      if (!error && row) return row;
    } catch {
      // fallback
    }

    // Fallback to amg_sources
    const { data: gRow, error: gErr } = await supabase
      .from(AMG_SOURCES)
      .insert({
        group_id: data.jobId,
        file_name: data.fileName,
        storage_path: data.storagePath,
        extracted_text: fullText,
        chunks,
        created_by: userId,
      })
      .select("id, file_name, created_at")
      .single();

    if (gErr) throw new Error(gErr.message);

    await supabase.from(AMG_GROUPS).update({ page_count: data.pages.length, source_name: data.fileName }).eq("id", data.jobId);
    return { ...gRow, page_count: data.pages.length };
  });

export const amfDeletePdfSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    await supabase.from(SOURCES).delete().eq("id", data.sourceId);
    await supabase.from(AMG_SOURCES).delete().eq("id", data.sourceId);
    return { ok: true };
  });

// ================================================================= TOPICS ===

export const amfDiscoverTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);

    // 1. Get job and sources without nested createServerFn
    const jobData = await fetchJobData(supabase, data.jobId);
    const job = jobData.job;
    const sources = jobData.sources;

    if (!sources?.length) throw new Error("No textbook PDF uploaded yet. Upload a source PDF first.");

    const sampleText = sources
      .map((s: any) => (Array.isArray(s.chunks) ? s.chunks.slice(0, 8).join("\n\n") : String(s.extracted_text || "").slice(0, 35000)))
      .join("\n\n")
      .slice(0, 40000);

    let rawTopics: any[] = [];

    // Try AI auto-discovery first
    try {
      const apiKey = await getKey(supabase, job.provider);
      const prompt = buildTopicDiscoveryPrompt(sampleText);
      const responseText =
        job.provider === "google"
          ? await callGoogleText(apiKey, job.model, "You extract medical topics from textbooks.", prompt)
          : await callOpenAiText(apiKey, job.model, "You extract medical topics from textbooks.", prompt);

      const json = parseJson(responseText);
      if (Array.isArray(json?.topics) && json.topics.length > 0) {
        rawTopics = json.topics;
      }
    } catch (aiErr: any) {
      console.warn("AI topic auto-detection encountered an error, falling back to structural extraction:", aiErr?.message || aiErr);
    }

    // 2. Deterministic structural fallback if AI failed or returned empty
    if (!rawTopics.length) {
      rawTopics = extractTopicsFromText(sampleText);
    }

    // 3. Document-level single topic fallback if no section headings detected
    if (!rawTopics.length) {
      rawTopics = [
        {
          name: job.name || "General Pathophysiology & Mechanisms",
          description: "Comprehensive coverage across all chapters of the uploaded textbook.",
          estimated_weight: 10,
        },
      ];
    }

    const rows = rawTopics.map((t: any, idx: number) => ({
      id: crypto.randomUUID(),
      job_id: data.jobId,
      name: String(t.name || `Topic ${idx + 1}`).trim(),
      description: String(t.description || "").trim(),
      min_questions: 1,
      max_questions: Math.max(2, Number(t.estimated_weight || 5)),
      target_questions: Math.max(1, Math.min(10, Math.round(Number(t.estimated_weight || 5) / 2))),
      enabled: true,
      facts: [],
    }));

    // Try amf_topics
    try {
      await supabase.from(TOPICS).delete().eq("job_id", data.jobId);
      const { data: inserted, error } = await supabase.from(TOPICS).insert(rows).select("*");
      if (!error && inserted) return inserted;
    } catch {
      // fallback
    }

    // Fallback: save topics in amg_groups instructions
    const { data: gRow } = await supabase.from(AMG_GROUPS).select("instructions").eq("id", data.jobId).maybeSingle();
    let meta: any = {};
    try {
      meta = JSON.parse(gRow?.instructions || "{}");
    } catch {}
    meta.topics = rows;
    await supabase.from(AMG_GROUPS).update({ instructions: JSON.stringify(meta) }).eq("id", data.jobId);

    return rows;
  });

export const amfUpdateTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);

    // Try amf_topics
    const { data: row } = await supabase.from(TOPICS).update(data.patch).eq("id", data.topicId).select("*").maybeSingle();
    if (row) return row;

    return { ok: true };
  });

// ============================================================== GENERATION ==

function selectWeightedDifficulty(easyPct: number, medPct: number, hardPct: number): "easy" | "medium" | "hard" {
  const rand = Math.random() * 100;
  if (rand < easyPct) return "easy";
  if (rand < easyPct + medPct) return "medium";
  return "hard";
}

function selectQuestionForm(stdPct: number, combPct: number, aiDecides: boolean): "A" | "B" {
  if (aiDecides) return Math.random() < 0.6 ? "A" : "B";
  const total = (stdPct || 50) + (combPct || 50);
  const normalizedStd = ((stdPct || 50) / total) * 100;
  return Math.random() * 100 < normalizedStd ? "A" : "B";
}

function selectRandomObjective(): string {
  const idx = Math.floor(Math.random() * QUESTION_OBJECTIVES.length);
  return QUESTION_OBJECTIVES[idx].id;
}

export const amfGenerateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      batchSize: z.number().int().min(1).max(5).default(2),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const jobData = await fetchJobData(supabase, data.jobId);
    const job = jobData.job;
    const sources = jobData.sources;

    if (!sources?.length) throw new Error("No source PDFs found. Upload a textbook PDF first.");

    // Topics are 100% OPTIONAL: author across the full document if none configured
    let activeTopics = (jobData.topics ?? []).filter((t: any) => t.enabled !== false);
    if (!activeTopics.length) {
      activeTopics = [
        {
          id: "full-doc",
          name: job.name || "Textbook Core Concepts",
          description: "Full textbook single-topic generation",
          enabled: true,
        },
      ];
    }

    const apiKey = await getKey(supabase, job.provider);

    // Existing items
    let existingItems: any[] = [];
    const { data: amfItems } = await supabase.from(ITEMS).select("stem, topic_id").eq("job_id", data.jobId);
    if (amfItems) {
      existingItems = amfItems;
    } else {
      const { data: amgItems } = await supabase.from(AMG_ITEMS).select("stem").eq("group_id", data.jobId);
      existingItems = amgItems ?? [];
    }

    const existingStems = existingItems.map((i: any) => String(i.stem ?? ""));

    let generatedCount = 0;
    const failures: string[] = [];
    const authoredItems: any[] = [];

    const allChunks = sources.flatMap((s: any) => (Array.isArray(s.chunks) ? s.chunks : []));
    if (!allChunks.length) {
      allChunks.push(String(sources[0]?.extracted_text || "").slice(0, 30000));
    }

    for (let step = 0; step < data.batchSize; step++) {
      const selectedTopic = activeTopics[step % activeTopics.length];

      // Relevant text chunk for this topic or sequential chunk across the whole book
      const topicKeywords = selectedTopic.name.toLowerCase().split(" ").filter((w: string) => w.length > 3);
      const matchingChunks = allChunks.filter((chunk: string) =>
        topicKeywords.some((kw: string) => chunk.toLowerCase().includes(kw)),
      );
      const chunkIdx = (existingStems.length + step) % Math.max(1, allChunks.length);
      const textToUse = (matchingChunks.length ? matchingChunks.slice(0, 3) : [allChunks[chunkIdx] || allChunks[0]])
        .join("\n\n")
        .slice(0, 24000);

      // Determine parameters for this question
      const difficulty = selectWeightedDifficulty(job.difficulty_easy, job.difficulty_medium, job.difficulty_hard);
      const form = selectQuestionForm(job.type_standard, job.type_combined, job.ai_decides_type);
      const objective = selectRandomObjective();

      // Check whether this question should have a pure AI medical diagram
      const shouldIncludeImage =
        job.include_images &&
        (job.image_frequency === "every" ||
          (job.image_frequency === "half" && (step + existingStems.length) % 2 === 0) ||
          (step + existingStems.length) % 3 === 0);

      // Build generation prompt
      const systemPrompt = buildGenerationSystemPrompt({
        sourceMode: job.source_mode,
        form,
        difficulty,
        objective,
        styleContext: job.style_sample_text,
        includeImage: shouldIncludeImage,
      });

      const userPrompt = `TOPIC: ${selectedTopic.name}
SOURCE MATERIAL EXCERPT:
${textToUse}

Author ONE pristine ${difficulty.toUpperCase()} difficulty ${form === "B" ? "Combined" : "Standard"} medical MCQ based on this source text.${shouldIncludeImage ? " IMPORTANT: Include an image_prompt describing a clean educational medical schematic/diagram for this question." : ""} Return STRICT JSON.`;

      try {
        let questionJson: any = null;
        let validationReport: any = null;
        let validationPassed = false;
        let attempts = 0;

        // Validation & regeneration loop (max 3 attempts)
        while (attempts < 3 && !validationPassed) {
          attempts++;
          const genText =
            job.provider === "google"
              ? await callGoogleText(apiKey, job.model, systemPrompt, userPrompt)
              : await callOpenAiText(apiKey, job.model, systemPrompt, userPrompt);

          questionJson = parseJson(genText);

          // 7-Point Validator
          const validatorPrompt = buildValidatorSystemPrompt(job.source_mode === "strict");
          const valInput = `QUESTION TO VALIDATE:\n${JSON.stringify(questionJson, null, 2)}\n\nSOURCE EXCERPT:\n${textToUse}`;

          const valText =
            job.provider === "google"
              ? await callGoogleText(apiKey, job.model, validatorPrompt, valInput)
              : await callOpenAiText(apiKey, job.model, validatorPrompt, valInput);

          validationReport = parseJson(valText);
          validationPassed = validationReport?.pass === true;
        }

        // Deduplication check
        const stemFormatted = formatQuestionStem(String(questionJson.stem ?? ""));
        const { maxScore } = checkDuplicate(stemFormatted, existingStems);

        if (maxScore >= job.dup_threshold) {
          failures.push(`Generated question rejected: ${maxScore}% similar to existing question.`);
          continue;
        }

        // Pure AI image generation if needed (Flux / SDXL pure synthetic diagram)
        let imageUrl: string | null = null;
        if (shouldIncludeImage || (questionJson.image_needed && questionJson.image_prompt)) {
          const diagramPrompt = questionJson.image_prompt || `${selectedTopic.name} medical pathophysiological diagram`;
          try {
            imageUrl = await generateMedicalDiagram(supabase, job.provider, apiKey, diagramPrompt, job.id);
          } catch (imgErr) {
            console.warn("Medical diagram generation error:", imgErr);
          }
        }

        // Build structured explanation markdown
        const explanationData: ExplanationData = questionJson.explanation ?? {};
        const displayItems =
          form === "B"
            ? (Array.isArray(questionJson.statements) ? questionJson.statements : []).map((s: any) => ({
                label: String(s.n),
                text: String(s.text),
              }))
            : (Array.isArray(questionJson.options) ? questionJson.options : []).map((o: any) => ({
                label: String(o.label),
                text: String(o.text),
              }));

        const explanationMarkdown = buildForgeExplanation(
          form,
          explanationData,
          displayItems,
          Array.isArray(questionJson.answer_labels) ? questionJson.answer_labels : [],
          job.source_fidelity_enabled ? questionJson.source_fidelity : null,
        );

        const nextOrder = existingStems.length + 1;
        const initialStatus = validationPassed ? "pending" : "needs_review";

        // Try insert into amf_items
        let stored = false;
        try {
          const { error: amfErr } = await supabase.from(ITEMS).insert({
            job_id: job.id,
            topic_id: selectedTopic.id,
            topic_name: selectedTopic.name,
            form,
            stem: stemFormatted,
            statements: Array.isArray(questionJson.statements) ? questionJson.statements : [],
            options: Array.isArray(questionJson.options) ? questionJson.options : [],
            answer_labels: Array.isArray(questionJson.answer_labels) ? questionJson.answer_labels : [],
            answer_mode: form === "B" ? "single" : "single",
            difficulty,
            objective,
            explanation: explanationMarkdown,
            raw_explanation: explanationData,
            source_fidelity: questionJson.source_fidelity ?? null,
            image_url: imageUrl,
            image_prompt: questionJson.image_prompt ?? null,
            has_image: !!imageUrl,
            dup_hash: dupHash(stemFormatted),
            dup_score: maxScore,
            validation_report: validationReport ?? {},
            validation_attempts: attempts,
            validation_passed: validationPassed,
            status: initialStatus,
            flagged: !validationPassed,
            flag_reason: validationPassed ? "" : (validationReport?.failures ?? []).join("; ").slice(0, 300),
            order_index: nextOrder,
          });
          if (!amfErr) stored = true;
        } catch {
          // fallback
        }

        // Fallback to amg_items
        if (!stored) {
          const itemPayload = {
            group_id: job.id,
            page_no: 1,
            order_index: nextOrder,
            form,
            number_label: String(nextOrder),
            stem: stemFormatted,
            statements: Array.isArray(questionJson.statements) ? questionJson.statements : [],
            options: Array.isArray(questionJson.options) ? questionJson.options : [],
            answer_labels: Array.isArray(questionJson.answer_labels) ? questionJson.answer_labels : [],
            answer_mode: "single",
            status: initialStatus,
            flagged: !validationPassed,
            flag_reason: validationPassed ? "" : (validationReport?.failures ?? []).join("; ").slice(0, 300),
            dup_hash: dupHash(stemFormatted),
            explanation: {
              explanation: explanationMarkdown,
              validation_report: validationReport ?? {},
              validation_passed: validationPassed,
              difficulty,
              objective,
              source_fidelity: questionJson.source_fidelity ?? null,
              image_url: imageUrl,
              dup_score: maxScore,
              topic_name: selectedTopic.name,
            },
          };
          const { error: gErr } = await supabase.from(AMG_ITEMS).insert(itemPayload);
          if (gErr) throw new Error(gErr.message);
        }

        existingStems.push(stemFormatted);
        generatedCount++;
        authoredItems.push({
          order: nextOrder,
          stem: stemFormatted.slice(0, 100),
          form,
          difficulty,
          imageUrl,
          hasImage: !!imageUrl,
          topicName: selectedTopic.name,
        });
      } catch (err: any) {
        failures.push(`Generation attempt error: ${String(err?.message ?? err).slice(0, 160)}`);
      }
    }

    return { generatedCount, failures, totalItems: existingStems.length, newItems: authoredItems };
  });

// ================================================================= REVIEW ===

export const amfListItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      statusFilter: z.enum(["all", "pending", "approved", "rejected", "needs_review"]).default("all"),
      topicId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);

    // Try amf_items
    try {
      let q = supabase.from(ITEMS).select("*").eq("job_id", data.jobId).eq("archived", false).order("order_index");
      if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);
      if (data.topicId) q = q.eq("topic_id", data.topicId);
      const { data: rows, error } = await q;
      if (!error && rows) return rows;
    } catch {
      // fallback
    }

    // Fallback: amg_items
    let q = supabase.from(AMG_ITEMS).select("*").eq("group_id", data.jobId).eq("archived", false).order("order_index");
    if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);
    const { data: gRows, error: gErr } = await q;
    if (gErr) throw new Error(gErr.message);

    return (gRows ?? []).map((i: any) => {
      const exp = (i.explanation ?? {}) as any;
      return {
        ...i,
        job_id: i.group_id,
        explanation: typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? ""),
        validation_report: exp.validation_report ?? {},
        validation_passed: exp.validation_passed ?? true,
        difficulty: exp.difficulty ?? "medium",
        objective: exp.objective ?? "recall",
        source_fidelity: exp.source_fidelity ?? null,
        image_url: exp.image_url ?? null,
        has_image: !!exp.image_url,
        dup_score: exp.dup_score ?? 0,
        topic_name: exp.topic_name || "Cell Injury",
      };
    });
  });

export const amfUpdateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);

    // Try amf_items
    const { data: row } = await supabase.from(ITEMS).update(data.patch).eq("id", data.itemId).select("*").maybeSingle();
    if (row) return row;

    // Fallback: amg_items
    const { data: gItem } = await supabase.from(AMG_ITEMS).select("*").eq("id", data.itemId).maybeSingle();
    if (gItem) {
      const exp = (gItem.explanation ?? {}) as any;
      if (data.patch.explanation) exp.explanation = data.patch.explanation;
      const amgPatch: any = {
        updated_at: new Date().toISOString(),
      };
      if (data.patch.stem) amgPatch.stem = data.patch.stem;
      if (data.patch.status) amgPatch.status = data.patch.status;
      if (data.patch.explanation) amgPatch.explanation = exp;
      await supabase.from(AMG_ITEMS).update(amgPatch).eq("id", data.itemId);
      return { ...gItem, ...data.patch };
    }

    return { ok: true };
  });

export const amfSetItemsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      itemIds: z.array(z.string().uuid()).min(1).max(500),
      status: z.enum(["pending", "approved", "rejected"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    await supabase.from(ITEMS).update({ status: data.status, updated_at: new Date().toISOString() }).in("id", data.itemIds);
    await supabase.from(AMG_ITEMS).update({ status: data.status, updated_at: new Date().toISOString() }).in("id", data.itemIds);
    return { ok: true, count: data.itemIds.length };
  });

// ================================================================= IMPORT ===

export const amfImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      subjectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);

    let approvedItems: any[] = [];
    const { data: amfApproved } = await supabase
      .from(ITEMS)
      .select("*")
      .eq("job_id", data.jobId)
      .eq("archived", false)
      .eq("status", "approved")
      .order("order_index");

    if (amfApproved?.length) {
      approvedItems = amfApproved;
    } else {
      const { data: amgApproved } = await supabase
        .from(AMG_ITEMS)
        .select("*")
        .eq("group_id", data.jobId)
        .eq("archived", false)
        .eq("status", "approved")
        .order("order_index");

      approvedItems = (amgApproved ?? []).map((i: any) => {
        const exp = (i.explanation ?? {}) as any;
        return {
          ...i,
          explanation: typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? ""),
        };
      });
    }

    if (!approvedItems.length) {
      throw new Error("No approved questions to import. Please review and approve questions first.");
    }

    const { count } = await supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", data.subjectId);
    let sort = (count ?? 0) + 1;

    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of approvedItems) {
      try {
        const questionPayload = {
          subject_id: data.subjectId,
          stem: item.stem,
          explanation: item.explanation || null,
          answer_mode: item.answer_mode ?? "single",
          sort_order: sort,
        };

        const { data: q, error: qErr } = await supabase
          .from("questions")
          .upsert(questionPayload, { onConflict: "subject_id,stem_hash", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();

        if (qErr) throw new Error(qErr.message);
        if (!q?.id) {
          skipped++;
          continue;
        }

        const correct = (item.answer_labels ?? []).map((l: string) => String(l).trim().toUpperCase());
        const rows = (Array.isArray(item.options) ? item.options : []).map((o: any, idx: number) => ({
          question_id: q.id,
          label: o.label || String.fromCharCode(65 + idx),
          text: o.text ?? "",
          is_correct: correct.includes(String(o.label).toUpperCase()),
          sort_order: idx + 1,
        }));

        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw new Error(oErr.message);

        await supabase.from(ITEMS).update({ status: "imported" }).eq("id", item.id);
        await supabase.from(AMG_ITEMS).update({ status: "imported" }).eq("id", item.id);

        inserted++;
        sort++;
      } catch (err: any) {
        failed++;
        errors.push(String(err?.message ?? err).slice(0, 160));
      }
    }

    return { inserted, skipped, failed, errors: errors.slice(0, 5) };
  });
