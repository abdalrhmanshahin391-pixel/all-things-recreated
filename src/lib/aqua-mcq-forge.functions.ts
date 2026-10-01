import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { formatQuestionStem, cleanQuestionPreamble, buildCombinedStem, ensureCombinedStemWithStatements } from "@/lib/question-format";
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
  stripSourceCitation,
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
    return [
      "gemini-2.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
      "gemini-2.5-flash",
    ];
  }
  if (m.includes("pro")) {
    return [
      "gemini-2.5-pro",
      "gemini-1.5-pro-latest",
      "gemini-1.5-pro",
      "gemini-2.5-flash",
    ];
  }
  // Standard Flash models: gemini-3.5-flash, gemini-2.5-flash, gemini-flash
  return [
    "gemini-2.5-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
  ];
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
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
      const errMsg = json?.error?.message || JSON.stringify(json);
      console.warn(`[Google AI] Model ${model} returned ${res.status}: ${errMsg.slice(0, 150)}`);
      lastError = new Error(`Google API (${requestedModel} [endpoint: ${model}], status ${res.status}): ${errMsg.slice(0, 250)}`);

      // If 404 or 400 (model not found/invalid), try next candidate
      if (res.status === 404 || res.status === 400) continue;

      // For quota or auth issues (429, 403, 401), stop immediately
      break;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error(`Failed to call Google AI Studio API for ${requestedModel}`);
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

import { searchRealMedicalImage } from "@/lib/wikimedia-images";

/**
 * Real Medical Image Retrieval helper:
 * Extracts specific medical findings from text chunks for high-relevance search.
 */
export function extractSpecificPathologyEntity(text: string, topicName: string): string {
  const cleanTopic = topicName.replace(/\b(introduction|overview|chapter|review|general|part \d+)\b/gi, "").trim();
  const highYieldEntities = [
    "coagulative necrosis",
    "liquefactive necrosis",
    "caseous necrosis",
    "fat necrosis",
    "fibrinoid necrosis",
    "gangrenous necrosis",
    "karyorrhexis",
    "karyolysis",
    "pyknosis",
    "cellular swelling",
    "hydropic change",
    "steatosis",
    "fatty change",
    "fatty liver",
    "apoptosis",
    "autophagy",
    "calcification",
    "amyloid",
    "lipofuscin",
    "hemosiderin",
    "hypertrophy",
    "hyperplasia",
    "metaplasia",
    "dysplasia",
    "atrophy",
    "infarction",
    "granuloma",
    "thrombosis",
    "embolism",
    "atherosclerosis",
    "inflammation",
    "fibrosis",
  ];
  for (const entity of highYieldEntities) {
    if (new RegExp(`\\b${entity}\\b`, "i").test(text)) {
      return `${entity} ${cleanTopic || ""}`.trim();
    }
  }
  return cleanTopic || topicName;
}

/**
 * Searches Wikimedia Commons for authentic, high-resolution medical histology,
 * pathology specimens, electron micrographs, and anatomical schematics.
 * Completely replaces synthetic AI blobs with genuine scientific medical literature imagery.
 */
