// Jarvis Batch v2 iPad — same pipeline as v2 but writes to iPad-only tables so
// the two versions never share state. The client differs (pre-splits the PDF
// with pdf-lib so iPad Safari never has to open a large document), but every
// server-side step is a byte-for-byte port of jarvis-batch-v2.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { submitGeminiBatch } from "@/lib/gemini-pool";

const MODEL = "gemini-flash-lite-latest";
const CHUNK_PAGES = 2;
const JOBS_TABLE = "jarvis_batch_v2_ipad_jobs";
const CHUNKS_TABLE = "jarvis_batch_v2_ipad_chunks";

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
  try { return JSON.parse(cleaned); } catch {}
  const lb = cleaned.indexOf("{");
  const rb = cleaned.lastIndexOf("}");
  if (lb !== -1 && rb > lb) { try { return JSON.parse(cleaned.slice(lb, rb + 1)); } catch {} }
  return null;
}

function extractJsonArray(text: string): any[] | null {
  const cleaned = String(text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned) return null;
  try { const p = JSON.parse(cleaned); if (Array.isArray(p)) return p; if (Array.isArray(p?.items)) return p.items; if (Array.isArray(p?.questions)) return p.questions; } catch {}
  const lb = cleaned.indexOf("[");
  const rb = cleaned.lastIndexOf("]");
  if (lb !== -1 && rb > lb) { try { const p = JSON.parse(cleaned.slice(lb, rb + 1)); if (Array.isArray(p)) return p; } catch {} }
  return null;
}

function parseBookendArray(text: string): any[] {
  let s = String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (!s) return [];
  const direct = extractJsonArray(s);
  if (direct) return direct;

  const lb = s.indexOf("[");
  const start = lb !== -1 ? lb + 1 : s.indexOf("{");
  if (start === -1) return [];

  const out: any[] = [];
  let i = start;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length || s[i] === "]") break;
    if (s[i] !== "{") break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    const objStart = i;
    for (; i < s.length; i++) {
      const ch = s[i];
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
    if (depth !== 0) break;
    const txt = s.slice(objStart, i);
    try { out.push(JSON.parse(txt)); }
    catch {
      try { out.push(JSON.parse(txt.replace(/,(\s*[}\]])/g, "$1"))); } catch {}
    }
  }
  return out;
}

function normalizeBookends(rows: any[]): Array<{ first_words?: string; last_words?: string; exact_text?: string }> {
  const out: Array<{ first_words?: string; last_words?: string; exact_text?: string }> = [];
  for (const row of rows) {
    const exact = String(row?.exact_text ?? row?.exact ?? row?.text ?? row?.question ?? "").trim();
    const first = String(row?.first_words ?? row?.first_6_words ?? row?.first_5_words ?? row?.first_5 ?? row?.first_4_words ?? row?.first ?? "").trim();
    const last = String(row?.last_words ?? row?.last_6_words ?? row?.last_5_words ?? row?.last_5 ?? row?.last_4_words ?? row?.last ?? "").trim();
    if (exact.length >= 5) out.push({ exact_text: exact });
    else if (first && last) out.push({ first_words: first, last_words: last });
  }
  return out;
}

