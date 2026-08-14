// Jarvis Batch v2 iPad — IMAGE MODE.
// For equation/diagram-heavy exams that cannot be handled as pure text.
// Pipeline per page: render page -> Gemini "cutter" returns question bands ->
// browser crops + uploads each question image -> Gemini batch (50% off) solves
// each cropped image -> import as MCQs whose stem is the image itself.
//
// It writes to the SAME iPad tables as the text pipeline, so listing, polling,
// retry and deletion are shared. The text pipeline itself is untouched.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildReferenceBlock } from "@/lib/patch-ipad-prox.server";

const CUT_MODEL = "gemini-2.5-flash";
const SOLVE_MODEL = "gemini-2.5-flash";
const JOBS_TABLE = "jarvis_batch_v2_ipad_jobs";
const CHUNKS_TABLE = "jarvis_batch_v2_ipad_chunks";
export const QUESTION_IMAGE_BUCKET = "question-images";

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

function extractJson(text: string): any | null {
  const cleaned = String(text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch {}
  const lb = cleaned.search(/[[{]/);
  const rb = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (lb !== -1 && rb > lb) { try { return JSON.parse(cleaned.slice(lb, rb + 1)); } catch {} }
  return null;
}

function getBatchResponses(json: any): any[] {
  const cleanArray = (arr: any[]) => arr.filter((item) => (
    responseText(item)
    || item?.error
    || item?.response
    || item?.generateContentResponse
    || item?.metadata?.key
    || item?.key
  ));
  const c = [
    json?.response?.output?.inlinedResponses?.inlinedResponses,
    json?.response?.output?.inlinedResponses,
    json?.output?.inlinedResponses?.inlinedResponses,
    json?.output?.inlinedResponses,
    json?.response?.responses, json?.responses,
    json?.response?.inlinedResponses?.inlinedResponses, json?.response?.inlinedResponses,
    json?.inlinedResponses?.inlinedResponses, json?.inlinedResponses,
  ];
  for (const x of c) {
    if (!Array.isArray(x)) continue;
    const cleaned = cleanArray(x);
    if (cleaned.length) return cleaned;
  }

  const found: any[][] = [];
  const walk = (value: any, depth = 0) => {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      const cleaned = cleanArray(value);
      if (cleaned.length) found.push(cleaned);
      for (const child of value) walk(child, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const child of Object.values(value)) walk(child, depth + 1);
    }
  };
  walk(json);
  if (found.length) return found.sort((a, b) => b.length - a.length)[0];
  return [];
}
function getBatchState(json: any): string {
  return json?.metadata?.state || json?.response?.state || json?.state || "BATCH_STATE_UNKNOWN";
}
function mapBatchStatus(state: string) {
  const s = String(state || "").toUpperCase();
  if (s.endsWith("SUCCEEDED")) return "succeeded";
  if (s.endsWith("FAILED")) return "failed";
  if (s.endsWith("CANCELLED")) return "cancelled";
  if (s.endsWith("EXPIRED")) return "expired";
  if (s.endsWith("RUNNING")) return "running";
  return "pending";
}
function getResponsesFile(json: any): string | undefined {
  const file = json?.response?.output?.responsesFile || json?.output?.responsesFile
    || json?.response?.responsesFile || json?.responsesFile;
  if (typeof file === "string") return file;
  return file?.name || file?.uri || file?.file;
}
function responseText(item: any): string {
  return item?.response?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.body?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.body?.candidates?.[0]?.content?.parts?.[0]?.text
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
    if (!fr.ok) throw new Error(`Download responses failed (${fr.status}): ${await fr.text().catch(() => "")}`.slice(0, 500));
    const text = await fr.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
      try { inline = JSON.parse(trimmed); } catch { inline = []; }
    } else {
      inline = trimmed.split("\n").map((l) => l.trim()).filter(Boolean)
        .map((l) => { try { return JSON.parse(l.replace(/^,\s*/, "")); } catch { return null; } }).filter(Boolean);
    }
  }
  return inline ?? [];
}

// ---------------- prompts ----------------

