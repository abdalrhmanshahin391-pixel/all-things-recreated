import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { formatQuestionStem } from "@/lib/question-format";
import {
  AMF_MODELS,
  buildTopicDiscoveryPrompt,
  buildFactExtractionPrompt,
  buildGenerationSystemPrompt,
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
const KEYS = "amg_keys"; // Shared API keys table
const SOURCE_BUCKET = "amf-sources";
const IMAGE_BUCKET = "amf-images";

type Ctx = { supabase: any; userId: string };

async function ensureStaff(context: any): Promise<Ctx> {
  const { supabase, userId } = context;
  const { data: allowed } = await supabase.rpc("can_use_amg", { _user_id: userId });
  if (!allowed) throw new Error("Forbidden: Staff access required for Aqua MCQ Forge.");
  return { supabase, userId };
}

async function getKey(supabase: any, provider: string): Promise<string> {
  const { data } = await supabase.from(KEYS).select("api_key").eq("provider", provider).maybeSingle();
  const key = String(data?.api_key ?? "").trim();
  if (!key) {
    throw new Error(
      provider === "google"
        ? "No Google AI Studio key found. Please save a Google key in Aqua MCQ Gen Pro or the Keys tool."
        : "No OpenAI key found. Please save an OpenAI key in Aqua MCQ Gen Pro or the Keys tool.",
    );
  }
  return key;
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

// ------------------------------------------------------------- AI Callers ---

async function callGoogleText(apiKey: string, model: string, system: string, prompt: string): Promise<string> {
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
  if (!res.ok) throw new Error(`Google API error (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
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

async function generateMedicalDiagram(
  supabase: any,
  provider: string,
  apiKey: string,
  prompt: string,
  jobId: string,
): Promise<string | null> {
  try {
    if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            instances: [{ prompt: `Medical anatomical/clinical educational illustration, clean vector medical textbook diagram: ${prompt}` }],
            parameters: { sampleCount: 1, aspectRatio: "1:1" },
          }),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          const buffer = Buffer.from(b64, "base64");
          const path = `jobs/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, buffer, { contentType: "image/png" });
          if (!error) {
            const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
            return data?.publicUrl ?? null;
          }
        }
      }
    } else if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: `Medical educational diagram: ${prompt}. Clean white background, textbook schematic style.`,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const b64 = json?.data?.[0]?.b64_json;
        if (b64) {
          const buffer = Buffer.from(b64, "base64");
          const path = `jobs/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, buffer, { contentType: "image/png" });
          if (!error) {
            const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
            return data?.publicUrl ?? null;
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to generate image diagram:", e);
  }
  return null;
}

// ================================================================= JOBS =====

export const amfListJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: jobs, error } = await supabase.from(JOBS).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = jobs ?? [];
    if (!list.length) return [];

    const { data: items } = await supabase.from(ITEMS).select("job_id, status, validation_passed, flagged");
    const { data: sources } = await supabase.from(SOURCES).select("job_id, file_name");

    return list.map((j: any) => {
      const jobItems = (items ?? []).filter((i: any) => i.job_id === j.id);
      const jobSources = (sources ?? []).filter((s: any) => s.job_id === j.id);
      return {
        ...j,
        sourcesCount: jobSources.length,
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
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        provider: z.enum(["google", "openai"]).default("google"),
        model: z.string().min(2).max(60).default("gemini-2.5-flash"),
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
        sourceFidelityEnabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const { data: row, error } = await supabase
      .from(JOBS)
      .insert({
        name: data.name.trim(),
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
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amfGetJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: job, error: jErr } = await supabase.from(JOBS).select("*").eq("id", data.jobId).maybeSingle();
    if (jErr || !job) throw new Error("This generation job no longer exists.");

    const [{ data: sources }, { data: topics }, { data: items }] = await Promise.all([
      supabase.from(SOURCES).select("id, file_name, storage_path, page_count, created_at").eq("job_id", data.jobId).order("created_at"),
      supabase.from(TOPICS).select("*").eq("job_id", data.jobId).order("created_at"),
      supabase.from(ITEMS).select("id, status, validation_passed, flagged, difficulty, form").eq("job_id", data.jobId),
    ]);

    return {
      job,
      sources: sources ?? [],
      topics: topics ?? [],
      stats: {
        total: (items ?? []).length,
        pending: (items ?? []).filter((i: any) => i.status === "pending").length,
        approved: (items ?? []).filter((i: any) => i.status === "approved").length,
        rejected: (items ?? []).filter((i: any) => i.status === "rejected").length,
        needsReview: (items ?? []).filter((i: any) => i.status === "needs_review").length,
        imported: (items ?? []).filter((i: any) => i.status === "imported").length,
      },
    };
  });

export const amfUpdateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(120).optional(),
          provider: z.enum(["google", "openai"]).optional(),
          model: z.string().min(2).max(60).optional(),
          source_mode: z.enum(["strict", "reasoning"]).optional(),
          style_mode: z.enum(["ai", "course", "pdf"]).optional(),
          style_course_id: z.string().uuid().nullable().optional(),
          style_sample_text: z.string().max(8000).optional(),
          difficulty_easy: z.number().int().min(0).max(100).optional(),
          difficulty_medium: z.number().int().min(0).max(100).optional(),
          difficulty_hard: z.number().int().min(0).max(100).optional(),
          type_standard: z.number().int().min(0).max(100).optional(),
          type_combined: z.number().int().min(0).max(100).optional(),
          ai_decides_type: z.boolean().optional(),
          total_questions: z.number().int().min(1).max(500).optional(),
          coverage_mode: z.boolean().optional(),
          dup_threshold: z.number().int().min(10).max(100).optional(),
          include_images: z.boolean().optional(),
          image_count: z.number().int().min(0).max(100).optional(),
          source_fidelity_enabled: z.boolean().optional(),
          status: z.enum(["draft", "extracting", "topics_ready", "generating", "validating", "ready", "imported", "error"]).optional(),
          error: z.string().max(500).nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row, error } = await supabase
      .from(JOBS)
      .update(data.patch)
      .eq("id", data.jobId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amfDeleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: sources } = await supabase.from(SOURCES).select("storage_path").eq("job_id", data.jobId);
    const paths = (sources ?? []).map((s: any) => s.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from(SOURCE_BUCKET).remove(paths);
    const { error } = await supabase.from(JOBS).delete().eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================ SOURCES ===

export const amfAddPdfSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
        storagePath: z.string().min(1).max(500),
        pages: z.array(z.string().max(120000)).min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const chunks: string[] = [];
    for (const page of data.pages) {
      const text = page.replace(/\s+\n/g, "\n").trim();
      for (let start = 0; start < text.length; start += 6000) {
        chunks.push(text.slice(start, start + 7000));
      }
    }
    const fullText = data.pages.join("\n\n").slice(0, 1_500_000);
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
    if (error) throw new Error(error.message);
    return row;
  });

export const amfDeletePdfSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row } = await supabase.from(SOURCES).select("storage_path").eq("id", data.sourceId).maybeSingle();
    if (row?.storage_path) await supabase.storage.from(SOURCE_BUCKET).remove([row.storage_path]);
    const { error } = await supabase.from(SOURCES).delete().eq("id", data.sourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================= TOPICS ===

export const amfDiscoverTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: job } = await supabase.from(JOBS).select("*").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Job not found");

    const { data: sources } = await supabase.from(SOURCES).select("extracted_text, chunks").eq("job_id", data.jobId);
    if (!sources?.length) throw new Error("No textbook PDF uploaded yet. Upload a source PDF first.");

    const apiKey = await getKey(supabase, job.provider);
    const sampleText = sources
      .map((s: any) => (Array.isArray(s.chunks) ? s.chunks.slice(0, 5).join("\n\n") : s.extracted_text?.slice(0, 30000)))
      .join("\n\n")
      .slice(0, 35000);

    const prompt = buildTopicDiscoveryPrompt(sampleText);
    const responseText =
      job.provider === "google"
        ? await callGoogleText(apiKey, job.model, "You extract medical topics from textbooks.", prompt)
        : await callOpenAiText(apiKey, job.model, "You extract medical topics from textbooks.", prompt);

    const json = parseJson(responseText);
    const rawTopics = Array.isArray(json?.topics) ? json.topics : [];

    if (!rawTopics.length) {
      throw new Error("The AI could not identify clear medical topics from this text excerpt.");
    }

    // Insert topics into amf_topics
    const rows = rawTopics.map((t: any) => ({
      job_id: data.jobId,
      name: String(t.name || "General Medical Topic").trim(),
      description: String(t.description || "").trim(),
      min_questions: 1,
      max_questions: Math.max(2, Number(t.estimated_weight || 5)),
      target_questions: Math.max(1, Math.min(10, Math.round(Number(t.estimated_weight || 5) / 2))),
      enabled: true,
      facts: [],
    }));

    // Clear old topics
    await supabase.from(TOPICS).delete().eq("job_id", data.jobId);
    const { data: inserted, error } = await supabase.from(TOPICS).insert(rows).select("*");
    if (error) throw new Error(error.message);

    await supabase.from(JOBS).update({ status: "topics_ready" }).eq("id", data.jobId);
    return inserted ?? [];
  });

export const amfListTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: rows, error } = await supabase.from(TOPICS).select("*").eq("job_id", data.jobId).order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const amfUpdateTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(300).optional(),
          min_questions: z.number().int().min(0).max(100).optional(),
          max_questions: z.number().int().min(1).max(100).optional(),
          target_questions: z.number().int().min(1).max(100).optional(),
          enabled: z.boolean().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row, error } = await supabase.from(TOPICS).update(data.patch).eq("id", data.topicId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
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
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        batchSize: z.number().int().min(1).max(5).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: job } = await supabase.from(JOBS).select("*").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Job not found");

    const [{ data: topics }, { data: sources }, { data: existingItems }] = await Promise.all([
      supabase.from(TOPICS).select("*").eq("job_id", data.jobId).eq("enabled", true),
      supabase.from(SOURCES).select("file_name, extracted_text, chunks").eq("job_id", data.jobId),
      supabase.from(ITEMS).select("stem, topic_id, order_index").eq("job_id", data.jobId).eq("archived", false),
    ]);

    if (!topics?.length) throw new Error("No active topics found. Run topic discovery or enable topics first.");
    if (!sources?.length) throw new Error("No source PDFs found.");

    const apiKey = await getKey(supabase, job.provider);
    const existingStems = (existingItems ?? []).map((i: any) => String(i.stem ?? ""));

    // Style cloning reference if course is selected
    let styleContext = job.style_sample_text || "";
    if (!styleContext && job.style_mode === "course" && job.style_course_id) {
      const { data: sampleQuestions } = await supabase
        .from("questions")
        .select("stem, question_options(label, text)")
        .eq("subject_id", job.style_course_id)
        .limit(3);
      if (sampleQuestions?.length) {
        styleContext = sampleQuestions
          .map((q: any) => `${q.stem}\n${q.question_options?.map((o: any) => `${o.label}. ${o.text}`).join("\n")}`)
          .join("\n\n---\n\n");
      }
    }

    let generatedCount = 0;
    const failures: string[] = [];

    for (let step = 0; step < data.batchSize; step++) {
      // Find a topic that still needs questions
      const currentCounts = new Map<string, number>();
      for (const i of existingItems ?? []) {
        if (i.topic_id) currentCounts.set(i.topic_id, (currentCounts.get(i.topic_id) ?? 0) + 1);
      }

      // Pick topic with greatest shortfall
      const availableTopics = [...topics].sort((a, b) => {
        const aCount = currentCounts.get(a.id) ?? 0;
        const bCount = currentCounts.get(b.id) ?? 0;
        return aCount - bCount;
      });

      const selectedTopic = availableTopics[0] || topics[0];

      // Relevant text chunk for this topic
      const allChunks = (sources ?? []).flatMap((s: any) => (Array.isArray(s.chunks) ? s.chunks : []));
      const topicKeywords = selectedTopic.name.toLowerCase().split(" ").filter((w: string) => w.length > 3);
      const matchingChunks = allChunks.filter((chunk: string) =>
        topicKeywords.some((kw: string) => chunk.toLowerCase().includes(kw)),
      );
      const textToUse = (matchingChunks.length ? matchingChunks.slice(0, 3) : allChunks.slice(0, 3)).join("\n\n").slice(0, 24000);

      // Determine parameters for this question
      const difficulty = selectWeightedDifficulty(job.difficulty_easy, job.difficulty_medium, job.difficulty_hard);
      const form = selectQuestionForm(job.type_standard, job.type_combined, job.ai_decides_type);
      const objective = selectRandomObjective();
      const includeImage = job.include_images && (job.image_count ?? 0) > 0;

      // Build generation prompt
      const systemPrompt = buildGenerationSystemPrompt({
        sourceMode: job.source_mode,
        form,
        difficulty,
        objective,
        styleContext,
        includeImage,
      });

      const userPrompt = `TOPIC: ${selectedTopic.name}
SOURCE MATERIAL EXCERPT:
${textToUse}

Author ONE pristine ${difficulty.toUpperCase()} difficulty ${form === "B" ? "Combined" : "Standard"} medical MCQ based on this source text. Return STRICT JSON.`;

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
          // Reject as duplicate
          failures.push(`Generated question rejected: ${maxScore}% similar to existing question.`);
          continue;
        }

        // Optional image generation
        let imageUrl: string | null = null;
        if (questionJson.image_needed && questionJson.image_prompt) {
          imageUrl = await generateMedicalDiagram(supabase, job.provider, apiKey, questionJson.image_prompt, job.id);
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

        // Insert item
        const nextOrder = (existingItems?.length ?? 0) + generatedCount + 1;
        const initialStatus = validationPassed ? "pending" : "needs_review";

        await supabase.from(ITEMS).insert({
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

        existingStems.push(stemFormatted);
        generatedCount++;
      } catch (err: any) {
        failures.push(`Generation attempt error: ${String(err?.message ?? err).slice(0, 160)}`);
      }
    }

    // Update job status if we reached target
    const { count: totalItems } = await supabase
      .from(ITEMS)
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("archived", false);

    if ((totalItems ?? 0) >= (job.total_questions ?? 20)) {
      await supabase.from(JOBS).update({ status: "ready" }).eq("id", job.id);
    } else {
      await supabase.from(JOBS).update({ status: "generating" }).eq("id", job.id);
    }

    return { generatedCount, failures, totalItems: totalItems ?? 0 };
  });

// ================================================================= REVIEW ===

export const amfListItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        statusFilter: z.enum(["all", "pending", "approved", "rejected", "needs_review"]).default("all"),
        topicId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    let q = supabase.from(ITEMS).select("*").eq("job_id", data.jobId).eq("archived", false).order("order_index");
    if (data.statusFilter !== "all") {
      q = q.eq("status", data.statusFilter);
    }
    if (data.topicId) {
      q = q.eq("topic_id", data.topicId);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const amfUpdateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        patch: z.object({
          stem: z.string().max(10000).optional(),
          form: z.enum(["A", "B"]).optional(),
          statements: z.array(z.object({ n: z.string(), text: z.string() })).optional(),
          options: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
          answer_labels: z.array(z.string()).optional(),
          difficulty: z.enum(["easy", "medium", "hard"]).optional(),
          objective: z.string().optional(),
          explanation: z.string().max(30000).optional(),
          status: z.enum(["pending", "approved", "rejected", "needs_review"]).optional(),
          flagged: z.boolean().optional(),
          flag_reason: z.string().max(300).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row, error } = await supabase.from(ITEMS).update(data.patch).eq("id", data.itemId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amfSetItemsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemIds: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(["pending", "approved", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { error } = await supabase
      .from(ITEMS)
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .in("id", data.itemIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.itemIds.length };
  });

// ================================================================= IMPORT ===

export const amfImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        subjectId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);

    const { data: approvedItems } = await supabase
      .from(ITEMS)
      .select("*")
      .eq("job_id", data.jobId)
      .eq("archived", false)
      .eq("status", "approved")
      .order("order_index");

    if (!approvedItems?.length) {
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
        inserted++;
        sort++;
      } catch (err: any) {
        failed++;
        errors.push(String(err?.message ?? err).slice(0, 160));
      }
    }

    if (inserted > 0) {
      await supabase.from(JOBS).update({ status: "imported" }).eq("id", data.jobId);
      await supabase.from(EVENTS).insert({
        job_id: data.jobId,
        actor: userId,
        action: "import",
        detail: { inserted, skipped, failed, subject_id: data.subjectId },
      });
    }

    return { inserted, skipped, failed, errors: errors.slice(0, 5) };
  });
