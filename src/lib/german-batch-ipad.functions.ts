// "50% iPad Germany" — extracts every embedded image from a German-learning
// PDF on the server, sends each image as its own request inside a single
// Gemini batch job (50% cheaper), then imports the returned German↔English
// pairs as 4-option MCQ quiz questions in the chosen German course/subject.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { encodePNG, toBase64 } from "@/lib/png-encoder";
import { submitGeminiBatch } from "@/lib/gemini-pool";

const MODEL = "gemini-flash-lite-latest";
const JOBS_TABLE = "jarvis_batch_german_ipad_jobs";
const CHUNKS_TABLE = "jarvis_batch_german_ipad_chunks";

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase, userId } as { supabase: any; userId: string };
}

async function getGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
    .order("slot", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/ai-keys.");
  return data.api_key as string;
}

function extractJsonObject(text: string): any | null {
  const cleaned = String(text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch { /* ignore */ }
  const lb = cleaned.indexOf("{");
  const rb = cleaned.lastIndexOf("}");
  if (lb !== -1 && rb > lb) { try { return JSON.parse(cleaned.slice(lb, rb + 1)); } catch { /* ignore */ } }
  return null;
}

const IMAGE_SYSTEM = `You read one image from a German learning textbook and return the German→English pairs printed on it.

Return STRICT JSON only, no markdown fences, with this exact shape:

{ "pairs": [
    {
      "german": "the German sentence or word EXACTLY as printed",
      "english": "the correct English translation",
      "wrong_translations": ["plausible wrong translation 1", "plausible wrong translation 2", "plausible wrong translation 3"]
    }
] }

Rules:
- Only include real German text that is legible in the image. Skip decoration, page numbers, image credits.
- For sentences: keep the full German sentence and the full correct English translation.
- For single words: keep the German exactly as printed, including article + plural when shown (e.g. "die Bank, die Banken").
- Every pair MUST have EXACTLY 3 "wrong_translations". They must be believable English translations that a student could mistake for the correct one, and they must be clearly wrong. Do NOT repeat the correct English inside wrong_translations.
- If the image contains NO German text (a decorative picture, a photo without labels, etc.), return { "pairs": [] }. Never invent pairs.
- Output JSON only.`;

// --------- image extraction helpers ---------

async function extractAllImagesFromPdf(pdfBytes: Uint8Array): Promise<Array<{ pageNumber: number; base64: string }>> {
  const { extractImages, getDocumentProxy } = await import("unpdf");
  const doc: any = await getDocumentProxy(pdfBytes);
  const total = Number(doc.numPages || 0);
  const out: Array<{ pageNumber: number; base64: string }> = [];
  for (let p = 1; p <= total; p++) {
    let imgs: any[] = [];
    try {
      imgs = await extractImages(doc, p);
    } catch {
      continue;
    }
    for (const img of imgs) {
      try {
        const png = encodePNG(img.width, img.height, img.data, img.channels || 3);
        // Skip tiny decorative graphics.
        if (img.width < 60 || img.height < 60) continue;
        out.push({ pageNumber: p, base64: toBase64(png) });
      } catch {
        // ignore encode failures for a single image
      }
    }
  }
  return out;
}

// --------- server functions ---------

const CreateJobInput = z.object({
  courseId: z.string().uuid(),
  subjectId: z.string().uuid(),
  pdfName: z.string().min(1).max(200),
  kind: z.enum(["words", "sentences"]).default("sentences"),
  queueOrder: z.number().int().min(0).default(0),
});

export const createGermanJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS_TABLE).insert({
      user_id: userId,
      course_id: data.courseId,
      subject_id: data.subjectId,
      pdf_name: data.pdfName,
      kind: data.kind,
      queue_order: data.queueOrder,
      status: "pending",
    }).select("id").single();
    if (error) throw error;
    return { jobId: job.id as string };
  });

// Extract every image from the PDF, submit ONE Gemini batch containing all
// images, and record chunks. Returns the batch name + image count.
const ExtractInput = z.object({
  jobId: z.string().uuid(),
  pdfBase64: z.string().min(20).max(24_000_000),
});