export async function generateMedicalDiagram(
  supabase: any,
  provider: string,
  apiKey: string,
  prompt: string,
  jobId: string,
  excludeUrls: string[] = [],
  options?: { targetAnswer?: string; isEasy?: boolean },
): Promise<string> {
  // 1. Search authentic medical literature on Wikimedia Commons with specific clinical prompt
  try {
    const realImg = await searchRealMedicalImage(prompt, excludeUrls, 0, options);
    if (realImg?.url) {
      return realImg.url;
    }
  } catch (e) {
    console.warn("[generateMedicalDiagram] Wikimedia search error:", e);
  }

  // 2. Broaden search to core medical histology / pathology keywords
  try {
    const cleanTokens = prompt
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(" ")
      .filter((w) => w.length > 3 && !/micrograph|histology|pathology|specimen|biopsy/i.test(w))
      .slice(0, 3)
      .join(" ");
    if (cleanTokens) {
      const broaderImg = await searchRealMedicalImage(`${cleanTokens} pathology histology H&E`, excludeUrls, 0, options);
      if (broaderImg?.url) {
        return broaderImg.url;
      }
    }
  } catch (e) {
    console.warn("[generateMedicalDiagram] Broader medical search error:", e);
  }

  // 3. High-res real scientific diagram fallback from open medical literature
  const fallback = await searchRealMedicalImage("cellular pathology tissue histology specimen H&E", excludeUrls, 0, options);
  return fallback?.url || "https://upload.wikimedia.org/wikipedia/commons/4/48/Biological_cell.svg";
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
          ...meta,
          api_mode: meta.api_mode || "standard",
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
          image_target_count: meta.image_target_count ?? meta.image_count ?? 0,
          external_questions_count: meta.external_questions_count ?? 0,
          source_fidelity_enabled: meta.source_fidelity_enabled ?? true,
          objective_ratios: meta.objective_ratios ?? {},
          strict_questions_count: typeof meta.strict_questions_count === "number"
            ? meta.strict_questions_count
            : (meta.source_mode === "reasoning" ? 0 : (meta.total_questions ?? 20)),
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
      externalQuestionsCount: z.number().int().min(0).max(500).default(0).optional(),
      strictQuestionsCount: z.number().int().min(0).max(500).optional(),
      apiMode: z.enum(["standard", "batch"]).default("standard").optional(),
      sourceFidelityEnabled: z.boolean().default(true),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const jobName = data.name.trim() || "Cell Injury — Pathophysiology Generation";
    const strictCount = typeof data.strictQuestionsCount === "number"
      ? data.strictQuestionsCount
      : (data.sourceMode === "reasoning" ? 0 : data.totalQuestions);

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
          image_target_count: data.imageCount,
          external_questions_count: data.externalQuestionsCount || 0,
          strict_questions_count: strictCount,
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
      image_target_count: data.imageCount,
      external_questions_count: data.externalQuestionsCount || 0,
      strict_questions_count: strictCount,
      source_fidelity_enabled: data.sourceFidelityEnabled,
      objective_ratios: {},
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
    job = {
      ...jRow,
      api_mode: jRow.api_mode || "standard",
      topics_optional: jRow.topics_optional ?? true,
      source_mode: jRow.source_mode || "strict",
      style_mode: jRow.style_mode || "ai",
      style_course_id: jRow.style_course_id ?? null,
      difficulty_easy: jRow.difficulty_easy ?? 34,
      difficulty_medium: jRow.difficulty_medium ?? 33,
      difficulty_hard: jRow.difficulty_hard ?? 33,
      type_standard: jRow.type_standard ?? 50,
      type_combined: jRow.type_combined ?? 50,
      ai_decides_type: jRow.ai_decides_type ?? false,
      total_questions: jRow.total_questions ?? 20,
      coverage_mode: jRow.coverage_mode ?? false,
      dup_threshold: jRow.dup_threshold ?? 87,
      include_images: jRow.include_images ?? false,
      image_frequency: jRow.image_frequency ?? "auto",
      image_count: jRow.image_count ?? 0,
      image_target_count: jRow.image_target_count ?? jRow.image_count ?? 0,
      external_questions_count: jRow.external_questions_count ?? 0,
      source_fidelity_enabled: jRow.source_fidelity_enabled ?? true,
      objective_ratios: jRow.objective_ratios ?? {},
      strict_questions_count: typeof jRow.strict_questions_count === "number"
        ? jRow.strict_questions_count
        : (jRow.source_mode === "reasoning" ? 0 : (jRow.total_questions ?? 20)),
    };
    const [{ data: s }, { data: t }, { data: i }] = await Promise.all([
      supabase.from(SOURCES).select("*").eq("job_id", jobId).order("created_at"),
      supabase.from(TOPICS).select("*").eq("job_id", jobId).order("created_at"),
      supabase.from(ITEMS).select("*").eq("job_id", jobId),
    ]);
    sources = s ?? [];
    topics = t ?? [];
    items = (i ?? []).map((item: any) => {
      const cleanStem = formatQuestionStem(item.stem);
      const cleanExp = stripSourceCitation(item.explanation);
      if (cleanStem !== item.stem || cleanExp !== item.explanation) {
        supabase.from(ITEMS).update({ stem: cleanStem, explanation: cleanExp }).eq("id", item.id).then?.(() => {});
      }
      return {
        ...item,
        stem: cleanStem,
        explanation: cleanExp,
      };
    });
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
      ...meta,
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
      image_target_count: meta.image_target_count ?? meta.image_count ?? 0,
      external_questions_count: meta.external_questions_count ?? 0,
      source_fidelity_enabled: meta.source_fidelity_enabled ?? true,
      objective_ratios: meta.objective_ratios ?? {},
      strict_questions_count: typeof meta.strict_questions_count === "number"
        ? meta.strict_questions_count
        : (meta.source_mode === "reasoning" ? 0 : (meta.total_questions ?? 20)),
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
      const rawExp = typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? "");
      const cleanStem = formatQuestionStem(i.stem);
      const cleanExp = stripSourceCitation(rawExp);
      if (cleanStem !== i.stem) {
        supabase.from(AMG_ITEMS).update({ stem: cleanStem }).eq("id", i.id).then?.(() => {});
      }
      return {
        ...i,
        job_id: i.group_id,
        stem: cleanStem,
        explanation: cleanExp,
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

    // 1. Try amf_jobs with known columns only to avoid PostgreSQL column errors
    const amfJobColumns = [
      "name", "provider", "model", "source_mode", "style_mode", "style_course_id",
      "style_sample_text", "difficulty_easy", "difficulty_medium", "difficulty_hard",
      "type_standard", "type_combined", "ai_decides_type", "total_questions",
      "coverage_mode", "dup_threshold", "include_images", "image_count",
      "source_fidelity_enabled", "status", "error"
    ];
    const amfPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (amfJobColumns.includes(k)) amfPatch[k] = v;
    }
    if (Object.keys(amfPatch).length > 0) {
      try {
        await supabase.from(JOBS).update(amfPatch).eq("id", data.jobId);
      } catch {}
    }

    // 2. Always persist full metadata in amg_groups instructions
    const { data: gRow } = await supabase.from(AMG_GROUPS).select("*").eq("id", data.jobId).maybeSingle();
    if (gRow) {
      let meta: any = {};
      try {
        meta = JSON.parse(gRow.instructions || "{}");
      } catch {}
      const newMeta = { ...meta, ...data.patch };
      const directUpdates: Record<string, any> = {
        instructions: JSON.stringify(newMeta),
        updated_at: new Date().toISOString(),
      };
      if (typeof data.patch.name === "string") directUpdates.name = data.patch.name;
      if (typeof data.patch.status === "string") directUpdates.status = data.patch.status;

      const { data: updatedGRow } = await supabase
        .from(AMG_GROUPS)
        .update(directUpdates)
        .eq("id", data.jobId)
        .select("*")
        .maybeSingle();

      return {
        ...(updatedGRow || gRow),
        ...newMeta,
      };
    }

    return { ok: true, ...data.patch };
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

    const sampleChunks: string[] = [];
    for (const s of sources) {
      if (Array.isArray(s.chunks) && s.chunks.length > 0) {
        const total = s.chunks.length;
        if (total <= 12) {
          sampleChunks.push(...s.chunks);
        } else {
          // Sample evenly across the entire document (beginning, middle, and end)
          const step = Math.max(1, Math.floor(total / 12));
          for (let i = 0; i < total && sampleChunks.length < 16; i += step) {
            sampleChunks.push(s.chunks[i]);
          }
        }
      } else {
        sampleChunks.push(String(s.extracted_text || "").slice(0, 45000));
      }
    }
    const sampleText = sampleChunks.join("\n\n").slice(0, 60000);

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

