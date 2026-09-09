// AquaVisionX — two-stage Gemini BATCH (50% price) machine.
//
// Stage 1 (read): every PDF page is sent as ONE batch request asking only for
// the questions + options as strict JSON (no answers → tiny output tokens).
// Stage 2 (solve): every question is sent alone as PURE TEXT in a second batch
// asking for the correct answer, concept and explanations.
// Import is refused server-side until every item is solved.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "gemini-2.5-flash-lite";
const JOBS = "aquavision_jobs";
const PAGES = "aquavision_pages";
const ITEMS = "aquavision_items";

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase, userId } as { supabase: any; userId: string };
}

/** Optional "answer according to this textbook" block; empty when unset. */
function buildReferenceBlock(book: any): string {
  const name = String(book ?? "").trim();
  if (!name) return "";
  return `REFERENCE TEXTBOOK — "${name}".
Answer and explain STRICTLY according to this textbook:
- use its terminology, classifications, staging and cut-off values;
- name the book once inside the Concept section;
- if the printed answer key disagrees with the textbook, choose the option the textbook supports.

`;
}

function isSafeResourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^127\./.test(host) || /^10\./.test(host)
      || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host) || host === "::1") return false;
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    return true;
  } catch { return false; }
}

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

async function buildResourceParts(supabase: any, job: any): Promise<any[]> {
  const parts: any[] = [];
  const kind = String(job?.resource_kind ?? "");
  if (kind === "text" && job?.resource_text) {
    parts.push({ text: `SUPPLIED SOURCE (pasted by the administrator):\n${String(job.resource_text).slice(0, 60_000)}\nEND SUPPLIED SOURCE` });
  } else if (kind === "pdf" && job?.resource_storage_path) {
    const { data, error } = await supabase.storage.from("aquavision-resources").download(job.resource_storage_path);
    if (error || !data) throw new Error("The resource PDF could not be loaded. Remove it or upload it again.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    parts.push({ inlineData: { mimeType: "application/pdf", data: btoa(binary) } });
    parts.push({ text: `The attached PDF is the administrator's supplied source (${job.resource_name || "resource PDF"}). Use it as the authority for the answer.` });
  } else if (kind === "link" && job?.resource_url) {
    const url = String(job.resource_url);
    if (!isSafeResourceUrl(url)) throw new Error("Resource links must be safe public HTTPS addresses.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try { response = await fetch(url, { redirect: "error", signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok) throw new Error(`The resource link could not be opened (${response.status}).`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 5_000_000) throw new Error("The linked resource is too large (maximum 5 MB).");
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 5_000_000) throw new Error("The linked resource is too large (maximum 5 MB).");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    if (type.includes("application/pdf")) parts.push({ inlineData: { mimeType: "application/pdf", data: btoa(binary) } });
    else if (type.includes("text/") || type.includes("html")) {
      const text = new TextDecoder().decode(bytes);
      parts.push({ text: `SUPPLIED SOURCE (${url}):\n${stripHtml(text).slice(0, 60_000)}\nEND SUPPLIED SOURCE` });
    } else throw new Error("The resource link must open a webpage, text file, or PDF.");
  }
  return parts;
}

async function getGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
    .order("slot", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/gemini-keys.");
  return data.api_key as string;
}

function stripFences(text: string): string {
  return String(text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}
function parseJsonObject(text: string): any | null {
  const s = stripFences(text);
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  const lb = s.indexOf("{"), rb = s.lastIndexOf("}");
  if (lb !== -1 && rb > lb) { try { return JSON.parse(s.slice(lb, rb + 1)); } catch {} }
  return null;
}
function parseQuestionsPayload(text: string): any[] {
  const s = stripFences(text);
  if (!s) return [];
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.questions)) return p.questions;
    if (Array.isArray(p?.items)) return p.items;
  } catch {}
  const obj = parseJsonObject(s);
  if (Array.isArray(obj?.questions)) return obj.questions;
  const lb = s.indexOf("["), rb = s.lastIndexOf("]");
  if (lb !== -1 && rb > lb) { try { const p = JSON.parse(s.slice(lb, rb + 1)); if (Array.isArray(p)) return p; } catch {} }
  return [];
}

type AnswerMode = "single" | "multiple";

const COMBO_RE = /^\s*(?:[A-Da-d]\s*[.)\-:]\s*)?\d+(?:\s*(?:[,./+;&]|\band\b|\s)\s*\d+)+\s*[.)]?\s*$/i;

function parseComboSets(source: any): string[][] {
  const raw = Array.isArray(source) ? source : [];
  const sets: string[][] = [];
  for (const entry of raw) {
    const nums = Array.isArray(entry)
      ? entry.map((v: unknown) => String(v).trim()).filter((v) => /^\d+$/.test(v))
      : (String(entry?.text ?? entry ?? "").match(/\d+/g) ?? []);
    const uniq = [...new Set(nums)];
    if (uniq.length >= 2) sets.push(uniq);
  }
  return sets;
}