function getBatchResponses(json: any): any[] {
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
  let inline = getBatchResponses(json);
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

const BOOKEND_SYSTEM = `You extract MCQ / short-answer questions from raw exam text.

The user gives you a chunk of PDF text that contains ONE OR MORE questions. Each "question" INCLUDES the question stem AND everything that belongs to it: MCQ options, True/False options, single-line answer, or a short verdict — up until (but not including) the next question.

IMPORTANT — do NOT skip questions:
- Options may appear as "A." "A)" "A-" "a-" "• a." "•" or plain bullets. Any label style counts.
- A question can have only ONE line after the stem (e.g. "Answer: True", "Answer: Aortic regurgitation"). It STILL counts — return it as an exact_text object.
- Question numbers may be "29." "29)" "30." "30)" etc. — treat every number as a NEW question, even if the options look sparse.
- "True regarding X:" and "Wrong about X:" style items ARE questions.
- Only return [] if the ENTIRE chunk is a cover page / table of contents / headings with no answered items.

For every distinct question in the text, return ONE object:
- If the FULL question+answers block is MORE than 15 words: return
  { "first_words": "<first 5 words of the stem, verbatim>", "last_words": "<last 5 words of the very LAST line that belongs to this question, verbatim>" }
- Otherwise: return
  { "exact_text": "<the entire question+answers block, verbatim>" }

"last_words" must be the last 5 words of the LAST option / answer line for this question. Never cut off before all options / the answer are included.

Return STRICT JSON — a single JSON ARRAY of these objects, in reading order. No markdown, no commentary. Example:

[
  {"first_words":"A 45 year old man","last_words":"D acute myocardial infarction here"},
  {"exact_text":"True regarding mitral stenosis: Hemoptysis is due to pulmonary hypertension. Answer: True."}
]`;

const SOLVER_SYSTEM = `You are a medical MCQ tutor. The user gives you ONE complete question block (stem + options, or an open question) plus a numbered list of SUBJECTS. In a SINGLE response you must: solve the question, explain it clearly, and assign it to the correct subject from the numbered list.

Return STRICT JSON only, no markdown fences:
{
  "prompt": "the question stem, plain text",
  "options": [{"letter":"A","body":"...","is_correct":true|false,"why":"one sentence: why this option is right or wrong"}],
  "concept": "≤8 words naming the core concept tested",
  "explanation": "GitHub-flavored Markdown with THREE sections in this exact order, separated by BLANK LINES:\\n\\n**Concept**\\n2-3 sentences explaining the underlying medical concept in enough detail that a student understands the mechanism, not just the fact.\\n\\n**Why the correct answer is right**\\n- 2-3 short bullets (one sentence each) covering the mechanism, the key clinical clue, and why this answer fits best.\\n\\n**Why the other options are wrong**\\n- **A.** one clear sentence with the specific reason\\n- **B.** one clear sentence with the specific reason\\n- **C.** one clear sentence with the specific reason\\n- **D.** one clear sentence with the specific reason",
  "summary_table": "A GitHub-flavored Markdown table. Every row MUST be on its OWN line separated by a real \\n. Header row is | Option | Verdict | One-line reason |. Separator row is |---|---|---|. Then ONE line per option. Put ✓ in the Verdict cell of the correct row and ✗ on the wrong rows.",
  "subject_index": <integer 1..N, or 0 if nothing fits>,
  "confidence": "high" | "medium" | "low"
}

Rules:
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true. If the source only shows the single correct answer (open question), INVENT 3 plausible-but-wrong distractors and mark them is_correct=false.
- Copy source options verbatim when present, in the source order. If a letter is marked correct in the source, keep that letter correct.
- subject_index MUST be an integer index from the provided SUBJECTS list — never a name.
- Choosing subject_index — critical rules:
  * Base the choice on the DISEASE/CONDITION the question is testing, decided from the STEM + the CORRECT ANSWER together. Ignore incorrect distractors and stray anatomy words.
  * If the stem says "rheumatic fever", "acute rheumatic fever", "rheumatic heart disease", "sore throat + joint swelling + young patient", or the correct answer is Group A / β-haemolytic streptococcus in a rheumatic context → this is Rheumatic fever, NOT Endocarditis.
  * If the stem asks about vegetations, IV drug users, prosthetic valve infection, Duke criteria, HACEK, Streptococcus viridans as a valve infection → Endocarditis.
  * "Streptococcus viridans" appearing as a wrong distractor in a rheumatic-fever question does NOT make the question Endocarditis.
  * Only pick 0 if literally no subject in the list fits.
- The summary_table MUST render as a real markdown table — every row starts on a NEW line. Do NOT emit the whole table on one line.
- Output JSON only.`;

function buildSubjectsBlock(candidates: string[]): string {
  if (!candidates.length) return "";
  const lines = candidates.map((c, i) => ` ${i + 1}. ${c}`).join("\n");
  return `SUBJECTS (pick exactly one index, or 0 if none fit):\n${lines}\n\n`;
}



// ------------- 1. createJobV2Ipad -------------

const CreateJobInput = z.object({
  courseId: z.string().uuid(),
  groupId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  pdfName: z.string().min(1).max(200),
  totalPages: z.number().int().min(1).max(2000),
  subjectCandidates: z.array(z.string().min(1).max(120)).max(200).default([]),
});

export const createJobV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);

    const { data: job, error } = await supabase.from(JOBS_TABLE).insert({
      user_id: userId,
      course_id: data.courseId,
      group_id: data.groupId,
      subject_id: data.subjectId ?? null,
      pdf_name: data.pdfName,
      total_pages: data.totalPages,
      subject_candidates: data.subjectCandidates,
      status: "running",
    }).select("id").single();
    if (error) throw error;

    const chunks: { chunkIndex: number; pageFrom: number; pageTo: number }[] = [];
    for (let i = 0, idx = 0; i < data.totalPages; i += CHUNK_PAGES, idx++) {
      chunks.push({
        chunkIndex: idx,
        pageFrom: i + 1,
        pageTo: Math.min(i + CHUNK_PAGES, data.totalPages),
      });
    }
    const rows = chunks.map((c) => ({
      job_id: job.id,
      chunk_index: c.chunkIndex,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      status: "pending" as const,
    }));
    const { data: inserted, error: cErr } = await supabase
      .from(CHUNKS_TABLE).insert(rows)
      .select("id, chunk_index, page_from, page_to");
    if (cErr) throw cErr;

    const sorted = (inserted ?? []).sort((a: any, b: any) => a.chunk_index - b.chunk_index);
    return {
      jobId: job.id as string,
      chunks: sorted.map((r: any) => ({
        chunkId: r.id as string,
        chunkIndex: r.chunk_index as number,
        pageFrom: r.page_from as number,
        pageTo: r.page_to as number,
      })),
    };
  });