const CUTTER_SYSTEM = `You are given ONE full page image of a printed exam paper (physics / chemistry / maths style, with equations, fractions, symbols and sometimes diagrams).

Your only job is to locate every distinct FULL QUESTION BLOCK on the page. A question block starts at the QUESTION NUMBER and includes the stem, every equation line, every diagram/graph/figure that belongs to it, and ALL printed answer choices (a, b, c, d). It ends right before the next question number begins.

CRITICAL: never return a box around only the graph/figure. If a diagram is in the middle of the question, expand the box upward to include the words/question number and downward to include all answer choices. The crop will be shown to students as the question itself, so the crop must be understandable without any surrounding page context.

Coordinate system: the page is normalized to 0..1000 on BOTH axes. y=0 is the very top of the page, y=1000 is the very bottom. x=0 is the left edge, x=1000 the right edge.

Rules:
- Return the questions in reading order. For a TWO-COLUMN page, return the whole left column top-to-bottom first, then the right column.
- y_top must start above the question number / first word of the stem, NOT at the diagram.
- y_bottom must end below the LAST answer choice, not below the diagram.
- For single-column layout set x_left=0 and x_right=1000. For a two-column layout, set x_left/x_right to that column only (e.g. 0..500 or 500..1000).
- Never let two questions overlap. Never merge two questions into one band.
- Ignore headers, footers, page numbers, instructions, and name/date lines.
- If the page has NO questions at all, return {"questions": []}.

Return STRICT JSON only:
{"questions":[{"n":1,"label":"Q1","y_top":40,"y_bottom":220,"x_left":0,"x_right":1000}]}`;

const IMAGE_SOLVER_SYSTEM = `You are an expert exam tutor. The user gives you ONE image containing a SINGLE exam question: its stem, any figure, and its answer choices (usually A/B/C/D or a/b/c/d), plus a numbered list of SUBJECTS.

IMPORTANT — the paper may already be answered. A yellow highlight, a red tick, a circle or an underline on ONE option is the printed answer key. Treat such a marking as a STRONG HINT, verify it by solving the question yourself, and only disagree with it if you are certain it is wrong. If nothing is marked, solve the question and choose the option you can prove.

Return STRICT JSON only (no markdown fences):
{
  "prompt": "short plain-text restatement of the question (max 200 chars), used only for indexing — no LaTeX",
  "letters": ["A","B","C","D"],
  "correct_letter": "A",
  "correct_option_text": "verbatim (short) text of the option you chose, e.g. 'only 1, 3, 4'",
  "concept": "≤8 words naming the core concept tested",
  "explanation": "GitHub-flavored Markdown with THREE sections separated by BLANK LINES:\\n\\n**Concept**\\n2-3 sentences on the principle and formula used. Define every symbol.\\n\\n**Why the correct answer is right**\\nStart with: 'Option **X** ($option text$) is correct.' then 2-4 short bullets with the calculation step by step, with units.\\n\\n**Why the other options are wrong**\\n- **B.** one sentence naming the specific mistake (list ONLY the letters that are NOT correct)\\n- **C.** ...\\n- **D.** ...",
  "subject_index": <integer 1..N, or 0 if nothing fits>,
  "confidence": "high" | "medium" | "low"
}

MATH FORMATTING (very important):
- Write EVERY formula, fraction, power, root and unit expression as LaTeX.
- Inline math uses single dollars: $F(r) = -\\frac{A}{r^{7}} + \\frac{B}{r^{13}}$.
- A standalone derivation line uses double dollars on its own line: $$r_{eq} = \\sqrt[6]{\\frac{B}{A}}$$
- Use \\frac, \\sqrt[n]{}, ^{ }, _{ }, \\cdot, \\times, \\approx, \\Delta.
- NEVER write powers as r^13 outside math, and never use ASCII forms like (B/A)^(1/6).
- Escape backslashes properly so the JSON stays valid.

CHEMISTRY FORMATTING (use whenever the question is chemistry / biochemistry / bioorganic):
- Write EVERY formula, structure fragment, ion and reaction with the mhchem command \\ce inside math dollars.
- Molecules: $\\ce{H2O}$, $\\ce{CH3CH2SH}$, $\\ce{CH3COOH}$ — never write bare CH3, H2O or CH3COOH as plain text, and never fake subscripts.
- Chains and bonds: $\\ce{CH3-CH2-CH2-SH}$, double/triple bonds $\\ce{CH2=CH2}$, $\\ce{HC#CH}$. Never draw bonds with – , —, ¶ or ASCII art.
- Ions and charges: $\\ce{NH4+}$, $\\ce{SO4^2-}$, $\\ce{OH-}$. Isotopes: $\\ce{^{13}C}$.
- Reactions on their own display line: $$\\ce{CH3COOH + NaOH -> CH3COONa + H2O}$$ ; equilibria use <=>; conditions go above the arrow: $\\ce{->[\\Delta]}$.
- NEVER leave a dangling bond hyphen at the start or end of a \\ce group ($\\ce{-CH(NH2)-}$ renders as a minus CHARGE, which is wrong). Write the whole molecule ($\\ce{CH3-CH(OH)-CH(NH2)-COOH}$), or name a group without bonds ($\\ce{NH2}$ group, $\\ce{COOH}$ group), or use R: $\\ce{R-CH(NH2)-R'}$.
- IUPAC names, class names and hybridization stay as NORMAL text (e.g. 3-mercaptopropanol-1, sp^3 written as $sp^{3}$).
- If an option is a DRAWN structure (ring / skeletal formula) that cannot be written linearly, do NOT invent a linear formula: refer to it by its letter and describe it in words (e.g. "option **c**, the cyclohexane ring carrying an isopropyl group at C-2"). The student already sees the image.
- Each bullet must be a complete sentence on its own line; never let a formula run into the next sentence without punctuation.

Other rules:
- "letters" must be the answer-choice letters actually printed in the image, uppercase, in order. Do NOT transcribe full option text into "letters" — the student sees the image.
- "correct_letter" must be one of "letters", and the letter you name inside the explanation MUST be the same letter.
- The "Why the other options are wrong" list must NEVER contain "correct_letter".
- subject_index MUST be an integer index from the SUBJECTS list, never a name. Use 0 only if nothing fits.
- Keep the whole JSON under 1200 words. Output JSON only.`;