function normalizeCombinationQuestion(raw: any): {
  stem: string;
  options: Array<{ letter: string; text: string }>;
  answerMode: AnswerMode;
  comboSets: string[][];
} {
  const stem = String(raw?.stem ?? raw?.question ?? "").trim();
  const options = Array.isArray(raw?.options)
    ? raw.options.map((o: any, index: number) => ({
        letter: String(o?.letter || String.fromCharCode(65 + index)).trim().slice(0, 3),
        text: String(o?.text ?? o?.body ?? "").trim(),
      })).filter((o: { text: string }) => o.text)
    : [];
  const explicitMode = raw?.answer_mode === "multiple" ? "multiple" : "single";
  const isCombination = options.length >= 2 && options.every((option: { text: string }) =>
    COMBO_RE.test(option.text),
  );
  // Printed a/b/c/d combinations: either given explicitly by the model, or read
  // back from raw combination-looking choices as a fallback.
  const printedChoices = Array.isArray(raw?.printed_choices) ? raw.printed_choices : [];
  let comboSets = parseComboSets(raw?.combinations);
  if (!comboSets.length) comboSets = parseComboSets(printedChoices);
  if (!comboSets.length && isCombination) {
    comboSets = parseComboSets(options.map((o: { text: string }) => o.text));
  }
  if (!isCombination && explicitMode !== "multiple") {
    return { stem, options, answerMode: "single", comboSets: [] };
  }

  const referenced = new Set(
    comboSets.length
      ? comboSets.flat()
      : options.flatMap((option: { text: string }) => option.text.match(/\d+/g) ?? []),
  );
  const lines = stem.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const statements = lines.flatMap((line) => {
    const match = line.match(/^(\d{1,2})\s*[.)\-:]\s*(.+)$/);
    if (!match || !referenced.has(match[1]) || !/[A-Za-z\p{L}]/u.test(match[2])) return [];
    return [{ letter: match[1], text: match[2].trim(), source: line }];
  });
  if (statements.length < 2) return { stem, options, answerMode: explicitMode, comboSets };
  const statementLines = new Set(statements.map((statement) => statement.source));
  const mainStem = lines.filter((line) => !statementLines.has(line)).join("\n").trim();
  return {
    stem: mainStem || stem,
    options: statements.map(({ letter, text }) => ({ letter, text })),
    answerMode: "multiple",
    comboSets,
  };
}

/** Force a multi-answer result onto one of the printed a/b/c/d combinations. */
function snapToPrintedCombo(labels: string[], comboSets: any): string[] {
  const sets = parseComboSets(comboSets);
  if (!sets.length) return labels;
  const chosen = new Set(labels.map((l) => String(l).trim()));
  const exact = sets.find((s) => s.length === chosen.size && s.every((n) => chosen.has(n)));
  if (exact) return exact;
  let best = sets[0];
  let bestScore = -Infinity;
  for (const set of sets) {
    const hits = set.filter((n) => chosen.has(n)).length;
    const extra = [...chosen].filter((n) => !set.includes(n)).length;
    const score = hits * 2 - extra - (set.length - hits);
    if (score > bestScore) { bestScore = score; best = set; }
  }
  return best;
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
  if (s.endsWith("SUCCEEDED")) return "succeeded";
  if (s.endsWith("FAILED")) return "failed";
  if (s.endsWith("CANCELLED")) return "cancelled";
  if (s.endsWith("EXPIRED")) return "expired";
  if (s.endsWith("RUNNING")) return "running";
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
function responseKey(item: any, fallback: number): string {
  return item?.metadata?.key || item?.metadata?.["key"] || `k-${fallback}`;
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
    inline = text.split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as any[];
  }
  return inline ?? [];
}
async function submitBatch(apiKey: string, displayName: string, requests: any[]) {
  const body = { batch: { display_name: displayName, input_config: { requests: { requests } } } };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchGenerateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Batch submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  const name: string | undefined = json?.name || json?.metadata?.name;
  if (!name) throw new Error("Batch submit returned no name");
  return name;
}