// ------------- 2. extractBookendsV2Ipad -------------

const BookendInput = z.object({
  chunkId: z.string().uuid(),
  chunkText: z.string().min(5).max(60000),
});

export const extractBookendsV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    await supabase.from(CHUNKS_TABLE).update({
      status: "bookends", chunk_text: data.chunkText.slice(0, 60000), error: null,
    }).eq("id", data.chunkId);

    const body = {
      systemInstruction: { parts: [{ text: BOOKEND_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `--- CHUNK ---\n${data.chunkText}\n--- END ---` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 32768, responseMimeType: "application/json" },
    };
    const call = (m: string) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
    let res = await call(MODEL);
    let json = await res.json().catch(() => ({} as any));
    if (!res.ok && /no longer available|not found|is not supported/i.test(JSON.stringify(json))) {
      res = await call("gemini-flash-lite-latest");
      json = await res.json().catch(() => ({} as any));
    }
    if (!res.ok) {
      const msg = `Bookend call failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`;
      await supabase.from(CHUNKS_TABLE).update({ status: "failed", error: msg }).eq("id", data.chunkId);
      throw new Error(msg);
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const bookends = normalizeBookends(parseBookendArray(text));
    return { bookends };
  });

// ------------- 3. submitChunkV2Ipad -------------

const SubmitChunkInput = z.object({
  chunkId: z.string().uuid(),
  questionBlocks: z.array(z.string().min(3).max(6000)).min(1).max(200),
});

export const submitChunkV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitChunkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    const { data: chunk, error: cErr } = await supabase
      .from(CHUNKS_TABLE).select("id, job_id, chunk_index, status, results").eq("id", data.chunkId).single();
    if (cErr) throw cErr;
    const { data: job, error: jErr } = await supabase
      .from(JOBS_TABLE).select("id, subject_candidates").eq("id", chunk.job_id).single();
    if (jErr) throw jErr;
    const candidates: string[] = Array.isArray(job.subject_candidates) ? job.subject_candidates : [];
    const subjectsBlock = buildSubjectsBlock(candidates);

    // Defensive dedupe: identical / near-identical blocks land here when the
    // upstream extractor returns duplicate page text. Collapse them so we
    // don't waste batch requests and don't produce duplicate imports.
    const seen = new Set<string>();
    const questionBlocks = data.questionBlocks.filter((qb) => {
      const key = qb.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const previews = questionBlocks.map((q) => q.replace(/\s+/g, " ").trim().slice(0, 140));
    const previousResults = chunk.results && typeof chunk.results === "object" && !Array.isArray(chunk.results) ? chunk.results : {};
    const lowCoverage = chunk.status === "low_coverage" || Boolean((previousResults as any).low_coverage);
    await supabase.from(CHUNKS_TABLE).update({
      status: "submitting",
      question_blocks: questionBlocks,
      results: { ...previousResults, found_count: questionBlocks.length, submitted_count: 0, previews, low_coverage: lowCoverage },
      error: null,
    }).eq("id", data.chunkId);

    const requests = questionBlocks.map((qb, i) => ({
      request: {
        systemInstruction: { parts: [{ text: SOLVER_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [{ text: `${subjectsBlock}Solve this question and return JSON per the system prompt.\n\n--- QUESTION ---\n${qb}\n--- END ---` }],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
      },
      metadata: { key: `q-${i}` },
    }));

    const body = {
      batch: {
        display_name: `jbv2ipad-${chunk.job_id.slice(0, 8)}-c${chunk.chunk_index}-${Date.now()}`,
        input_config: { requests: { requests } },
      },
    };
    const submitted = await submitGeminiBatch({ apiKey, model: MODEL, body: body });
    const json: any = submitted.ok ? submitted.json : {};
    const res = { ok: submitted.ok, status: submitted.ok ? 200 : submitted.status };
    const submitError = submitted.ok ? "" : submitted.message;
    if (!res.ok) {
      const msg = submitError;
      await supabase.from(CHUNKS_TABLE).update({ status: "failed", error: msg }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    const batchName: string | undefined = json?.name || json?.metadata?.name;
    if (!batchName) throw new Error("Batch submit returned no name");

    await supabase.from(CHUNKS_TABLE).update({
      status: "awaiting_batch",
      question_blocks: questionBlocks,
      batch_id: batchName,
      results: { ...previousResults, found_count: questionBlocks.length, submitted_count: questionBlocks.length, previews, low_coverage: lowCoverage },
      error: null,
    }).eq("id", data.chunkId);

    return { batchId: batchName, count: data.questionBlocks.length };
  });

const MarkChunkInput = z.object({
  chunkId: z.string().uuid(),
  status: z.enum(["failed", "empty", "low_coverage", "pending", "text", "text_failed", "retrying", "bookends", "submitting"]),
  error: z.string().max(500).nullable().optional(),
  chunkText: z.string().max(60000).optional(),
  questionBlocks: z.array(z.string().min(1).max(6000)).max(200).optional(),
  results: z.any().optional(),
});
export const markChunkV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkChunkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const patch: any = { status: data.status, error: data.error ?? null };
    if (data.chunkText !== undefined) patch.chunk_text = data.chunkText.slice(0, 60000);
    if (data.questionBlocks !== undefined) patch.question_blocks = data.questionBlocks;
    if (data.results !== undefined) patch.results = data.results;
    await supabase.from(CHUNKS_TABLE).update(patch).eq("id", data.chunkId);
    return { ok: true };
  });

const RetryInput = z.object({ chunkId: z.string().uuid() });
export const retryChunkV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    await supabase.from(CHUNKS_TABLE).update({
      status: "pending", batch_id: null, error: null, imported_count: 0, results: null, question_blocks: null, chunk_text: null,
    }).eq("id", data.chunkId);
    return { ok: true };
  });

// ------------- 4. pollChunkV2Ipad -------------

const PollInput = z.object({ chunkId: z.string().uuid() });
export const pollChunkV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PollInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: chunk, error } = await supabase
      .from(CHUNKS_TABLE).select("id, batch_id, status").eq("id", data.chunkId).single();
    if (error) throw error;
    if (!chunk.batch_id) return { status: chunk.status };
    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, chunk.batch_id);
    const newStatus = mapBatchStatus(getBatchState(bj));
    const dbStatus =
      newStatus === "succeeded" ? "ready" :
      newStatus === "failed" || newStatus === "cancelled" || newStatus === "expired" ? "failed" :
      "awaiting_batch";
    const patch: any = { status: dbStatus };
    if (dbStatus === "failed") patch.error = JSON.stringify(bj?.error || bj?.response?.error || bj).slice(0, 500);
    await supabase.from(CHUNKS_TABLE).update(patch).eq("id", data.chunkId);
    return { status: dbStatus, providerState: getBatchState(bj) };
  });

