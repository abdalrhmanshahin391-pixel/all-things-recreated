// Sonic — immediate overnight PDF import.
//
// Flow (client drives, sequentially, per PDF, per 2-page chunk):
//   1. createSonicJob({ pdfs: [{ fileName, totalPages, courseId, groupId, subjectId?, subjectCandidates }], hint, skipDuplicates })
//   2. For each PDF, in order:
//      a. For each 2-page chunk, in order:
//         - client extracts pure text (pdfjs)
//         - client calls extractSonicBookends -> Gemini SYNC returns bookends[]
//         - client slices locally with bookend-slicer
//         - for EACH slice: client calls solveSonicQuestion -> Gemini SYNC returns MCQ JSON
//                            then calls importSonicQuestion -> writes rows immediately
//         - move on to the next chunk
//
// No batch API, no polling. Everything is immediate. If the bookends call
// returns an empty array, we mark the chunk empty and keep going.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-flash-lite-latest";

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
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim()
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
    let depth = 0, inStr = false, esc = false;
    const objStart = i;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    if (depth !== 0) break;
    const txt = s.slice(objStart, i);
    try { out.push(JSON.parse(txt)); }
    catch { try { out.push(JSON.parse(txt.replace(/,(\s*[}\]])/g, "$1"))); } catch {} }
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

// ------------- prompts -------------

const BOOKEND_SYSTEM = `You extract MCQ / short-answer questions from raw exam text.

The user gives you a chunk of PDF text that contains ONE OR MORE questions. Each "question" INCLUDES the question stem AND all of its answer options (A, B, C, D...) or the single answer after a "?" for open-answer items.

If the chunk is a cover page, table of contents, topic list, headings only, or has no complete question with answer/options, return [] immediately.

For every distinct question in the text, return ONE object:
- If the FULL question+answers block is MORE than 15 words: return
  { "first_words": "<first 5 words of the stem, verbatim>", "last_words": "<last 5 words of the FINAL answer/option, verbatim>" }
- Otherwise: return
  { "exact_text": "<the entire question+answers block, verbatim>" }

"last_words" must be the last 5 words of the LAST answer option. Never cut off before all answers are included.

Return STRICT JSON — a single JSON ARRAY of these objects, in reading order. No markdown, no commentary.`;

const SOLVER_SYSTEM = `You are a medical MCQ tutor. The user gives you ONE complete question block (stem + options, or an open question) plus a numbered list of SUBJECTS. Solve it, explain it, and pick the best subject INDEX from the list.

Return STRICT JSON only, no markdown fences:
{
  "prompt": "the question stem, plain text",
  "options": [{"letter":"A","body":"...","is_correct":true|false,"why":"one sentence: why this option is right or wrong"}],
  "concept": "≤8 words naming the core concept tested",
  "explanation": "GitHub-flavored Markdown: **Concept** paragraph, then **Why the correct answer is right** bullets, then **Why the other options are wrong** bullets",
  "summary_table": "markdown table: | Option | Verdict | One-line reason | with a ✓ on the correct row",
  "subject_index": <integer 1..N, or 0 if nothing fits>,
  "confidence": "high" | "medium" | "low"
}

Rules:
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true. If the source only shows the single correct answer (open question), INVENT 3 plausible-but-wrong distractors and mark them is_correct=false.
- Copy source options verbatim when present, in source order. If a letter is marked correct in the source, keep that letter correct.
- subject_index MUST be an integer index from the provided SUBJECTS list — never a name. Return 0 only if genuinely none fit.
- Output JSON only.`;

function buildSubjectsBlock(candidates: string[]): string {
  if (!candidates.length) return "";
  const lines = candidates.map((c, i) => ` ${i + 1}. ${c}`).join("\n");
  return `SUBJECTS (pick exactly one index, or 0 if none fit):\n${lines}\n\n`;
}