const READ_SYSTEM = `You read ONE page of a medical exam past-paper (image or text PDF page) and transcribe its questions.

Return STRICT JSON only (no markdown fences):
{"questions":[{"number":"12","question_type":"ordinary|combination|multiple_select","answer_mode":"single|multiple","stem":"the main question, verbatim plain text","options":[{"letter":"A or 1","text":"..."}],"printed_choices":[{"letter":"A","text":"1,2"}],"combinations":[[1,2],[2,3]]}]}

Rules:
- Transcribe EVERY question that appears on this page, in reading order. Never skip one.
- Copy the stem and every option VERBATIM. Do not shorten, translate or fix them.
- Options may be labelled "A." "a)" "1-" or bullets — normalise the letter to A, B, C, D...
- CRITICAL COMBINATION-QUESTION RULE — apply this independently to EVERY question on EVERY page:
  1. First inspect the answer choices. If choices labelled a/b/c/d or A/B/C/D contain only combinations of statement numbers, such as "1.2", "1, 3, 4", "1 + 2", "2/3/4", or "1 2 3 4", this is a combination question.
   2. Set "question_type":"combination" and "answer_mode":"multiple".
  3. Set "stem" to ONLY the main question line, without the numbered statements and without A/B/C/D choices.
   4. The A/B/C/D combination choices must NOT appear in "options". Copy each one VERBATIM into required "printed_choices", then parse it into "combinations" in printed order — a)1.2 b)2.3 becomes "printed_choices":[{"letter":"A","text":"1.2"},{"letter":"B","text":"2.3"}],"combinations":[[1,2],[2,3]].
  5. Convert EVERY numbered statement into an option: its number is "letter" and its full wording is "text". Preserve wording and order exactly.
  6. Before returning JSON, verify that every printed numbered statement is present as an option, no A/B/C/D combination remains in "options", and every printed combination is listed in "combinations".
  Required example: "Which apply? / 1. First statement / 2. Second statement / 3. Third statement / a)1.2 / b)2.3" becomes {"answer_mode":"multiple","stem":"Which apply?","options":[{"letter":"1","text":"First statement"},{"letter":"2","text":"Second statement"},{"letter":"3","text":"Third statement"}],"combinations":[[1,2],[2,3]]}.
- Ordinary questions whose A/B/C/D choices contain answer words remain ordinary: set "question_type":"ordinary", "answer_mode":"single", keep their answer text as A/B/C/D options, and return empty printed_choices/combinations.
- Genuine select-all-that-apply questions without printed A/B/C/D combinations use "question_type":"multiple_select" and may have empty combinations.
- If a question has no visible options (open/short answer), return "options": [].
- Do NOT answer the questions and do NOT explain anything here.
- If the page contains no questions at all (cover page, index, blank), return {"questions":[]}.`;

const SOLVE_SYSTEM = `You are a medical exam tutor. The user gives you ONE question (stem + its options).

Return STRICT JSON only (no markdown fences):
{
  "options": [{"letter":"A","body":"...","is_correct":true|false}],
  "answer_letter": "A",
  "answer_letters": ["A"],
  "concept": "<=8 words naming the core concept tested",
  "explanation": "GitHub-flavored Markdown with THREE sections separated by BLANK LINES:\\n\\n**Concept**\\n2-3 sentences explaining the underlying mechanism.\\n\\n**Why the correct answer is right**\\n- 2-3 short bullets.\\n\\n**Why the other options are wrong**\\nList ONLY the wrong options. Each bullet MUST start with the option's OWN TEXT in **bold** (NO letter prefix like A. or B.), then a dash, then one clear sentence with the specific reason. Example: - **Histiocytes** — are involved but activated by T-cells, not the primary drivers.",
  "summary_table": "A GitHub-flavored Markdown table. Every row on its OWN line. Header | Option | Verdict | One-line reason |, separator |---|---|---|, then one line per option. The Option column must contain the option TEXT ONLY (NO letter prefix like A. or B.). With the correct row marked ✓ and wrong rows ✗."
}

Rules:
- The user message states ANSWER MODE. For SINGLE, mark exactly ONE option correct and return its label in both answer_letter and answer_letters.
- For MULTIPLE, the user message may list ALLOWED ANSWER SETS (the combinations printed on the paper, e.g. 1,2 / 2,3 / 1,3 / 3,4). When it does, you MUST pick exactly ONE of those printed sets as the answer: mark true ONLY the statements of that set, and return exactly its numbers in answer_letters. Never return a set that is not listed. In "Why the other options are wrong" explain why each other printed set is wrong. If no allowed sets are given, judge every statement independently and mark all correct ones true.
- Keep the given options verbatim and in the given order.
- If the question came with no options, INVENT exactly 4 plausible options A-D where exactly one is correct.
- answer_letter MUST match the option you marked is_correct.
- If (and only if) the user message contains a TOPIC block, also return a "topic" field: a short sub-subject name for this question. When a topic list is given you MUST copy one of the listed names EXACTLY, or "Other" if none fits. When no list is given, invent a short (1-3 words) topic name and reuse the same wording for questions about the same area.
- Output JSON only.`;

const SORT_TOPICS_SYSTEM = `You read a medical syllabus / contents / topic list and return its topics.
Return STRICT JSON only: {"topics":["Arrhythmias","Valvular disease"]}.
Rules: 5-40 topics, each 1-5 words, no numbering, no duplicates, in the document's own wording and order.`;

function cleanTopicName(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/^\s*[\d.)\-•]+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function parseTopicList(source: unknown): string[] {
  const raw = Array.isArray(source) ? source : String(source ?? "").split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const name = cleanTopicName(entry);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 60) break;
  }
  return out;
}