function selectQuotaDifficulty(
  easyPct: number,
  medPct: number,
  hardPct: number,
  existingDifficulties: string[],
  totalQuestions: number = 20,
): "easy" | "medium" | "hard" {
  const tot = (easyPct || 0) + (medPct || 0) + (hardPct || 0) || 100;
  const targetEasy = Math.round(((easyPct || 0) / tot) * totalQuestions);
  const targetMed = Math.round(((medPct || 0) / tot) * totalQuestions);
  const targetHard = Math.max(0, totalQuestions - targetEasy - targetMed);

  const countEasy = existingDifficulties.filter((d) => d === "easy").length;
  const countMed = existingDifficulties.filter((d) => d === "medium").length;
  const countHard = existingDifficulties.filter((d) => d === "hard").length;

  const deficitEasy = targetEasy - countEasy;
  const deficitMed = targetMed - countMed;
  const deficitHard = targetHard - countHard;

  if (deficitEasy >= deficitMed && deficitEasy >= deficitHard && deficitEasy > 0) return "easy";
  if (deficitMed >= deficitEasy && deficitMed >= deficitHard && deficitMed > 0) return "medium";
  if (deficitHard > 0) return "hard";

  // If quotas satisfied, use proportional selection
  const rand = Math.random() * tot;
  if (rand < (easyPct || 0)) return "easy";
  if (rand < (easyPct || 0) + (medPct || 0)) return "medium";
  return "hard";
}

function selectQuotaForm(
  stdPct: number,
  combPct: number,
  aiDecides: boolean,
  existingForms: string[],
  totalQuestions: number = 20,
): "A" | "B" {
  if (aiDecides) return Math.random() < 0.6 ? "A" : "B";
  const tot = (stdPct || 50) + (combPct || 50);
  const targetA = Math.round(((stdPct || 50) / tot) * totalQuestions);
  const targetB = Math.max(0, totalQuestions - targetA);

  const countA = existingForms.filter((f) => f === "A").length;
  const countB = existingForms.filter((f) => f === "B").length;

  const deficitA = targetA - countA;
  const deficitB = targetB - countB;

  if (deficitA > deficitB && deficitA > 0) return "A";
  if (deficitB > 0) return "B";

  const normalizedStd = ((stdPct || 50) / tot) * 100;
  return Math.random() * 100 < normalizedStd ? "A" : "B";
}