export const extractAndSubmitGermanIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    await supabase.from(JOBS_TABLE).update({ status: "extracting", error: null }).eq("id", data.jobId);

    const bin = Uint8Array.from(Buffer.from(data.pdfBase64, "base64"));
    const images = await extractAllImagesFromPdf(bin);

    if (images.length === 0) {
      await supabase.from(JOBS_TABLE).update({ status: "empty", total_images: 0, error: "No images found in this PDF." }).eq("id", data.jobId);
      return { totalImages: 0, batchName: null as string | null };
    }

    // Record chunks so the UI can show progress per image.
    const chunkRows = images.map((img, i) => ({
      job_id: data.jobId,
      image_index: i,
      page_number: img.pageNumber,
      status: "pending" as const,
    }));
    await supabase.from(CHUNKS_TABLE).delete().eq("job_id", data.jobId);
    const { error: cErr } = await supabase.from(CHUNKS_TABLE).insert(chunkRows);
    if (cErr) throw cErr;

    const { data: jobRow, error: jErr } = await supabase
      .from(JOBS_TABLE).select("kind").eq("id", data.jobId).single();
    if (jErr) throw jErr;

    const kindHint = jobRow.kind === "words"
      ? "German vocabulary WORDS (single words, with article and plural if shown)"
      : "German full SENTENCES";

    const apiKey = await getGeminiKey(supabase);

    const requests = images.map((img, i) => ({
      request: {
        systemInstruction: { parts: [{ text: IMAGE_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { text: `Extract every ${kindHint} visible in this image, with the correct English translation and 3 plausible wrong English translations for each.` },
            { inline_data: { mime_type: "image/png", data: img.base64 } },
          ],
        }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: "application/json" },
      },
      metadata: { key: `img-${i}` },
    }));

    const body = {
      batch: {
        display_name: `de-ipad-${data.jobId.slice(0, 8)}-${Date.now()}`,
        input_config: { requests: { requests } },
      },
    };

    const submitted = await submitGeminiBatch({ apiKey, model: MODEL, body: body });
    const json: any = submitted.ok ? submitted.json : {};
    const res = { ok: submitted.ok, status: submitted.ok ? 200 : submitted.status };
    const submitError = submitted.ok ? "" : submitted.message;
    if (!res.ok) {
      const msg = submitError;
      await supabase.from(JOBS_TABLE).update({ status: "failed", error: msg }).eq("id", data.jobId);
      throw new Error(msg);
    }
    const batchName: string | undefined = json?.name || json?.metadata?.name;
    if (!batchName) {
      await supabase.from(JOBS_TABLE).update({ status: "failed", error: "Batch returned no name" }).eq("id", data.jobId);
      throw new Error("Batch submit returned no name");
    }

    await supabase.from(JOBS_TABLE).update({
      status: "awaiting_batch",
      total_images: images.length,
      batch_name: batchName,
      batch_status: "RUNNING",
      error: null,
    }).eq("id", data.jobId);

    return { totalImages: images.length, batchName };
  });

// --------- polling & import ---------

function getBatchState(json: any): string {
  return json?.metadata?.state || json?.response?.state || json?.state || "BATCH_STATE_UNKNOWN";
}
function mapBatchStatus(state: string) {
  const s = String(state || "").toUpperCase();
  if (s === "JOB_STATE_SUCCEEDED" || s === "BATCH_STATE_SUCCEEDED") return "succeeded";
  if (s === "JOB_STATE_FAILED" || s === "BATCH_STATE_FAILED") return "failed";
  if (s === "JOB_STATE_CANCELLED" || s === "BATCH_STATE_CANCELLED") return "cancelled";
  if (s === "JOB_STATE_EXPIRED" || s === "BATCH_STATE_EXPIRED") return "expired";
  if (s === "JOB_STATE_RUNNING" || s === "BATCH_STATE_RUNNING") return "running";
  return "pending";
}
function getInlinedResponses(json: any): any[] {
  const c = [
    json?.response?.output?.inlinedResponses?.inlinedResponses,
    json?.response?.output?.inlinedResponses,
    json?.output?.inlinedResponses?.inlinedResponses,
    json?.output?.inlinedResponses,
    json?.response?.responses, json?.responses,
    json?.response?.inlinedResponses?.inlinedResponses, json?.response?.inlinedResponses,
    json?.inlinedResponses?.inlinedResponses, json?.inlinedResponses,
  ];
  for (const x of c) if (Array.isArray(x)) return x;
  return [];
}
function getResponsesFile(json: any): string | undefined {
  return json?.response?.output?.responsesFile || json?.output?.responsesFile
    || json?.response?.responsesFile || json?.responsesFile;
}
function responseText(item: any): string {
  return item?.response?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.text || item?.text || "";
}
async function fetchBatch(apiKey: string, batchName: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}
async function downloadResponses(apiKey: string, json: any): Promise<any[]> {
  let inline = getInlinedResponses(json);
  const file = getResponsesFile(json);
  if ((!inline || inline.length === 0) && file) {
    const fr = await fetch(
      `https://generativelanguage.googleapis.com/download/v1beta/${file}:download?alt=media`,
      { headers: { "x-goog-api-key": apiKey } },
    );
    const text = await fr.text();
    inline = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  return inline ?? [];
}

const PollInput = z.object({ jobId: z.string().uuid() });

export const pollGermanJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PollInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS_TABLE)
      .select("id, batch_name, status").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.batch_name) return { status: job.status, batchStatus: null as string | null };
    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, job.batch_name);
    const provider = getBatchState(bj);
    const mapped = mapBatchStatus(provider);
    const dbStatus =
      mapped === "succeeded" ? "batch_ready" :
      mapped === "failed" || mapped === "cancelled" || mapped === "expired" ? "failed" :
      "awaiting_batch";
    const patch: any = { status: dbStatus, batch_status: provider };
    if (dbStatus === "failed") patch.error = JSON.stringify(bj?.error || bj?.response?.error || bj).slice(0, 500);
    await supabase.from(JOBS_TABLE).update(patch).eq("id", data.jobId);
    return { status: dbStatus, batchStatus: provider };
  });