/** Map a returned topic onto the allowed list (case/spacing tolerant). */
function matchTopic(value: unknown, allowed: string[]): string | null {
  const name = cleanTopicName(value);
  if (!name) return null;
  if (!allowed.length) return name;
  const key = name.toLowerCase();
  const hit = allowed.find((t) => t.toLowerCase() === key)
    ?? allowed.find((t) => t.toLowerCase().includes(key) || key.includes(t.toLowerCase()));
  return hit ?? "Other";
}

// ---------------- 1. create job ----------------

const CreateInput = z.object({
  courseId: z.string().uuid(),
  groupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  pdfName: z.string().min(1).max(200),
  totalPages: z.number().int().min(1).max(500),
});

export const createAqvJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS).insert({
      user_id: userId,
      course_id: data.courseId,
      group_id: data.groupId,
      subject_id: data.subjectId,
      pdf_name: data.pdfName,
      total_pages: data.totalPages,
      stage: "uploading",
      status: "uploading",
    }).select("id").single();
    if (error) throw error;
    return { jobId: job.id as string };
  });

// ---------------- 2. upload one page ----------------

const UploadInput = z.object({
  jobId: z.string().uuid(),
  pageNumber: z.number().int().min(1).max(500),
  pdfBase64: z.string().min(20).max(8_000_000),
});

export const uploadAqvPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from(PAGES).insert({
      job_id: data.jobId,
      page_number: data.pageNumber,
      pdf_b64: data.pdfBase64,
      status: "uploaded",
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------------- 3. submit stage 1 (read) ----------------

const JobInput = z.object({ jobId: z.string().uuid() });

export const submitAqvReadBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    const { data: pages, error } = await supabase.from(PAGES)
      .select("id, page_number, pdf_b64").eq("job_id", data.jobId).order("page_number");
    if (error) throw error;
    const usable = (pages ?? []).filter((p: any) => p.pdf_b64);
    if (!usable.length) throw new Error("No pages uploaded for this job.");

    const requests = usable.map((p: any) => ({
      request: {
        systemInstruction: { parts: [{ text: READ_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: p.pdf_b64 } },
            { text: `Transcribe every question on this page (page ${p.page_number}) as JSON.` },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json" },
      },
      metadata: { key: `p-${p.id}` },
    }));

    const batchName = await submitBatch(apiKey, `aqvx-read-${String(data.jobId).slice(0, 8)}-${Date.now()}`, requests);

    await supabase.from(PAGES).update({ status: "in_batch" }).eq("job_id", data.jobId);
    await supabase.from(JOBS).update({
      stage: "reading", status: "in_batch", read_batch_id: batchName, error: null,
    }).eq("id", data.jobId);

    return { batchId: batchName, pages: usable.length };
  });

// ---------------- 4. poll stage 1 ----------------

export const pollAqvRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS)
      .select("id, stage, read_batch_id").eq("id", data.jobId).single();
    if (error) throw error;
    if (job.stage === "read_ready" || job.stage === "solving" || job.stage === "solved" || job.stage === "imported") {
      return { stage: job.stage as string };
    }
    if (!job.read_batch_id) return { stage: job.stage as string };

    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, job.read_batch_id);
    const st = mapBatchStatus(getBatchState(bj));
    if (st !== "succeeded") {
      if (st === "failed" || st === "cancelled" || st === "expired") {
        const msg = JSON.stringify(bj?.error || bj).slice(0, 500);
        await supabase.from(JOBS).update({ stage: "read_failed", status: "failed", error: msg }).eq("id", data.jobId);
        return { stage: "read_failed", error: msg };
      }
      return { stage: "reading", providerState: getBatchState(bj) };
    }

    const responses = await downloadResponses(apiKey, bj);
    const { data: pages } = await supabase.from(PAGES)
      .select("id, page_number").eq("job_id", data.jobId).order("page_number");
    const byId = new Map<string, any>((pages ?? []).map((p: any) => [p.id, p]));

    let total = 0;
    let itemIndex = 0;
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      const key = String(responseKey(r, i));
      const pageId = key.startsWith("p-") ? key.slice(2) : (pages ?? [])[i]?.id;
      const page = byId.get(pageId);
      if (!page) continue;
      const parsed = parseQuestionsPayload(responseText(r));
      const rows: any[] = [];
      for (const q of parsed) {
        const normalized = normalizeCombinationQuestion(q);
        const stem = normalized.stem;
        if (stem.length < 5) continue;
        const options = normalized.options;
        const printedChoices = Array.isArray(q?.printed_choices) ? q.printed_choices : [];
        const numericMultiple = normalized.answerMode === "multiple" && normalized.options.length >= 2
          && normalized.options.every((option) => /^\d+$/.test(option.letter));
        // Fail closed: numbered multi-answer options are treated as paper
        // combinations unless the paper choices were safely recovered.
        const questionType = q?.question_type === "combination" || numericMultiple ? "combination"
          : q?.question_type === "multiple_select" ? "multiple_select" : "ordinary";
        const looksLikeCombination = questionType === "combination"
          || (normalized.answerMode === "multiple" && normalized.options.length >= 2
            && normalized.options.every((option) => /^\d+$/.test(option.letter)) && printedChoices.length > 0);
        const missingCombos = looksLikeCombination && normalized.comboSets.length < 2;
        rows.push({
          job_id: data.jobId,
          page_id: page.id,
          item_index: itemIndex++,
          number: q?.number ? String(q.number).slice(0, 20) : null,
          stem,
          options,
          answer_mode: normalized.answerMode,
          question_type: questionType,
          combo_sets: normalized.answerMode === "multiple" ? normalized.comboSets : [],
          printed_choices: printedChoices,
          status: missingCombos ? "needs_combinations" : "read",
          error: missingCombos ? "Printed A–D answer combinations were not recovered. Enter them before solving." : null,
        });
      }
      if (rows.length) {
        const { error: iErr } = await supabase.from(ITEMS).insert(rows);
        if (iErr) throw iErr;
      }
      total += rows.length;
      await supabase.from(PAGES).update({
        status: rows.length ? "ready" : "empty",
        question_count: rows.length,
        error: rows.length ? null : "No questions found on this page",
      }).eq("id", page.id);
    }

    await supabase.from(JOBS).update({ stage: "read_ready", status: "read_ready", error: null }).eq("id", data.jobId);
    return { stage: "read_ready", questions: total };
  });