const VERIFY_SYSTEM = `You are given ONE image of a single multiple-choice exam question that may already be answered on paper (yellow highlight, red tick, circle or underline).
Return STRICT JSON only: {"correct_letter":"A","reason":"marked in yellow" | "solved"}
Pick the printed marked option if there is one; otherwise solve the question and pick the provable option. The letter must be one of the printed choice letters, uppercase.`;

function buildSubjectsBlock(candidates: string[]): string {
  if (!candidates.length) return "";
  return `SUBJECTS (pick exactly one index, or 0 if none fit):\n${candidates.map((c, i) => ` ${i + 1}. ${c}`).join("\n")}\n\n`;
}

// ---- single-image helpers (used for repair + answer verification) ----

async function geminiImageCall(apiKey: string, system: string, base64: string, userText: string, maxTokens: number) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SOLVE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
          { text: userText },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    }),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Gemini call failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return extractJson(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function downloadCropBase64(supabase: any, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(QUESTION_IMAGE_BUCKET).download(path);
  if (error || !data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Letters listed under "Why the other options are wrong" imply the correct one.
function impliedCorrectLetter(explanation: string, letters: string[]): string | null {
  const idx = String(explanation || "").toLowerCase().indexOf("other options are wrong");
  if (idx === -1) return null;
  const tail = explanation.slice(idx);
  const wrong = new Set<string>();
  for (const m of tail.matchAll(/^\s*[-*]\s*\*\*\s*([A-Za-z])\s*[.)]?\s*\*\*/gm)) {
    wrong.add(m[1].toUpperCase());
  }
  if (wrong.size < Math.max(2, letters.length - 2)) return null;
  const remaining = letters.filter((l) => !wrong.has(l.toUpperCase()));
  return remaining.length === 1 ? remaining[0].toUpperCase() : null;
}


// ------------- 1. createImageJobIpad (ONE page per chunk) -------------

const CreateJobInput = z.object({
  courseId: z.string().uuid(),
  groupId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  pdfName: z.string().min(1).max(200),
  totalPages: z.number().int().min(1).max(2000),
  subjectCandidates: z.array(z.string().min(1).max(120)).max(200).default([]),
});

export const createImageJobIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);

    const { data: job, error } = await supabase.from(JOBS_TABLE).insert({
      user_id: userId,
      course_id: data.courseId,
      group_id: data.groupId,
      subject_id: data.subjectId ?? null,
      pdf_name: `🖼 ${data.pdfName}`,
      total_pages: data.totalPages,
      subject_candidates: data.subjectCandidates,
      status: "running",
    }).select("id").single();
    if (error) throw error;

    const rows = Array.from({ length: data.totalPages }, (_, i) => ({
      job_id: job.id,
      chunk_index: i,
      page_from: i + 1,
      page_to: i + 1,
      status: "pending" as const,
    }));
    const { data: inserted, error: cErr } = await supabase
      .from(CHUNKS_TABLE).insert(rows).select("id, chunk_index, page_from, page_to");
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

// ------------- 2. cutPageImageIpad -------------

const CutInput = z.object({
  chunkId: z.string().uuid(),
  imageBase64: z.string().min(100).max(12_000_000),
});

export const cutPageImageIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CutInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    await supabase.from(CHUNKS_TABLE).update({ status: "bookends", error: null }).eq("id", data.chunkId);

    const body = {
      systemInstruction: { parts: [{ text: CUTTER_SYSTEM }] },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: data.imageBase64 } },
          { text: "Locate every question on this page and return the JSON described in the system prompt." },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" },
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CUT_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const msg = `Cut call failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`;
      await supabase.from(CHUNKS_TABLE).update({ status: "failed", error: msg }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    const parsed = extractJson(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    const raw: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];

    const regions = raw
      .map((r: any, i: number) => ({
        n: Number(r?.n ?? i + 1),
        label: String(r?.label ?? `Q${i + 1}`).slice(0, 40),
        y_top: Number(r?.y_top ?? 0),
        y_bottom: Number(r?.y_bottom ?? 0),
        x_left: Number(r?.x_left ?? 0),
        x_right: Number(r?.x_right ?? 1000),
      }))
      .filter((r) => Number.isFinite(r.y_top) && Number.isFinite(r.y_bottom) && r.y_bottom - r.y_top >= 15);

    return { regions };
  });