/**
 * Selects a question objective based on the job's configured ratios and quotas.
 * Enforces strict tracking so that user configured quotas (e.g. 3 recall, 3 tricky/cognitive trap)
 * are definitively authored.
 */
function selectQuotaObjective(
  ratios: Record<string, number> | null | undefined,
  existingObjectives: string[],
  totalQuestions: number = 20,
): string {
  const allObjectiveIds = QUESTION_OBJECTIVES.map((o) => o.id);

  // If no ratios configured, fall back to balanced rotation
  if (!ratios || Object.keys(ratios).length === 0) {
    return allObjectiveIds[existingObjectives.length % allObjectiveIds.length];
  }

  // Filter positive entries
  const positiveEntries = Object.entries(ratios).filter(([_, v]) => Number(v) > 0);
  if (positiveEntries.length === 0) {
    return allObjectiveIds[existingObjectives.length % allObjectiveIds.length];
  }

  const totalWeight = positiveEntries.reduce((a, [_, v]) => a + Number(v), 0);

  // Count existing objectives
  const counts: Record<string, number> = {};
  for (const obj of existingObjectives) {
    counts[obj] = (counts[obj] ?? 0) + 1;
  }

  // Calculate target question counts for each objective based on job's total questions
  let bestObjective: string = positiveEntries[0][0];
  let bestDeficit = -Infinity;

  for (const [obj, weight] of positiveEntries) {
    const targetCount = Math.max(1, Math.round((Number(weight) / totalWeight) * totalQuestions));
    const currentCount = counts[obj] ?? 0;
    const deficit = targetCount - currentCount;

    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestObjective = obj;
    }
  }

  return bestObjective;
}

/**
 * Robust helper to fetch and normalize all existing items for a job,
 * safely handling both amf_items and amg_items schemas.
 */