// ---------------- 5. submit stage 2 (solve) ----------------

export const submitAqvAnswerBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);

    const { data: pages, error: pErr } = await supabase.from(PAGES)
      .select("id, status").eq("job_id", data.jobId);
    if (pErr) throw pErr;
    if (!pages?.length) throw new Error("This job has no pages.");
    const notReady = pages.filter((p: any) => p.status !== "ready" && p.status !== "empty");
    if (notReady.length) throw new Error(`Stage 1 is not finished — ${notReady.length} page(s) still pending.`);

    const { data: items, error: iErr } = await supabase.from(ITEMS)
      .select("id, stem, options, answer_mode, question_type, combo_sets, printed_choices, solved, status").eq("job_id", data.jobId).order("item_index");
    if (iErr) throw iErr;
    const todo = (items ?? []).filter((it: any) => !it.solved);
    if (!todo.length) throw new Error("Every question is already solved.");
    const blocked = todo.filter((it: any) => it.status === "needs_combinations"
      || (it.question_type === "combination" && parseComboSets(it.combo_sets).length < 2));
    if (blocked.length) throw new Error(`${blocked.length} combination question(s) are missing the paper's allowed sets. Repair them before solving.`);

    const apiKey = await getGeminiKey(supabase);
    const { data: jobRow } = await supabase.from(JOBS)
      .select("reference_book, resource_kind, resource_text, resource_url, resource_storage_path, resource_name, resource_mime, sort_mode, sort_topics").eq("id", data.jobId).maybeSingle();
    const refBlock = buildReferenceBlock(jobRow?.reference_book);
    const resourceParts = await buildResourceParts(supabase, jobRow);
    const sortMode = String(jobRow?.sort_mode ?? "none");
    const sortTopics = parseTopicList(jobRow?.sort_topics);
    const topicBlock = sortMode === "none" ? ""
      : sortTopics.length
        ? `TOPIC — also return a "topic" field. Choose EXACTLY one name from this list (or "Other"):\n${sortTopics.map((t) => `- ${t}`).join("\n")}\n`
        : `TOPIC — also return a "topic" field: a short (1-3 words) sub-subject name for this question.\n`;
    const requests = todo.map((it: any) => {
      const opts = Array.isArray(it.options) ? it.options : [];
      const optText = opts.length
        ? opts.map((o: any) => `${o.letter}. ${o.text}`).join("\n")
        : "(no options given — invent 4)";
      const sets = parseComboSets(it.combo_sets);
      const comboBlock = it.answer_mode === "multiple" && sets.length
        ? `ALLOWED ANSWER SETS (printed on the paper — you MUST choose exactly one of these):\n${sets.map((s) => s.join(",")).join("\n")}\n`
        : "";
      return {
        request: {
          systemInstruction: { parts: [{ text: SOLVE_SYSTEM }] },
          contents: [{ role: "user", parts: [...resourceParts, { text: `${refBlock}${resourceParts.length ? "RESOURCE RULE: Base the answer and explanation on the supplied source. If it does not contain enough evidence, return an error field instead of guessing.\n" : ""}ANSWER MODE: ${it.answer_mode === "multiple" ? "MULTIPLE — select every correct numbered statement" : "SINGLE — select exactly one answer"}\n${comboBlock}${topicBlock}--- QUESTION ---\n${it.stem}\n\n${optText}\n--- END ---` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
        },
        metadata: { key: `i-${it.id}` },
      };
    });

    const batchName = await submitBatch(apiKey, `aqvx-solve-${String(data.jobId).slice(0, 8)}-${Date.now()}`, requests);

    await supabase.from(ITEMS).update({ status: "in_batch", error: null })
      .eq("job_id", data.jobId).eq("solved", false);
    await supabase.from(JOBS).update({
      stage: "solving", status: "in_batch", answer_batch_id: batchName, error: null,
    }).eq("id", data.jobId);

    return { batchId: batchName, questions: todo.length };
  });

// ---------------- 6. poll stage 2 ----------------

export const pollAqvAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS)
      .select("id, stage, answer_batch_id, sort_mode, sort_topics").eq("id", data.jobId).single();
    if (error) throw error;
    const sortMode = String(job?.sort_mode ?? "none");
    const allowedTopics = parseTopicList(job?.sort_topics);
    if (!job.answer_batch_id || job.stage === "solved" || job.stage === "imported") {
      return { stage: job.stage as string };
    }

    const apiKey = await getGeminiKey(supabase);
    const bj = await fetchBatch(apiKey, job.answer_batch_id);
    const st = mapBatchStatus(getBatchState(bj));
    if (st !== "succeeded") {
      if (st === "failed" || st === "cancelled" || st === "expired") {
        const msg = JSON.stringify(bj?.error || bj).slice(0, 500);
        await supabase.from(JOBS).update({ stage: "solve_failed", status: "failed", error: msg }).eq("id", data.jobId);
        return { stage: "solve_failed", error: msg };
      }
      return { stage: "solving", providerState: getBatchState(bj) };
    }

    const responses = await downloadResponses(apiKey, bj);
    let solved = 0, failed = 0;
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      const key = String(responseKey(r, i));
      if (!key.startsWith("i-")) { failed++; continue; }
      const itemId = key.slice(2);
      const parsed = parseJsonObject(responseText(r));
      const opts = Array.isArray(parsed?.options)
        ? parsed.options.map((o: any, oi: number) => ({
            letter: String(o?.letter || String.fromCharCode(65 + oi)).trim().slice(0, 3),
            text: String(o?.body ?? o?.text ?? "").trim(),
            is_correct: !!o?.is_correct,
          })).filter((o: any) => o.text)
        : [];
      const { data: itemRow } = await supabase.from(ITEMS).select("answer_mode, question_type, combo_sets, status").eq("id", itemId).single();
      const answerMode: AnswerMode = itemRow?.answer_mode === "multiple" ? "multiple" : "single";
      const parsedAnswers = Array.isArray(parsed?.answer_letters)
        ? parsed.answer_letters.map((value: unknown) => String(value).trim()).filter(Boolean)
        : String(parsed?.answer_letter || "").split(",").map((value) => value.trim()).filter(Boolean);
      let labels = parsedAnswers.length
        ? parsedAnswers
        : opts.filter((o: any) => o.is_correct).map((o: any) => o.letter);
      const storedSets = parseComboSets(itemRow?.combo_sets);
      if (answerMode === "multiple" && storedSets.length) labels = snapToPrintedCombo(labels, storedSets);
      if (answerMode === "multiple" && (itemRow?.status === "needs_combinations"
        || (itemRow?.question_type === "combination" && storedSets.length < 2))) labels = [];
      const correctLabels = new Set(labels);
      const answer = [...correctLabels].join(",");
      const explanation = String(parsed?.explanation || "").trim();
      const ok = opts.length >= 2 && correctLabels.size >= 1
        && (answerMode === "multiple" || correctLabels.size === 1) && explanation.length > 20;
      if (!ok) {
        failed++;
        await supabase.from(ITEMS).update({
          status: "failed", solved: false, error: "Gemini returned an incomplete answer",
        }).eq("id", itemId);
        continue;
      }
      const topic = sortMode === "none" ? null : matchTopic(parsed?.topic, allowedTopics);
      await supabase.from(ITEMS).update({
        options: opts.map((o: any) => ({ ...o, is_correct: correctLabels.has(o.letter) })),
        answer_letter: answer,
        ...(sortMode === "none" ? {} : { topic: topic || "Other" }),
        concept: String(parsed?.concept || "").slice(0, 200) || null,
        explanation,
        summary_table: String(parsed?.summary_table || "") || null,
        solved: true,
        status: "solved",
        error: null,
      }).eq("id", itemId);
      solved++;
    }

    const { count: unsolved } = await supabase.from(ITEMS)
      .select("id", { count: "exact", head: true }).eq("job_id", data.jobId).eq("solved", false);
    const stage = (unsolved ?? 0) === 0 ? "solved" : "solve_partial";
    await supabase.from(JOBS).update({ stage, status: stage, error: null }).eq("id", data.jobId);
    return { stage, solved, failed, remaining: unsolved ?? 0 };
  });