// ------------- 3. submitImageChunkIpad -------------

const SubmitInput = z.object({
  chunkId: z.string().uuid(),
  crops: z.array(z.object({
    path: z.string().min(3).max(300),
    base64: z.string().min(100).max(6_000_000),
    label: z.string().max(300).optional(),
  })).min(1).max(30),
});

export const submitImageChunkIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    const { data: chunk, error: cErr } = await supabase
      .from(CHUNKS_TABLE).select("id, job_id, chunk_index").eq("id", data.chunkId).single();
    if (cErr) throw cErr;
    const { data: job, error: jErr } = await supabase
      .from(JOBS_TABLE).select("id, subject_candidates, reference_book").eq("id", chunk.job_id).single();
    if (jErr) throw jErr;
    const subjectsBlock = buildReferenceBlock(job.reference_book)
      + buildSubjectsBlock(Array.isArray(job.subject_candidates) ? job.subject_candidates : []);

    const paths = data.crops.map((c) => c.path);
    const previews = data.crops.map((c, i) => c.label || `Q${i + 1} (image)`);

    await supabase.from(CHUNKS_TABLE).update({
      status: "submitting",
      question_blocks: paths,
      results: { mode: "image", found_count: paths.length, previews },
      error: null,
    }).eq("id", data.chunkId);

    const requests = data.crops.map((c, i) => ({
      request: {
        systemInstruction: { parts: [{ text: IMAGE_SOLVER_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: c.base64 } },
            { text: `${subjectsBlock}Solve this single question image and return JSON per the system prompt.` },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" },
      },
      metadata: { key: `img-${i}` },
    }));

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SOLVE_MODEL}:batchGenerateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        batch: {
          display_name: `jbimg-${chunk.job_id.slice(0, 8)}-p${chunk.chunk_index + 1}-${Date.now()}`,
          input_config: { requests: { requests } },
        },
      }),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const msg = `Batch submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`;
      await supabase.from(CHUNKS_TABLE).update({ status: "failed", error: msg }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    const batchName: string | undefined = json?.name || json?.metadata?.name;
    if (!batchName) throw new Error("Batch submit returned no name");

    await supabase.from(CHUNKS_TABLE).update({
      status: "awaiting_batch",
      batch_id: batchName,
      question_blocks: paths,
      results: { mode: "image", found_count: paths.length, submitted_count: paths.length, previews },
      error: null,
    }).eq("id", data.chunkId);

    return { batchId: batchName, count: paths.length };
  });