async function geminiGenerate(apiKey: string, model: string, body: any): Promise<any> {
  const call = (m: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  let res = await call(model);
  let json = await res.json().catch(() => ({} as any));
  if (!res.ok && model !== DEFAULT_MODEL && /no longer available|not found|is not supported/i.test(JSON.stringify(json))) {
    res = await call(DEFAULT_MODEL);
    json = await res.json().catch(() => ({} as any));
  }
  if (!res.ok) throw new Error(`Gemini ${model} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}


// ------------- 1. createSonicJob -------------

const PdfEntry = z.object({
  fileName: z.string().min(1).max(200),
  totalPages: z.number().int().min(1).max(2000),
  courseId: z.string().uuid(),
  groupId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  subjectCandidates: z.array(z.string().min(1).max(120)).max(200).default([]),
});
const CreateJobInput = z.object({
  pdfs: z.array(PdfEntry).min(1).max(20),
  hint: z.string().max(500).nullable().optional(),
  skipDuplicates: z.boolean().default(false),
  autoRetry: z.boolean().default(true),
  model: z.string().max(80).optional(),
});

export const createSonicJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("sonic_jobs").insert({
      user_id: userId,
      status: "running",
      provider: "gemini",
      model: data.model || DEFAULT_MODEL,
      hint: data.hint ?? null,
      skip_duplicates: data.skipDuplicates,
      auto_retry: data.autoRetry,
    }).select("id").single();
    if (error) throw error;

    const pdfRows = data.pdfs.map((p, i) => ({
      job_id: job.id,
      file_name: p.fileName,
      total_pages: p.totalPages,
      course_id: p.courseId,
      group_id: p.groupId,
      subject_id: p.subjectId ?? null,
      subject_candidates: p.subjectCandidates,
      status: "pending" as const,
      sort_order: i,
    }));
    const { data: insertedPdfs, error: pErr } = await supabase.from("sonic_pdfs")
      .insert(pdfRows).select("id, file_name, total_pages, sort_order");
    if (pErr) throw pErr;
    const sortedPdfs = (insertedPdfs ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);

    // Plan 2-page chunks per PDF.
    const CHUNK_PAGES = 2;
    const allChunks: any[] = [];
    for (const p of sortedPdfs) {
      for (let i = 0, idx = 0; i < p.total_pages; i += CHUNK_PAGES, idx++) {
        allChunks.push({
          pdf_id: p.id,
          chunk_index: idx,
          page_from: i + 1,
          page_to: Math.min(i + CHUNK_PAGES, p.total_pages),
          status: "pending" as const,
        });
      }
    }
    const { data: insertedChunks, error: cErr } = await supabase.from("sonic_chunks")
      .insert(allChunks).select("id, pdf_id, chunk_index, page_from, page_to");
    if (cErr) throw cErr;

    // Group chunks by pdf_id for the client.
    const byPdf = new Map<string, any[]>();
    for (const c of insertedChunks ?? []) {
      const list = byPdf.get(c.pdf_id) ?? [];
      list.push(c);
      byPdf.set(c.pdf_id, list);
    }

    return {
      jobId: job.id as string,
      pdfs: sortedPdfs.map((p: any) => ({
        pdfId: p.id as string,
        fileName: p.file_name as string,
        totalPages: p.total_pages as number,
        sortOrder: p.sort_order as number,
        chunks: (byPdf.get(p.id) ?? [])
          .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
          .map((c: any) => ({
            chunkId: c.id as string,
            chunkIndex: c.chunk_index as number,
            pageFrom: c.page_from as number,
            pageTo: c.page_to as number,
          })),
      })),
    };
  });

// ------------- 2. extractSonicBookends -------------

const BookendInput = z.object({
  chunkId: z.string().uuid(),
  chunkText: z.string().min(5).max(60000),
  model: z.string().max(80).optional(),
});

export const extractSonicBookends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);
    const model = data.model || DEFAULT_MODEL;

    await supabase.from("sonic_chunks").update({
      status: "bookends",
      chunk_text: data.chunkText.slice(0, 60000),
      error: null,
    }).eq("id", data.chunkId);

    const body = {
      systemInstruction: { parts: [{ text: BOOKEND_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `--- CHUNK ---\n${data.chunkText}\n--- END ---` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 32768, responseMimeType: "application/json" },
    };
    let json: any;
    try {
      json = await geminiGenerate(apiKey, model, body);
    } catch (e: any) {
      const msg = e?.message?.slice(0, 500) || String(e).slice(0, 500);
      await supabase.from("sonic_chunks").update({ status: "failed", error: msg }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const bookends = normalizeBookends(parseBookendArray(text));
    return { bookends };
  });

// ------------- 3. solveSonicQuestion -------------

const SolveInput = z.object({
  chunkId: z.string().uuid(),
  question: z.string().min(3).max(6000),
  subjectCandidates: z.array(z.string().min(1).max(120)).max(200).default([]),
  hint: z.string().max(500).nullable().optional(),
  model: z.string().max(80).optional(),
});

export const solveSonicQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SolveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);
    const model = data.model || DEFAULT_MODEL;

    const subjectsBlock = buildSubjectsBlock(data.subjectCandidates);
    const hint = data.hint?.trim() ? `HINT FROM ADMIN: ${data.hint.trim()}\n\n` : "";
    const body = {
      systemInstruction: { parts: [{ text: SOLVER_SYSTEM }] },
      contents: [{
        role: "user",
        parts: [{
          text: `${subjectsBlock}${hint}Solve this question and return JSON per the system prompt.\n\n--- QUESTION ---\n${data.question}\n--- END ---`,
        }],
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
    };
    const json = await geminiGenerate(apiKey, model, body);
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJsonObject(text);
    if (!parsed || !parsed.prompt || !Array.isArray(parsed.options)) {
      throw new Error("Solver returned malformed JSON");
    }
    return { solved: parsed };
  });

// ------------- 4. importSonicQuestion -------------

const ImportInput = z.object({
  pdfId: z.string().uuid(),
  chunkId: z.string().uuid(),
  solved: z.any(),
  skipDuplicates: z.boolean().default(false),
});

export const importSonicQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const parsed = data.solved;
    if (!parsed?.prompt || !Array.isArray(parsed?.options)) throw new Error("Bad solved payload");

    // Load pdf for subject resolution.
    const { data: pdf, error: pErr } = await supabase
      .from("sonic_pdfs")
      .select("id, group_id, subject_id, subject_candidates, imported_count")
      .eq("id", data.pdfId).single();
    if (pErr) throw pErr;

    const candidates: string[] = Array.isArray(pdf.subject_candidates) ? pdf.subject_candidates : [];
    let targetSubject: string | null = pdf.subject_id ?? null;
    if (!targetSubject && candidates.length) {
      const idx = Number.isInteger(parsed.subject_index) ? parsed.subject_index : 0;
      if (idx >= 1 && idx <= candidates.length) {
        const name = candidates[idx - 1];
        const { data: sub } = await supabase.from("subjects")
          .select("id").eq("group_id", pdf.group_id).ilike("name", name).limit(1).maybeSingle();
        if (sub?.id) targetSubject = sub.id;
      }
    }
    if (!targetSubject) return { inserted: false, skipped: true, reason: "no subject resolved" };

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
      { onConflict: "subject_id,stem_hash", ignoreDuplicates: data.skipDuplicates },
    ).select("id").maybeSingle();
    if (qErr) throw qErr;
    if (!q?.id) return { inserted: false, skipped: true, reason: "duplicate" };

    const rows = parsed.options.map((o: any, idx: number) => ({
      question_id: q.id,
      label: o.letter || String.fromCharCode(65 + idx),
      text: o.body || o.text || "",
      is_correct: !!o.is_correct,
      sort_order: idx + 1,
    }));
    const { error: oErr } = await supabase.from("question_options").insert(rows);
    if (oErr) throw oErr;

    // Increment counters on pdf + chunk.
    await supabase.from("sonic_pdfs").update({
      imported_count: (pdf.imported_count || 0) + 1,
    }).eq("id", data.pdfId);
    const { data: ch } = await supabase.from("sonic_chunks")
      .select("imported_count").eq("id", data.chunkId).single();
    await supabase.from("sonic_chunks").update({
      imported_count: (ch?.imported_count || 0) + 1,
    }).eq("id", data.chunkId);

    return { inserted: true, skipped: false, questionId: q.id as string, subjectId: targetSubject };
  });

// ------------- 5. markSonicChunk / markSonicPdf / finishSonicJob -------------

const MarkChunkInput = z.object({
  chunkId: z.string().uuid(),
  status: z.enum(["pending", "text", "bookends", "solving", "importing", "done", "empty", "failed"]),
  error: z.string().max(500).nullable().optional(),
  chunkText: z.string().max(60000).optional(),
  questionBlocks: z.array(z.string().min(1).max(6000)).max(200).optional(),
  results: z.any().optional(),
});
export const markSonicChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkChunkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const patch: any = { status: data.status, error: data.error ?? null };
    if (data.chunkText !== undefined) patch.chunk_text = data.chunkText.slice(0, 60000);
    if (data.questionBlocks !== undefined) patch.question_blocks = data.questionBlocks;
    if (data.results !== undefined) patch.results = data.results;
    await supabase.from("sonic_chunks").update(patch).eq("id", data.chunkId);
    return { ok: true };
  });

const MarkPdfInput = z.object({
  pdfId: z.string().uuid(),
  status: z.enum(["pending", "running", "done", "failed"]),
  error: z.string().max(500).nullable().optional(),
});
export const markSonicPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkPdfInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    await supabase.from("sonic_pdfs").update({ status: data.status, error: data.error ?? null }).eq("id", data.pdfId);
    return { ok: true };
  });

const FinishJobInput = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["running", "done", "failed", "cancelled"]),
});
export const finishSonicJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FinishJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    await supabase.from("sonic_jobs").update({ status: data.status }).eq("id", data.jobId);
    return { ok: true };
  });

// ------------- listing / details / delete -------------

export const listSonicJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase.from("sonic_jobs")
      .select("id, status, model, hint, created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return { rows: data ?? [] };
  });

const JobInput = z.object({ jobId: z.string().uuid() });
export const getSonicJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const [{ data: job, error: e1 }, { data: pdfs, error: e2 }, { data: chunks, error: e3 }] = await Promise.all([
      supabase.from("sonic_jobs").select("*").eq("id", data.jobId).single(),
      supabase.from("sonic_pdfs").select("*").eq("job_id", data.jobId).order("sort_order"),
      supabase.from("sonic_chunks").select("id, pdf_id, chunk_index, page_from, page_to, status, imported_count, error, results, question_blocks")
        .in("pdf_id", (
          await supabase.from("sonic_pdfs").select("id").eq("job_id", data.jobId)
        ).data?.map((r: any) => r.id) ?? [])
        .order("chunk_index"),
    ]);
    if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
    return { job, pdfs: pdfs ?? [], chunks: chunks ?? [] };
  });

const DeleteInput = z.object({ jobId: z.string().uuid() });
export const deleteSonicJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from("sonic_jobs").delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });

// Reuse the same gemini key status shape as v2.
export const getSonicKeyStatus = createServerFn({ method: "POST" })
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