// ---------------- 7. import ----------------

const ImportInput = z.object({ jobId: z.string().uuid(), allowPartial: z.boolean().optional() });

export const importAqvJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS)
      .select("id, subject_id, group_id, sort_mode").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.subject_id) throw new Error("This job has no target subject.");
    const sorting = String(job.sort_mode ?? "none") !== "none" && !!job.group_id;

    const { data: items, error: iErr } = await supabase.from(ITEMS)
      .select("id, stem, options, answer_mode, question_type, combo_sets, status, explanation, summary_table, solved, imported, topic")
      .eq("job_id", data.jobId).order("item_index");
    if (iErr) throw iErr;
    if (!items?.length) throw new Error("Nothing to import.");
    const unsolved = items.filter((it: any) => !it.solved).length;
    if (unsolved > 0 && !data.allowPartial) {
      throw new Error(`${unsolved} question(s) are not solved yet — import is blocked.`);
    }
    const importable = data.allowPartial ? items.filter((it: any) => it.solved) : items;
    if (!importable.length) throw new Error("No solved question to import yet.");

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    const createdSubjects = new Set<string>();
    const targets = new Map<string, { id: string; sort: number }>();

    async function targetFor(topic: string | null): Promise<{ id: string; sort: number }> {
      const name = sorting ? (cleanTopicName(topic) || "Other") : "";
      const cacheKey = name || "__default__";
      const cached = targets.get(cacheKey);
      if (cached) return cached;

      let subjectId = job.subject_id as string;
      if (name) {
        const { data: existing } = await supabase.from("subjects")
          .select("id").eq("group_id", job.group_id).ilike("name", name).limit(1).maybeSingle();
        if (existing?.id) subjectId = existing.id;
        else {
          const { count: subjectCount } = await supabase.from("subjects")
            .select("id", { count: "exact", head: true }).eq("group_id", job.group_id);
          const { data: created, error: sErr } = await supabase.from("subjects")
            .insert({ group_id: job.group_id, name, sort_order: (subjectCount ?? 0) + 1 })
            .select("id").single();
          if (sErr || !created) throw new Error(sErr?.message ?? `Could not create the subject "${name}".`);
          subjectId = created.id;
          createdSubjects.add(name);
        }
      }
      const { count } = await supabase.from("questions")
        .select("id", { count: "exact", head: true }).eq("subject_id", subjectId);
      const entry = { id: subjectId, sort: (count ?? 0) + 1 };
      targets.set(cacheKey, entry);
      return entry;
    }

    for (const it of importable) {
      if (it.imported) { skipped++; continue; }
      try {
        if (it.status === "needs_combinations" || (it.question_type === "combination" && parseComboSets(it.combo_sets).length < 2)) {
          throw new Error("Printed answer combinations are missing.");
        }
        const sets = parseComboSets(it.combo_sets);
        if (it.answer_mode === "multiple" && sets.length) {
          const selected = (Array.isArray(it.options) ? it.options : []).filter((o: any) => o.is_correct).map((o: any) => String(o.letter));
          const valid = sets.some((set) => set.length === selected.length && set.every((label) => selected.includes(label)));
          if (!valid) throw new Error("The solved answer is not one of the paper's printed combinations.");
        }
        const explanation = [it.explanation || "", it.summary_table ? `\n\n${it.summary_table}` : ""].join("").trim() || null;
        const target = await targetFor(it.topic ?? null);
        const { data: q, error: qErr } = await supabase.from("questions").upsert(
          { subject_id: target.id, stem: it.stem, explanation, answer_mode: it.answer_mode ?? "single", sort_order: target.sort },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (qErr) throw qErr;
        if (!q?.id) {
          skipped++;
          await supabase.from(ITEMS).update({ imported: true, status: "duplicate" }).eq("id", it.id);
          continue;
        }
        const rows = (Array.isArray(it.options) ? it.options : []).map((o: any, idx: number) => ({
          question_id: q.id,
          label: o.letter || String.fromCharCode(65 + idx),
          text: o.text || o.body || "",
          is_correct: !!o.is_correct,
          sort_order: idx + 1,
        }));
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        await supabase.from(ITEMS).update({ imported: true, status: "imported" }).eq("id", it.id);
        inserted++;
        target.sort++;
      } catch (e: any) {
        failed++;
        errors.push(String(e?.message || e).slice(0, 160));
      }
    }

    const stage = unsolved > 0 ? "solve_partial" : "imported";
    await supabase.from(JOBS).update({
      stage, status: stage, imported_count: inserted,
      error: errors.length ? errors.slice(0, 3).join(" | ") : null,
    }).eq("id", data.jobId);

    return { inserted, skipped, failed, leftOut: unsolved, errors: errors.slice(0, 5), subjectsCreated: [...createdSubjects] };
  });