// ------------- 4. importImageChunkIpad -------------

const ImportInput = z.object({ chunkId: z.string().uuid() });

export const importImageChunkIpad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: chunk, error } = await supabase
      .from(CHUNKS_TABLE).select("id, job_id, batch_id, question_blocks, page_from").eq("id", data.chunkId).single();
    if (error) throw error;
    if (!chunk.batch_id) throw new Error("Chunk has no batch");
    const { data: job, error: jErr } = await supabase
      .from(JOBS_TABLE).select("id, subject_id, subject_candidates, group_id, reference_book").eq("id", chunk.job_id).single();
    if (jErr) throw jErr;

    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, chunk.batch_id);
    if (mapBatchStatus(getBatchState(bj)) !== "succeeded") throw new Error("Batch not succeeded yet");
    const items = await downloadResponses(apiKey, bj);

    const paths: string[] = Array.isArray(chunk.question_blocks) ? chunk.question_blocks : [];
    const candidates: string[] = Array.isArray(job.subject_candidates) ? job.subject_candidates : [];
    const subjectsBlock = buildReferenceBlock(job.reference_book) + buildSubjectsBlock(candidates);

    if (paths.length && items.length === 0) {
      const msg = `Gemini returned no solved answers for ${paths.length} uploaded question image${paths.length === 1 ? "" : "s"}. The pictures are still stored; use check/import again, or retry this page if it repeats.`;
      await supabase.from(CHUNKS_TABLE).update({
        status: "ready",
        error: msg,
        results: { mode: "image", found_count: paths.length, inserted: 0, skipped: 0, failed: 0, errors: [msg] },
      }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    let idToUse: (string | null)[] = [];
    if (!job.subject_id && candidates.length) {
      const { data: subs } = await supabase.from("subjects").select("id, name").eq("group_id", job.group_id);
      const byLower = new Map<string, string>((subs ?? []).map((s: any) => [String(s.name).trim().toLowerCase(), s.id]));
      idToUse = candidates.map((n) => byLower.get(String(n).trim().toLowerCase()) ?? null);
    }

    let inserted = 0, skipped = 0, failed = 0, repaired = 0, verified = 0;
    const errors: string[] = [];

    // every crop must be accounted for: index -> batch item (or undefined)
    const byIndex = new Map<number, any>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = it?.metadata?.key || it?.key || it?.request?.metadata?.key || `img-${i}`;
      const m = String(key).match(/img-(\d+)/);
      const idx = m ? Number(m[1]) : i;
      if (!byIndex.has(idx)) byIndex.set(idx, it);
    }
    const total = Math.max(paths.length, items.length);

    for (let idx = 0; idx < total; idx++) {
      const it = byIndex.get(idx);
      const key = `img-${idx}`;
      try {
        const imagePath = paths[idx] ?? null;
        let parsed = it && !it?.error ? extractJson(responseText(it)) : null;

        // ---- repair pass: re-solve this single crop when the batch item is unusable
        if ((!parsed?.correct_letter) && imagePath) {
          const b64 = await downloadCropBase64(supabase, imagePath);
          if (b64) {
            try {
              const again = await geminiImageCall(
                apiKey,
                IMAGE_SOLVER_SYSTEM,
                b64,
                `${subjectsBlock}Solve this single question image and return JSON per the system prompt.`,
                8192,
              );
              if (again?.correct_letter) { parsed = again; repaired++; }
            } catch (e: any) {
              errors.push(`${key}: repair failed — ${(e?.message || String(e)).slice(0, 120)}`);
            }
          }
        }

        if (!parsed?.correct_letter) {
          failed++;
          errors.push(`${key}: ${it?.error ? JSON.stringify(it.error).slice(0, 140) : "no usable answer from Gemini"}`);
          continue;
        }

        let targetSubject: string | null = job.subject_id ?? null;
        if (!targetSubject) {
          const modelIdx = Number.isInteger(parsed.subject_index) ? parsed.subject_index : 0;
          if (modelIdx >= 1 && modelIdx <= idToUse.length) targetSubject = idToUse[modelIdx - 1];
          if (!targetSubject) targetSubject = idToUse.find(Boolean) ?? null;
        }
        if (!targetSubject) { failed++; errors.push(`${key}: no subject resolved`); continue; }
        if (!imagePath) { failed++; errors.push(`${key}: missing crop path`); continue; }

        const letters: string[] = Array.isArray(parsed.letters) && parsed.letters.length >= 2
          ? parsed.letters.map((l: any) => String(l).trim().toUpperCase().slice(0, 2))
          : ["A", "B", "C", "D"];
        let correct = String(parsed.correct_letter).trim().toUpperCase().slice(0, 2);

        // ---- answer consistency: the explanation itself says which letters are wrong
        const explanation = String(parsed.explanation || "").trim();
        const implied = impliedCorrectLetter(explanation, letters);
        const lowConfidence = String(parsed.confidence || "").toLowerCase() === "low";
        if ((implied && implied !== correct) || lowConfidence) {
          const b64 = await downloadCropBase64(supabase, imagePath);
          let resolved: string | null = null;
          if (b64) {
            try {
              const v = await geminiImageCall(apiKey, VERIFY_SYSTEM, b64, "Which printed option letter is the correct answer?", 512);
              const vl = String(v?.correct_letter || "").trim().toUpperCase().slice(0, 2);
              if (vl && letters.includes(vl)) resolved = vl;
            } catch { /* fall back below */ }
          }
          const finalLetter = resolved ?? implied ?? correct;
          if (finalLetter !== correct) { correct = finalLetter; verified++; }
        }
        if (!letters.includes(correct)) correct = letters[0];

        const { count } = await supabase.from("questions")
          .select("id", { count: "exact", head: true }).eq("subject_id", targetSubject);

        // The image IS the question. The stem is a short indexing line so the
        // stem_hash dedupe still works and lists stay readable.
        const stem = String(parsed.prompt || `Question ${idx + 1} (page ${chunk.page_from})`)
          .replace(/\s+/g, " ").trim().slice(0, 300);

        const { data: q, error: qErr } = await supabase.from("questions").upsert(
          {
            subject_id: targetSubject,
            stem,
            explanation: explanation || null,
            image_url: imagePath,
            sort_order: (count ?? 0) + 1,
          },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (qErr) throw qErr;
        if (!q?.id) { skipped++; continue; }

        const rows = letters.map((l, j) => ({
          question_id: q.id,
          label: l,
          text: null as string | null,
          is_correct: l === correct,
          sort_order: j + 1,
        }));
        if (!rows.some((r) => r.is_correct)) rows[0].is_correct = true;
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        inserted++;
      } catch (e: any) {
        failed++;
        errors.push(`${key}: ${e?.message || String(e)}`.slice(0, 200));
      }
    }


    if (inserted === 0 && skipped === 0 && failed === 0) {
      const msg = `Nothing was imported from ${paths.length || items.length} image question${(paths.length || items.length) === 1 ? "" : "s"}. Gemini returned no usable solved items.`;
      await supabase.from(CHUNKS_TABLE).update({
        status: "ready",
        error: msg,
        results: { mode: "image", inserted, skipped, failed, errors: [msg] },
      }).eq("id", data.chunkId);
      throw new Error(msg);
    }
    if (inserted === 0 && failed > 0) {
      const msg = `No image questions were imported. ${failed} Gemini answer${failed === 1 ? "" : "s"} could not be used: ${errors.slice(0, 3).join("; ")}`.slice(0, 500);
      await supabase.from(CHUNKS_TABLE).update({
        status: "ready",
        error: msg,
        results: { mode: "image", inserted, skipped, failed, errors: errors.slice(0, 10) },
      }).eq("id", data.chunkId);
      throw new Error(msg);
    }

    await supabase.from(CHUNKS_TABLE).update({
      status: "imported",
      imported_count: inserted,
      results: { mode: "image", inserted, skipped, failed, repaired, verified, found_count: total, errors: errors.slice(0, 10) },
    }).eq("id", data.chunkId);

    return { inserted, skipped, failed, repaired, verified, errors: errors.slice(0, 10) };
  });