export async function getJobExistingItems(supabase: any, jobId: string): Promise<any[]> {
  // 1. Try amf_items
  try {
    const { data: amfItems, error } = await supabase
      .from(ITEMS)
      .select("id, stem, form, options, answer_labels, objective, difficulty, explanation, raw_explanation, source_fidelity, has_image, image_url, order_index")
      .eq("job_id", jobId)
      .eq("archived", false)
      .order("order_index");
    if (!error && amfItems) {
      return amfItems.map((i: any) => ({
        ...i,
        job_id: jobId,
        stem: formatQuestionStem(i.stem),
        has_image: Boolean(i.has_image || i.image_url),
        source_origin: i.source_fidelity?.origin || "textbook_pdf",
      }));
    }
  } catch {}

  // 2. Fallback to amg_items (only query columns that actually exist!)
  try {
    const { data: gItems, error } = await supabase
      .from(AMG_ITEMS)
      .select("id, stem, form, number_label, options, answer_labels, explanation, order_index")
      .eq("group_id", jobId)
      .order("order_index");

    if (!error && gItems) {
      return gItems.map((i: any) => {
        let exp: any = {};
        if (i.explanation && typeof i.explanation === "object") {
          exp = i.explanation;
        } else if (typeof i.explanation === "string") {
          try {
            exp = JSON.parse(i.explanation);
          } catch {
            exp = { explanation: i.explanation };
          }
        }

        const imgUrl = exp.image_url ?? null;
        const srcFid = exp.source_fidelity ?? null;
        const origin = srcFid?.origin || "textbook_pdf";

        return {
          id: i.id,
          job_id: jobId,
          stem: formatQuestionStem(i.stem),
          form: i.form || "A",
          options: Array.isArray(i.options) ? i.options : [],
          answer_labels: Array.isArray(i.answer_labels) ? i.answer_labels : [],
          objective: exp.objective || "recall",
          difficulty: exp.difficulty || "medium",
          explanation: exp.explanation || "",
          raw_explanation: exp,
          source_fidelity: srcFid,
          source_origin: origin,
          image_url: imgUrl,
          has_image: Boolean(imgUrl),
          order_index: i.order_index || 0,
        };
      });
    }
  } catch (err) {
    console.warn("[getJobExistingItems] Error querying amg_items:", err);
  }

  return [];
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

    // Existing items — collect objectives, stems and answers for quota & anti-repetition tracking
    const existingItems = await getJobExistingItems(supabase, data.jobId);

    const existingStems = existingItems.map((i: any) => String(i.stem ?? ""));
    const existingAnswers: string[] = [];
    for (const it of existingItems) {
      if (Array.isArray(it.options) && Array.isArray(it.answer_labels)) {
        for (const opt of it.options) {
          const optText = opt?.body || opt?.text || "";
          if (it.answer_labels.includes(opt.label) && optText.trim()) {
            existingAnswers.push(optText.trim());
          }
        }
      }
    }

    // Count existing external questions already in database
    const existingExternalCount = existingItems.filter(
      (i: any) =>
        i.source_origin === "external_literature" ||
        (typeof i.source_fidelity === "string" && /usmle|uworld|robbins|external|board/i.test(i.source_fidelity)) ||
        (typeof i.source_fidelity?.source === "string" && /usmle|uworld|robbins|external|board/i.test(i.source_fidelity.source)),
    ).length;

    // Track parameters of existing questions for quota-based selection
    const existingObjectives: string[] = existingItems.map((i: any) => String(i.objective ?? "")).filter(Boolean);
    const existingDifficulties: string[] = existingItems.map((i: any) => String(i.difficulty ?? "")).filter(Boolean);
    const existingForms: string[] = existingItems.map((i: any) => String(i.form ?? "A")).filter(Boolean);
    const existingImageCount = existingItems.filter((i: any) => i.has_image || Boolean(i.image_url)).length;

    // Collect all previously assigned image URLs to prevent ANY duplicate images across the course
    const usedImageUrls: string[] = existingItems
      .map((i: any) => i.image_url)
      .filter((u: any): u is string => typeof u === "string" && u.trim().length > 0);

    let generatedCount = 0;
    const failures: string[] = [];
    const authoredItems: any[] = [];

    const allChunks = sources.flatMap((s: any) => (Array.isArray(s.chunks) ? s.chunks : []));
    if (!allChunks.length) {
      allChunks.push(String(sources[0]?.extracted_text || "").slice(0, 30000));
    }

    const totalQuestionsTarget = Number(job.total_questions ?? 20);

    for (let step = 0; step < data.batchSize; step++) {
      const selectedTopic = activeTopics[step % activeTopics.length];

      // Sequential document-wide chunk traversal: walk across ALL pages of the document
      const topicKeywords = selectedTopic.name.toLowerCase().split(" ").filter((w: string) => w.length > 3);
      const matchingChunks = allChunks.filter((chunk: string) =>
        topicKeywords.some((kw: string) => chunk.toLowerCase().includes(kw)),
      );
      
      // Advance through the entire PDF progressively so every question explores a different page range
      const totalChunks = allChunks.length;
      const globalChunkIndex = ((existingStems.length + step) * 2) % Math.max(1, totalChunks);
      const pool = matchingChunks.length >= 3 ? matchingChunks : allChunks;
      const startIndex = globalChunkIndex % Math.max(1, pool.length);
      const chunksSelected = [
        pool[startIndex],
        pool[(startIndex + 1) % pool.length],
        pool[(startIndex + 2) % pool.length],
      ].filter(Boolean);
      const textToUse = chunksSelected.join("\n\n").slice(0, 24000);

      // Quota-enforced difficulty determination
      const currentDifficulties = [...existingDifficulties, ...authoredItems.map((ai) => ai.difficulty)];
      const difficulty = selectQuotaDifficulty(
        job.difficulty_easy ?? 34,
        job.difficulty_medium ?? 33,
        job.difficulty_hard ?? 33,
        currentDifficulties,
        totalQuestionsTarget,
      );

      // Quota-enforced question form determination
      const currentForms = [...existingForms, ...authoredItems.map((ai) => ai.form)];
      const form = selectQuotaForm(
        job.type_standard ?? 50,
        job.type_combined ?? 50,
        job.ai_decides_type,
        currentForms,
        totalQuestionsTarget,
      );

      // Quota-enforced objective selection using job.objective_ratios
      const objectiveRatios: Record<string, number> | null =
        job.objective_ratios && typeof job.objective_ratios === "object" ? job.objective_ratios : null;
      const currentObjectives = [...existingObjectives, ...authoredItems.map((ai) => ai.objective ?? "")];
      const objective = selectQuotaObjective(objectiveRatios, currentObjectives, totalQuestionsTarget);

      // Source Fidelity Quota: Strict PDF vs AI Reasoning Split
      const strictTargetCount = typeof job.strict_questions_count === "number"
        ? Math.min(totalQuestionsTarget, Math.max(0, job.strict_questions_count))
        : (job.source_mode === "reasoning" ? 0 : totalQuestionsTarget);

      const existingStrictCount = existingItems.filter(
        (i: any) =>
          i.source_fidelity?.source_mode === "strict" ||
          i.source_mode === "strict" ||
          i.raw_explanation?.source_fidelity?.source_mode === "strict" ||
          (!i.source_mode && job.source_mode === "strict"),
      ).length;

      const totalStrictSoFar = existingStrictCount + authoredItems.filter((ai) => ai.sourceMode === "strict").length;
      const isStrictStep = totalStrictSoFar < strictTargetCount;
      const stepSourceMode: "strict" | "reasoning" = isStrictStep ? "strict" : "reasoning";

      // Check external literature questions count (persisted across batches)
      const externalTargetCount = Number(job.external_questions_count ?? 0);
      const totalExternalSoFar = existingExternalCount + authoredItems.filter((i) => i.isExternal).length;
      const isExternalStep = externalTargetCount > 0 && totalExternalSoFar < externalTargetCount;

      // STRICT Image Limit Enforcement:
      // If user set image_target_count (e.g. 3), once 3 questions have images, NEVER add any more!
      const imageTargetCount = Number(job.image_target_count ?? job.image_count ?? 0);
      const totalImagesSoFar = existingImageCount + authoredItems.filter((ai) => ai.hasImage).length;
      const shouldIncludeImage =
        Boolean(job.include_images) &&
        imageTargetCount > 0 &&
        totalImagesSoFar < imageTargetCount;

      // Anti-repetition forbidden concepts and previous answers
      const forbiddenConcepts = [
        ...existingAnswers.slice(-25).map((a) => `Correct answer: "${a}"`),
        ...existingStems.slice(-15).map((s) => `Stem: "${s.slice(0, 100)}..."`),
        ...authoredItems.map((ai) => `Stem: "${ai.stem.slice(0, 100)}..."`),
      ];

      // Balanced pacing and length style rotation:
      const lengthCycle: Array<"short_direct" | "medium_case" | "long_vignette" | "tricky_trap"> = [
        "short_direct",
        "medium_case",
        "short_direct",
        "long_vignette",
        "medium_case",
        "tricky_trap",
        "short_direct",
        "medium_case",
        "long_vignette",
        "medium_case",
      ];
      const cycleIdx = (existingStems.length + step) % lengthCycle.length;
      let lengthStyle: "short_direct" | "medium_case" | "long_vignette" | "tricky_trap" = lengthCycle[cycleIdx];

      // If the quota objective specifically demands recall, force short_direct; if tricky, force tricky_trap
      if (objective === "recall") {
        lengthStyle = "short_direct";
      } else if (objective === "tricky") {
        lengthStyle = "tricky_trap";
      } else if (objective === "clinical_vignette") {
        lengthStyle = "long_vignette";
      }

      // Pre-search real medical image ONLY if shouldIncludeImage is strictly true
      let preSearchedImage: any = null;
      if (shouldIncludeImage) {
        try {
          const currentExcludedUrls = [
            ...usedImageUrls,
            ...authoredItems.map((ai) => ai.imageUrl).filter(Boolean),
          ];
          const specificConcept = extractSpecificPathologyEntity(textToUse, selectedTopic.name);
          preSearchedImage = await searchRealMedicalImage(
            specificConcept,
            currentExcludedUrls,
            0,
            { isEasy: difficulty === "easy" },
          );
        } catch (e) {
          console.warn("[amfGenerateBatch] Pre-search real medical image error:", e);
        }
      }

      // Build generation prompt
      const systemPrompt = buildGenerationSystemPrompt({
        sourceMode: stepSourceMode,
        form,
        difficulty,
        objective,
        styleContext: job.style_sample_text,
        includeImage: shouldIncludeImage,
        forbiddenConcepts,
        externalLiteratureMode: isExternalStep,
        lengthStyle,
        imageInfo: preSearchedImage
          ? { title: preSearchedImage.title, description: preSearchedImage.description, url: preSearchedImage.url }
          : null,
      });

      const userPrompt = `TOPIC: ${selectedTopic.name}
SOURCE MATERIAL EXCERPT:
${textToUse}

${
  isExternalStep
    ? `TASK: Author ONE pristine ${difficulty.toUpperCase()} board-exam standard multiple choice question (USMLE / Robbins / PreTest style) testing the same core medical principles as the source text above. Adapt from authentic medical literature & board question banks.`
    : isStrictStep
    ? `TASK: Author ONE pristine ${difficulty.toUpperCase()} difficulty ${form === "B" ? "Combined" : "Standard"} medical MCQ strictly and directly grounded in the provided source text. Zero outside facts.`
    : `TASK: Author ONE pristine ${difficulty.toUpperCase()} difficulty ${form === "B" ? "Combined" : "Standard"} medical MCQ using the source text as foundational authority, enhanced with AI clinical reasoning.`
}
MANDATORY CONSTRAINTS:
1. Start the question directly with the clinical vignette or core question. Do NOT write "In the classification of...", "According to...", or echo the topic title in the stem!
2. Do NOT include source citations, book titles, or page numbers in the explanation text.
${shouldIncludeImage ? "3. The question stem MUST reference the attached real medical image and require visual inspection to answer." : "3. DO NOT include or reference any image in the question."}
Return STRICT JSON.`;

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
          const validatorPrompt = buildValidatorSystemPrompt(stepSourceMode === "strict");
          const valInput = `QUESTION TO VALIDATE:\n${JSON.stringify(questionJson, null, 2)}\n\nSOURCE EXCERPT:\n${textToUse}`;

          const valText =
            job.provider === "google"
              ? await callGoogleText(apiKey, job.model, validatorPrompt, valInput)
              : await callOpenAiText(apiKey, job.model, validatorPrompt, valInput);

          validationReport = parseJson(valText);
          validationPassed = validationReport?.pass === true;
        }

        // Check if question is combination (Form B, questionJson.form B, or has combo options)
        const isCombo =
          form === "B" ||
          questionJson.form === "B" ||
          (Array.isArray(questionJson.options) &&
            questionJson.options.filter((o: any) =>
              /\b(?:1\s*,\s*2|1\s+and\s+2|2\s+and\s+4|1\s*,\s*3|2\s*,\s*3|3\s+and\s+4|1\s+only|2\s+only|3\s+only|4\s+only|all of the above)\b/i.test(
                o?.text || "",
              ),
            ).length >= 2);

        // If statements array is missing or empty, extract from explanation table_rows
        if (isCombo && (!Array.isArray(questionJson.statements) || questionJson.statements.length === 0)) {
          const rows = questionJson.explanation?.table_rows;
          if (Array.isArray(rows) && rows.length >= 2) {
            questionJson.statements = rows.map((r: any, idx: number) => ({
              n: String(idx + 1),
              text: String(r.item || "").replace(/^\s*(?:\d+|[A-Za-z])[\.\)\-:]\s*/, "").trim(),
            }));
          }
        }

        const combinedStem =
          isCombo && Array.isArray(questionJson.statements) && questionJson.statements.length > 0
            ? buildCombinedStem(String(questionJson.stem ?? ""), questionJson.statements)
            : ensureCombinedStemWithStatements(
                cleanQuestionPreamble(String(questionJson.stem ?? "")),
                typeof questionJson.explanation === "string" ? questionJson.explanation : null,
                questionJson.options,
              );
        const stemFormatted = formatQuestionStem(combinedStem);
        const { maxScore } = checkDuplicate(stemFormatted, existingStems);

        if (maxScore >= job.dup_threshold) {
          failures.push(`Generated question rejected: ${maxScore}% similar to existing question.`);
          continue;
        }

        // Answer-level deduplication: reject if answer text concept matches an existing answer in this job
        const correctOptObj = Array.isArray(questionJson.options) && Array.isArray(questionJson.answer_labels)
          ? questionJson.options.find((o: any) => questionJson.answer_labels.includes(o.label))
          : null;
        const newCorrectOption = String(correctOptObj?.body || correctOptObj?.text || "").trim();
        if (newCorrectOption) {
          const isAnswerDuplicate = existingAnswers.some(
            (ans) => calculateSimilarity(ans.toLowerCase(), newCorrectOption.toLowerCase()) > 60,
          );
          if (isAnswerDuplicate) {
            failures.push(`Rejected duplicate answer concept: "${newCorrectOption}" already tested.`);
            continue;
          }
          existingAnswers.push(newCorrectOption);
        }

        // Real medical image retrieval (STRICT: only if shouldIncludeImage is true)
        let imageUrl: string | null = null;
        if (shouldIncludeImage) {
          imageUrl = preSearchedImage?.url ?? null;
          if (!imageUrl) {
            const currentExcludedUrls = [
              ...usedImageUrls,
              ...authoredItems.map((ai) => ai.imageUrl).filter(Boolean),
            ];
            const query = questionJson.image_prompt || extractSpecificPathologyEntity(textToUse, selectedTopic.name);
            try {
              imageUrl = await generateMedicalDiagram(
                supabase,
                job.provider,
                apiKey,
                query,
                job.id,
                currentExcludedUrls,
                {
                  targetAnswer: newCorrectOption,
                  isEasy: difficulty === "easy",
                },
              );
            } catch (imgErr) {
              console.warn("Medical image search error:", imgErr);
            }
          }
          if (imageUrl) {
            usedImageUrls.push(imageUrl);
          }
        } else {
          // STRICT RULE: If shouldIncludeImage is false, never attach image!
          imageUrl = null;
          questionJson.image_needed = false;
          questionJson.image_prompt = null;
        }


        // Build structured explanation markdown
        const explanationData: ExplanationData = questionJson.explanation ?? {};
        const displayItems =
          isCombo
            ? (Array.isArray(questionJson.statements) ? questionJson.statements : []).map((s: any) => ({
                label: String(s.n),
                text: String(s.text),
              }))
            : (Array.isArray(questionJson.options) ? questionJson.options : []).map((o: any) => ({
                label: String(o.label),
                text: String(o.text),
              }));

        const explanationMarkdown = stripSourceCitation(
          buildForgeExplanation(
            isCombo ? "B" : "A",
            explanationData,
            displayItems,
            Array.isArray(questionJson.answer_labels) ? questionJson.answer_labels : [],
            null, // Do NOT append source citations to student explanation markdown
          ),
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

        const finalSourceFidelity = {
          ...(questionJson.source_fidelity && typeof questionJson.source_fidelity === "object" ? questionJson.source_fidelity : {}),
          source_mode: stepSourceMode,
        };

        existingStems.push(stemFormatted);
        generatedCount++;
        authoredItems.push({
          order: nextOrder,
          stem: stemFormatted.slice(0, 100),
          form,
          difficulty,
          objective,
          imageUrl,
          hasImage: !!imageUrl,
          topicName: selectedTopic.name,
          isExternal: isExternalStep,
          sourceMode: stepSourceMode,
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
      let { data: rows, error } = await q;
      if (!error && rows) {
        // When viewing "all", automatically hide rejected duplicates so review screen stays clean
        if (data.statusFilter === "all") {
          rows = rows.filter((r: any) => r.status !== "rejected" && (Number(r.dup_score) || 0) < 70);
        }
        return rows.map((r: any) => ({
          ...r,
          stem: formatQuestionStem(r.stem),
          explanation: stripSourceCitation(r.explanation),
        }));
      }
    } catch {
      // fallback
    }

    // Fallback: amg_items
    let q = supabase.from(AMG_ITEMS).select("*").eq("group_id", data.jobId).eq("archived", false).order("order_index");
    if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);
    const { data: gRows, error: gErr } = await q;
    if (gErr) throw new Error(gErr.message);

    let cleanGRows = gRows ?? [];
    if (data.statusFilter === "all") {
      cleanGRows = cleanGRows.filter((i: any) => {
        const exp = (i.explanation ?? {}) as any;
        return i.status !== "rejected" && (Number(exp?.dup_score) || 0) < 70;
      });
    }

    return cleanGRows.map((i: any) => {
      const exp = (i.explanation ?? {}) as any;
      const rawExp = typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? "");
      return {
        ...i,
        job_id: i.group_id,
        stem: formatQuestionStem(i.stem),
        explanation: stripSourceCitation(rawExp),
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

export const amfPurgeDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    await supabase.from(ITEMS).delete().eq("job_id", data.jobId).eq("status", "rejected");
    await supabase.from(ITEMS).delete().eq("job_id", data.jobId).gte("dup_score", 70);
    await supabase.from(AMG_ITEMS).delete().eq("group_id", data.jobId).eq("status", "rejected");
    return { ok: true };
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

    const patch = { ...data.patch };
    if (patch.stem) patch.stem = formatQuestionStem(patch.stem);
    if (patch.explanation) patch.explanation = stripSourceCitation(patch.explanation);

    // Try amf_items
    const { data: row } = await supabase.from(ITEMS).update(patch).eq("id", data.itemId).select("*").maybeSingle();
    if (row) return row;

    // Fallback: amg_items
    const { data: gItem } = await supabase.from(AMG_ITEMS).select("*").eq("id", data.itemId).maybeSingle();
    if (gItem) {
      const exp = (gItem.explanation ?? {}) as any;
      if (patch.explanation) exp.explanation = patch.explanation;
      const amgPatch: any = {
        updated_at: new Date().toISOString(),
      };
      if (patch.stem) amgPatch.stem = patch.stem;
      if (patch.status) amgPatch.status = patch.status;
      if (patch.explanation) amgPatch.explanation = exp;
      await supabase.from(AMG_ITEMS).update(amgPatch).eq("id", data.itemId);
      return { ...gItem, ...patch };
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
        const rawExp = typeof exp.explanation === "string" ? exp.explanation : String(i.explanation ?? "");
        return {
          ...i,
          stem: formatQuestionStem(i.stem),
          explanation: stripSourceCitation(rawExp),
          image_url: i.image_url || exp.image_url || null,
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
        const cleanExp = stripSourceCitation(item.explanation);
        const fullStem =
          Array.isArray(item.statements) && item.statements.length > 0
            ? buildCombinedStem(item.stem, item.statements)
            : ensureCombinedStemWithStatements(item.stem, cleanExp, item.options);
        const cleanStem = formatQuestionStem(fullStem);
        const questionPayload = {
          subject_id: data.subjectId,
          stem: cleanStem,
          explanation: cleanExp || null,
          image_url: item.image_url || null,
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

    // Existing course questions are never rewritten here — only newly inserted rows are touched.

    return { inserted, skipped, failed, errors: errors.slice(0, 5) };
  });