// Import: fetch batch results, and for each pair insert a standard MCQ into
// the regular `questions` / `question_options` tables under the selected
// subject — same tables the medical Jarvis batch uses.

const ImportInput = z.object({ jobId: z.string().uuid() });

export const importGermanJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS_TABLE)
      .select("id, batch_name, subject_id").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.batch_name) throw new Error("Job has no batch");
    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, job.batch_name);
    if (mapBatchStatus(getBatchState(bj)) !== "succeeded") throw new Error("Batch not succeeded yet");
    const items = await downloadResponses(apiKey, bj);

    const { count: startCount } = await supabase.from("questions")
      .select("id", { count: "exact", head: true }).eq("subject_id", job.subject_id);

    let position = startCount ?? 0;
    let imported = 0;
    const perChunkStats = new Map<number, { imported: number; pairs: any[]; error?: string }>();

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key: string = it?.metadata?.key || `img-${i}`;
      const idx = Number(key.replace(/^img-/, "")) || i;
      try {
        const parsed = extractJsonObject(responseText(it));
        const pairs: any[] = Array.isArray(parsed?.pairs) ? parsed.pairs : [];
        const seen = new Set<string>();
        const good: Array<{ german: string; english: string; wrongs: string[] }> = [];
        for (const p of pairs) {
          const g = String(p?.german ?? "").trim();
          const en = String(p?.english ?? "").trim();
          const wrongs: string[] = Array.isArray(p?.wrong_translations)
            ? p.wrong_translations.map((x: any) => String(x ?? "").trim()).filter((x: string) => x && x.toLowerCase() !== en.toLowerCase())
            : [];
          if (!g || !en || wrongs.length < 3) continue;
          const k = g.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          good.push({ german: g, english: en, wrongs: wrongs.slice(0, 3) });
        }
        let localImported = 0;
        for (const pair of good) {
          position++;
          const { data: q, error: qErr } = await supabase.from("questions").upsert(
            {
              subject_id: job.subject_id,
              stem: pair.german,
              explanation: `**Translation:** ${pair.english}`,
              sort_order: position,
            },
            { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
          ).select("id").maybeSingle();
          if (qErr || !q?.id) continue;
          // Build 4 options and shuffle
          const opts = [
            { text: pair.english, is_correct: true },
            ...pair.wrongs.map((w) => ({ text: w, is_correct: false })),
          ];
          for (let s = opts.length - 1; s > 0; s--) {
            const j = Math.floor(Math.random() * (s + 1));
            [opts[s], opts[j]] = [opts[j], opts[s]];
          }
          const rows = opts.map((o, k) => ({
            question_id: q.id,
            label: String.fromCharCode(65 + k),
            text: o.text,
            is_correct: o.is_correct,
            sort_order: k + 1,
          }));
          const { error: oErr } = await supabase.from("question_options").insert(rows);
          if (oErr) continue;
          localImported++;
        }
        imported += localImported;
        perChunkStats.set(idx, { imported: localImported, pairs: good });
      } catch (e: any) {
        perChunkStats.set(idx, { imported: 0, pairs: [], error: String(e?.message || e).slice(0, 300) });
      }
    }

    // Update chunk rows so the UI can display per-image outcome.
    const { data: chunks } = await supabase.from(CHUNKS_TABLE)
      .select("id, image_index").eq("job_id", data.jobId);
    for (const c of (chunks ?? []) as { id: string; image_index: number }[]) {
      const st = perChunkStats.get(c.image_index);
      if (!st) continue;
      await supabase.from(CHUNKS_TABLE).update({
        status: st.error ? "failed" : (st.imported > 0 ? "imported" : "empty"),
        imported_count: st.imported,
        pairs_json: st.pairs,
        error: st.error ?? null,
      }).eq("id", c.id);
    }

    await supabase.from(JOBS_TABLE).update({
      status: "imported",
      processed_images: items.length,
      imported_pairs: imported,
    }).eq("id", data.jobId);

    return { imported, images: items.length };
  });

// --------- listing / delete ---------

export const listGermanJobsIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase.from(JOBS_TABLE)
      .select("id, pdf_name, kind, status, batch_status, total_images, imported_pairs, error, created_at, subject_id, course_id, queue_order")
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return { rows: data ?? [] };
  });

const GetJobInput = z.object({ jobId: z.string().uuid() });
export const getGermanJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const [{ data: job, error: e1 }, { data: chunks, error: e2 }] = await Promise.all([
      supabase.from(JOBS_TABLE).select("*").eq("id", data.jobId).single(),
      supabase.from(CHUNKS_TABLE)
        .select("id, image_index, page_number, status, imported_count, error, pairs_json")
        .eq("job_id", data.jobId).order("image_index"),
    ]);
    if (e1) throw e1; if (e2) throw e2;
    return { job, chunks: chunks ?? [] };
  });

const DeleteJobInput = z.object({ jobId: z.string().uuid() });
export const deleteGermanJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from(JOBS_TABLE).delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