// ---------------- listing / housekeeping ----------------

export const listAqvJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase.from(JOBS)
      .select("id, pdf_name, total_pages, stage, status, imported_count, error, created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const getAqvJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const [{ data: job, error: e1 }, { data: pages, error: e2 }, { data: items, error: e3 }] = await Promise.all([
      supabase.from(JOBS).select("id, pdf_name, total_pages, stage, status, imported_count, error, course_id, group_id, subject_id, reference_book, resource_kind, resource_text, resource_url, resource_storage_path, resource_name, resource_mime, sort_mode, sort_topics, created_at").eq("id", data.jobId).single(),
      supabase.from(PAGES).select("id, page_number, status, question_count, error").eq("job_id", data.jobId).order("page_number"),
      supabase.from(ITEMS).select("id, item_index, number, stem, options, answer_mode, question_type, combo_sets, printed_choices, answer_letter, concept, explanation, summary_table, solved, imported, status, error, topic").eq("job_id", data.jobId).order("item_index"),
    ]);
    if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
    return { job, pages: pages ?? [], items: items ?? [] };
  });

export const deleteAqvJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job } = await supabase.from(JOBS).select("resource_storage_path").eq("id", data.jobId).single();
    if (job?.resource_storage_path) await supabase.storage.from("aquavision-resources").remove([job.resource_storage_path]);
    const { error } = await supabase.from(JOBS).delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });

export const setAqvReferenceBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    book: z.string().max(200).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const book = (data.book ?? "").trim();
    const { error } = await supabase.from(JOBS)
      .update({ reference_book: book || null }).eq("id", data.jobId);
    if (error) throw error;
    return { book: book || null };
  });

export const setAqvComboSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    itemId: z.string().uuid(),
    combinations: z.array(z.array(z.string().regex(/^\d+$/)).min(2)).min(2).max(12),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const sets = parseComboSets(data.combinations);
    if (sets.length < 2) throw new Error("Enter at least two printed combinations.");
    const { error } = await supabase.from(ITEMS).update({
      combo_sets: sets, question_type: "combination", solved: false, answer_letter: null, concept: null, explanation: null,
      summary_table: null, status: "read", error: null,
    }).eq("id", data.itemId);
    if (error) throw error;
    return { comboSets: sets };
  });

/** Let the AI (and any saved resource/textbook) answer combination questions whose printed sets could not be recovered. */
export const releaseAqvCombinations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(), itemId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    let q = supabase.from(ITEMS).update({
      question_type: "multiple_select", combo_sets: [], answer_mode: "multiple", status: "read", error: null,
    }).eq("job_id", data.jobId).eq("status", "needs_combinations");
    if (data.itemId) q = q.eq("id", data.itemId);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const setAqvResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(), kind: z.enum(["text", "link", "pdf"]).nullable(),
    text: z.string().max(60_000).optional(), url: z.string().max(2_000).optional(),
    fileName: z.string().max(200).optional(), pdfBase64: z.string().max(28_000_000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: existing } = await supabase.from(JOBS).select("resource_storage_path").eq("id", data.jobId).single();
    if (!data.kind) {
      if (existing?.resource_storage_path) await supabase.storage.from("aquavision-resources").remove([existing.resource_storage_path]);
      const { error } = await supabase.from(JOBS).update({ resource_kind: null, resource_text: null, resource_url: null, resource_storage_path: null, resource_name: null, resource_mime: null }).eq("id", data.jobId);
      if (error) throw error;
      return { resource: null };
    }
    if (data.kind === "text" && !data.text?.trim()) throw new Error("Paste the source text first.");
    if (data.kind === "link" && (!data.url || !isSafeResourceUrl(data.url))) throw new Error("Enter a safe public HTTPS link.");
    let path: string | null = null;
    if (data.kind === "pdf") {
      if (!data.pdfBase64 || !data.fileName) throw new Error("Choose a PDF first.");
      const binary = atob(data.pdfBase64);
      if (binary.length > 20_000_000) throw new Error("Resource PDFs must be 20 MB or smaller.");
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      path = `${data.jobId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("aquavision-resources").upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
    }
    const resource = {
      resource_kind: data.kind, resource_text: data.kind === "text" ? data.text?.trim() : null,
      resource_url: data.kind === "link" ? data.url : null, resource_storage_path: path,
      resource_name: data.kind === "pdf" ? data.fileName : null, resource_mime: data.kind === "pdf" ? "application/pdf" : null,
    };
    const { error } = await supabase.from(JOBS).update(resource).eq("id", data.jobId);
    if (error) {
      if (path) await supabase.storage.from("aquavision-resources").remove([path]);
      throw error;
    }
    if (existing?.resource_storage_path && existing.resource_storage_path !== path) {
      await supabase.storage.from("aquavision-resources").remove([existing.resource_storage_path]);
    }
    return { resource };
  });