// ------------- 5. importChunkV2Ipad -------------

const ImportInput = z.object({ chunkId: z.string().uuid() });
export const importChunkV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: chunk, error } = await supabase
      .from(CHUNKS_TABLE).select("id, job_id, batch_id, status, chunk_text").eq("id", data.chunkId).single();
    if (error) throw error;
    if (!chunk.batch_id) throw new Error("Chunk has no batch");
    const { data: job, error: jErr } = await supabase
      .from(JOBS_TABLE).select("id, subject_id, subject_candidates, group_id").eq("id", chunk.job_id).single();
    if (jErr) throw jErr;

    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, chunk.batch_id);
    if (mapBatchStatus(getBatchState(bj)) !== "succeeded") throw new Error("Batch not succeeded yet");
    const items = await downloadResponses(apiKey, bj);

    const candidates: string[] = Array.isArray(job.subject_candidates) ? job.subject_candidates : [];
    let idToUse: (string | null)[] = [];
    if (!job.subject_id && candidates.length) {
      const { data: subs } = await supabase.from("subjects")
        .select("id, name, group_id").eq("group_id", job.group_id);
      const byLower = new Map<string, string>((subs ?? []).map((s: any) => [String(s.name).trim().toLowerCase(), s.id]));
      idToUse = candidates.map((n) => byLower.get(String(n).trim().toLowerCase()) ?? null);
    }

    // Heading-based subject hint: if the chunk_text contains an ALL-CAPS or
    // Title-Case heading that EXACTLY matches one candidate (e.g. "RHEUMATIC
    // FEVER"), use that as the default when the model isn't confident.
    let headingHintIdx = 0;
    if (!job.subject_id && chunk.chunk_text && candidates.length) {
      const lowerText = String(chunk.chunk_text).toLowerCase();
      for (let ci = 0; ci < candidates.length; ci++) {
        const name = String(candidates[ci]).trim().toLowerCase();
        if (name.length < 3) continue;
        // must appear at start of a line to count as a heading
        const re = new RegExp(`(^|\\n)\\s*${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
        if (re.test(lowerText)) { headingHintIdx = ci + 1; break; }
      }
    }

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = it?.metadata?.key || `q-${i}`;
      try {
        const parsed = extractJsonObject(responseText(it));
        if (!parsed?.prompt || !Array.isArray(parsed?.options)) { failed++; errors.push(`${key}: malformed JSON`); continue; }

        let targetSubject: string | null = job.subject_id ?? null;
        if (!targetSubject) {
          let modelIdx = Number.isInteger(parsed.subject_index) ? parsed.subject_index : 0;
          const confidence = String(parsed.confidence || "").toLowerCase();
          // Override the model when it wasn't confident AND the page heading
          // clearly names one of the candidates.
          if (headingHintIdx > 0 && (modelIdx === 0 || confidence === "low")) modelIdx = headingHintIdx;
          if (modelIdx >= 1 && modelIdx <= idToUse.length) targetSubject = idToUse[modelIdx - 1];
          // Last-resort fallback to the heading hint even if the model returned garbage
          if (!targetSubject && headingHintIdx > 0 && headingHintIdx <= idToUse.length) {
            targetSubject = idToUse[headingHintIdx - 1];
          }
        }
        if (!targetSubject) { failed++; errors.push(`${key}: no subject resolved`); continue; }


        const { count } = await supabase.from("questions")
          .select("id", { count: "exact", head: true }).eq("subject_id", targetSubject);

        const explanation = [parsed.explanation || "", parsed.summary_table ? `\n\n${parsed.summary_table}` : ""].join("").trim() || null;

        const { data: q, error: qErr } = await supabase.from("questions").upsert(
          {
            subject_id: targetSubject,
            stem: parsed.prompt,
            explanation,
            sort_order: (count ?? 0) + 1,
          },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (qErr) throw qErr;
        if (!q?.id) { skipped++; continue; }

        const rows = parsed.options.map((o: any, idx: number) => ({
          question_id: q.id,
          label: o.letter || String.fromCharCode(65 + idx),
          text: o.body || o.text || "",
          is_correct: !!o.is_correct,
          sort_order: idx + 1,
        }));
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        inserted++;
      } catch (e: any) {
        failed++;
        errors.push(`${key}: ${e?.message || String(e)}`.slice(0, 200));
      }
    }

    await supabase.from(CHUNKS_TABLE).update({
      status: "imported",
      imported_count: inserted,
      results: { inserted, skipped, failed, errors: errors.slice(0, 10) },
    }).eq("id", data.chunkId);

    return { inserted, skipped, failed, errors: errors.slice(0, 10) };
  });

// ------------- listing -------------

export const listJobsV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase.from(JOBS_TABLE)
      .select("id, pdf_name, total_pages, subject_id, status, created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return { rows: data ?? [] };
  });

const JobInput = z.object({ jobId: z.string().uuid() });
export const getJobV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const [{ data: job, error: e1 }, { data: chunks, error: e2 }] = await Promise.all([
      supabase.from(JOBS_TABLE).select("*").eq("id", data.jobId).single(),
      supabase.from(CHUNKS_TABLE)
        .select("id, chunk_index, page_from, page_to, status, batch_id, imported_count, error, results, question_blocks, chunk_text")
        .eq("job_id", data.jobId).order("chunk_index"),
    ]);
    if (e1) throw e1; if (e2) throw e2;
    return { job, chunks: chunks ?? [] };
  });

const DeleteInput = z.object({ jobId: z.string().uuid() });
export const deleteJobV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from(JOBS_TABLE).delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });

// ------------- api key status -------------

export const getGeminiKeyStatusV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data } = await supabase
      .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
      .order("slot", { ascending: true }).limit(1).maybeSingle();
    if (!data?.api_key) return { present: false as const };
    const key = String(data.api_key);
    const masked = key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : "••••";
    return { present: true as const, slot: data.slot as number, masked };
  });

// ------------- server-side PDF text extraction (iPad safe) -------------
// The iPad client pre-splits the PDF into 2-page mini blobs and sends each
// one here as base64. We run pdfjs on the server (via unpdf, which is built
// for edge runtimes) so Safari never has to parse PDFs itself.

const ExtractPagesInput = z.object({
  // base64-encoded PDF bytes for a small (typically 2-page) mini PDF
  pdfBase64: z.string().min(20).max(8_000_000),
});

export const extractPagesTextV2Ipad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractPagesInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bin = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const doc = await getDocumentProxy(bin);
    // NOTE: passing pageNumbers to unpdf returns the WHOLE document text for
    // every request, which caused every page in a mini-PDF to look identical
    // and produced duplicate question blocks. Extract all pages in one call
    // instead, then dedupe adjacent identical pages defensively.
    let pages: string[] = [];
    try {
      const r: any = await extractText(doc, { mergePages: false } as any);
      const arr = Array.isArray(r?.text) ? r.text : [String(r?.text ?? "")];
      pages = arr.map((s: any) => String(s || "").replace(/\s+\n/g, "\n").trim());
    } catch {
      pages = [];
    }
    // Defensive dedupe: if adjacent pages are byte-identical, keep only one.
    const deduped: string[] = [];
    for (const p of pages) {
      if (deduped.length && deduped[deduped.length - 1] === p) continue;
      deduped.push(p);
    }
    return { pages: deduped };
  });
