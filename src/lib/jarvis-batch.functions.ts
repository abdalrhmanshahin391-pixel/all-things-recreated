// Jarvis Batch — Gemini Batch API (50% off, async ~24h)
// Locked to gemini-2.5-flash-lite.
//
// Subject picking uses NUMBERED INDEX, never verbatim names, to kill
// spelling / case / typo drift. Two modes:
//   - "single"   : one batch. Solver returns subject_index alongside the answer.
//   - "two_pass" : two batches. Solver answers only; a second classifier
//                  batch reads {stem, concept_tag, explanation} + the
//                  numbered subject list and returns subject_index.
// Anything the model can't classify lands in `pending_review` for manual fix.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { submitGeminiBatch } from "@/lib/gemini-pool";

const MODEL = "gemini-flash-lite-latest";

const SOLVER_SYSTEM_WITH_SUBJECT = `You are a medical MCQ solver. The user gives you ONE complete question (stem + options, or an OSCE prompt). Solve it and explain it.

The user message starts with a numbered list called SUBJECTS. Pick exactly ONE entry from that list whose scope best matches the MECHANISM you describe in your explanation. Return its 1-based number in "subject_index". Use 0 if nothing in the list could reasonably own this mechanism.

Return STRICT JSON only (no markdown fences, no commentary):
{
  "prompt": "the question stem, plain text",
  "options": [{"letter":"A","body":"...","is_correct":true|false}],
  "explanation": "Markdown explanation (template below)",
  "concept_tag": "≤6 words naming the core concept tested",
  "subject_index": <integer 0..N>,
  "confidence": "high" | "medium" | "low",
  "reason": "≤12 words citing the mechanism in your explanation that justifies subject_index"
}

Fill JSON keys TOP-DOWN in the order shown. Write explanation and concept_tag BEFORE picking subject_index.

Rules:
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true (5-6 only if the source genuinely lists that many).
- If the source already lists choices, copy them verbatim in order. If only the correct answer is shown, INVENT 3 plausible-but-wrong distractors and SHUFFLE so the correct answer is not always A.
- If a letter is marked, that letter is correct. Otherwise pick the medically correct one.
- "explanation" MUST be GitHub-flavored Markdown with these sections in order:
  **Concept** (2-4 sentences, bold key terms)
  **Why the correct answer is right** (3-5 bullets, end with a clinical pearl)
  **Why the other options are wrong** (one bullet per WRONG option, format: **A) text** — one sentence)
  **Summary** (markdown table: Option | Verdict | One-line reason; ✓ Correct on the right row)
- subject_index MUST refer to the field that owns the MECHANISM in your explanation, not just the organ or disease in the stem (e.g. troponin kinetics in MI → Biochemistry, not Cardiology; ribosomal binding in an antibiotic question → Microbiology/Pharmacology, not the infected organ).
- If two indices could fit, pick the more specific one matching your explanation's mechanism.
- If unsure, set subject_index=0 and confidence="low". Wrong sorting is worse than 0.
- Output JSON only.`;

const SOLVER_SYSTEM_NO_SUBJECT = `You are a medical MCQ solver. The user gives you ONE complete question (stem + options, or an OSCE prompt). Solve it and explain it.

Return STRICT JSON only (no markdown fences, no commentary):
{
  "prompt": "the question stem, plain text",
  "options": [{"letter":"A","body":"...","is_correct":true|false}],
  "explanation": "Markdown explanation (template below)",
  "concept_tag": "≤6 words naming the core concept tested"
}

Rules:
- Output EXACTLY 4 options A, B, C, D with exactly one is_correct=true (5-6 only if the source genuinely lists that many).
- If the source already lists choices, copy them verbatim in order. If only the correct answer is shown, INVENT 3 plausible-but-wrong distractors and SHUFFLE.
- If a letter is marked, that letter is correct. Otherwise pick the medically correct one.
- "explanation" MUST be GitHub-flavored Markdown with these sections in order:
  **Concept** (2-4 sentences, bold key terms)
  **Why the correct answer is right** (3-5 bullets, end with a clinical pearl)
  **Why the other options are wrong** (one bullet per WRONG option, format: **A) text** — one sentence)
  **Summary** (markdown table: Option | Verdict | One-line reason; ✓ Correct on the right row)
- Output JSON only.`;

const CLASSIFIER_SYSTEM = `You are a medical subject classifier. The user gives you ONE solved exam question plus a numbered list of available subjects for ONE section.

Pick exactly ONE entry from SUBJECTS whose scope best matches the MECHANISM described in the question's explanation/concept. Return its 1-based number in "subject_index". Use 0 ONLY if nothing in the list could reasonably own this mechanism.

Return STRICT JSON only:
{
  "subject_index": <integer 0..N>,
  "confidence": "high" | "medium" | "low",
  "reason": "≤14 words citing a term from the explanation that justifies the pick"
}

Rules:
- Read EVERY subject in the list before choosing.
- Match the MECHANISM (what is being tested), not just the organ or disease named in the stem.
  Examples: troponin kinetics in MI → Biochemistry, not Cardiology. Ribosomal binding in an antibiotic question → Microbiology/Pharmacology, not the infected organ. Counselling skills in a clinical scenario → Ethics/Communication, not the disease.
- If two indices could fit, pick the more specific one matching the explanation.
- If genuinely none fit, subject_index=0 with confidence="low".
- Output JSON only.`;

function extractJsonObject(text: string): any | null {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch {}
  const lb = cleaned.indexOf("{");
  const rb = cleaned.lastIndexOf("}");
  if (lb !== -1 && rb > lb) {
    try { return JSON.parse(cleaned.slice(lb, rb + 1)); } catch {}
  }
  return null;
}

function getBatchResponses(json: any): any[] {
  const c = [
    json?.response?.output?.inlinedResponses?.inlinedResponses,
    json?.response?.output?.inlinedResponses,
    json?.output?.inlinedResponses?.inlinedResponses,
    json?.output?.inlinedResponses,
    json?.response?.responses,
    json?.response?.inlinedResponses?.inlinedResponses,
    json?.response?.inlinedResponses,
    json?.responses,
    json?.inlinedResponses?.inlinedResponses,
    json?.inlinedResponses,
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
  return json?.response?.output?.responsesFile
    || json?.output?.responsesFile
    || json?.response?.responsesFile
    || json?.responsesFile;
}

function responseText(item: any): string {
  return item?.response?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.text
    || item?.text
    || "";
}

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase, userId } as { supabase: any; userId: string };
}

async function getFirstGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
    .order("slot", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/ai-keys.");
  return data.api_key as string;
}

function buildSubjectsBlock(candidates: string[]): string {
  if (!candidates.length) return "";
  const lines = candidates.map((c, i) => ` ${i + 1}. ${c}`).join("\n");
  return `SUBJECTS (pick exactly one index, or 0 if none fit):\n${lines}\n\n`;
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

// ----- Submit -----
const SubmitInput = z.object({
  pdfName: z.string().min(1).max(200),
  subjectId: z.string().uuid().nullable().optional(),
  autoSort: z.boolean().default(false),
  mode: z.enum(["single", "two_pass"]).default("single"),
  subjectCandidates: z.array(z.string().min(1).max(120)).max(120).optional(),
  hint: z.string().max(400).optional(),
  slices: z.array(z.union([
    z.string().min(5).max(8000),
    z.object({ text: z.string().min(5).max(8000) }),
  ])).min(1).max(500),
});

export const submitJarvisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const apiKey = await getFirstGeminiKey(supabase);

    const normalized = data.slices.map((s) => typeof s === "string" ? { text: s } : s);
    const candidates = data.subjectCandidates ?? [];
    const useIndex = data.autoSort && data.mode === "single" && candidates.length > 0;
    const system = useIndex ? SOLVER_SYSTEM_WITH_SUBJECT : SOLVER_SYSTEM_NO_SUBJECT;
    const subjectsBlock = useIndex ? buildSubjectsBlock(candidates) : "";

    const requests = normalized.map((q, i) => {
      const hintLine = data.hint ? `Hint: ${data.hint}\n\n` : "";
      return {
        request: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{
            role: "user",
            parts: [{ text: `${subjectsBlock}${hintLine}Solve this question and return JSON per the system prompt.\n\n--- QUESTION ---\n${q.text}\n--- END ---` }],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
        },
        metadata: { key: `q-${i}` },
      };
    });

    const body = {
      batch: {
        display_name: `jarvis-batch-${Date.now()}-${data.pdfName.slice(0, 40)}`,
        input_config: { requests: { requests } },
      },
    };
    const submitted = await submitGeminiBatch({ apiKey, model: MODEL, body: body });
    const json: any = submitted.ok ? submitted.json : {};
    const res = { ok: submitted.ok, status: submitted.ok ? 200 : submitted.status };
    const submitError = submitted.ok ? "" : submitted.message;
    if (!res.ok) throw new Error(submitError);
    const batchName: string | undefined = json?.name || json?.metadata?.name;
    if (!batchName) throw new Error(`Batch submit returned no name`);

    const { data: row, error: insErr } = await supabase
      .from("jarvis_batch_jobs")
      .insert({
        user_id: userId,
        pdf_name: data.pdfName,
        subject_id: data.subjectId ?? null,
        auto_sort: !!data.autoSort,
        mode: data.mode,
        batch_id: batchName,
        status: "pending",
        slice_map: normalized.map((s, i) => ({
          key: `q-${i}`,
          preview: s.text.slice(0, 80),
          subjectCandidates: candidates,
        })),
      })
      .select("id").single();
    if (insErr) throw insErr;
    return { jobId: row.id as string, batchName, count: normalized.length };
  });

// ----- List -----
export const listJarvisBatchJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase
      .from("jarvis_batch_jobs")
      .select("id, pdf_name, subject_id, auto_sort, mode, batch_id, classifier_batch_id, classifier_status, status, slice_map, pending_review, result_summary, last_error, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return { rows: data ?? [] };
  });

// ----- Poll -----
const PollInput = z.object({ jobId: z.string().uuid() });
export const pollJarvisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PollInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("jarvis_batch_jobs").select("*").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.batch_id) throw new Error("Job has no batch_id");
    const apiKey = await getFirstGeminiKey(supabase);
    // Poll classifier batch if it exists
    if (job.classifier_batch_id && job.classifier_status !== "succeeded") {
      const cj = await fetchBatch(apiKey, job.classifier_batch_id);
      const cs = mapBatchStatus(getBatchState(cj));
      await supabase.from("jarvis_batch_jobs").update({ classifier_status: cs }).eq("id", job.id);
      return { state: getBatchState(cj), status: cs, raw: cj, kind: "classifier" };
    }
    const sj = await fetchBatch(apiKey, job.batch_id);
    const newStatus = mapBatchStatus(getBatchState(sj));
    await supabase.from("jarvis_batch_jobs").update({
      status: newStatus,
      last_error: newStatus === "failed" ? JSON.stringify(sj?.error || sj?.response?.error || sj).slice(0, 800) : null,
    }).eq("id", job.id);
    return { state: getBatchState(sj), status: newStatus, raw: sj, kind: "solver" };
  });

// ----- Ingest solver batch (auto-insert confident, queue rest for review) -----
const IngestInput = z.object({ jobId: z.string().uuid() });
export const ingestJarvisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IngestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("jarvis_batch_jobs").select("*").eq("id", data.jobId).single();
    if (error) throw error;
    const apiKey = await getFirstGeminiKey(supabase);
    const sj = await fetchBatch(apiKey, job.batch_id);
    if (mapBatchStatus(getBatchState(sj)) !== "succeeded") throw new Error("Solver batch not succeeded yet.");
    const items = await downloadResponses(apiKey, sj);

    // Resolve candidate names → subject_id list (by index)
    const candidates: string[] = (Array.isArray(job.slice_map)
      ? (job.slice_map.find((x: any) => Array.isArray(x?.subjectCandidates))?.subjectCandidates ?? [])
      : []) as string[];
    let candidateIds: (string | null)[] = [];
    if (job.auto_sort && candidates.length > 0) {
      const { data: subs } = await supabase.from("subjects").select("id, name").in("name", candidates);
      const byName = new Map<string, string>((subs ?? []).map((s: any) => [s.name, s.id]));
      candidateIds = candidates.map((n) => byName.get(n) ?? null);
    }

    const sliceMap = Array.isArray(job.slice_map) ? job.slice_map : [];
    const previewByKey = new Map<string, string>(sliceMap.map((x: any) => [x.key, x.preview]));

    let inserted = 0, skippedExisting = 0, queued = 0, failed = 0;
    const errors: string[] = [];
    const pending: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = it?.metadata?.key || `q-${i}`;
      try {
        const txt = responseText(it);
        if (!txt) { failed++; errors.push(`${key}: no text`); continue; }
        const parsed = extractJsonObject(txt);
        if (!parsed?.prompt || !Array.isArray(parsed?.options)) { failed++; errors.push(`${key}: malformed JSON`); continue; }

        // Decide target subject
        let targetSubject: string | null = job.subject_id ?? null;
        let suggestedIdx: number | null = null;
        let confidence = "high";
        let reason = "";
        if (job.auto_sort) {
          suggestedIdx = Number.isInteger(parsed.subject_index) ? parsed.subject_index : null;
          confidence = String(parsed.confidence || "medium");
          reason = String(parsed.reason || "");
          if (suggestedIdx && suggestedIdx >= 1 && suggestedIdx <= candidateIds.length) {
            const maybe = candidateIds[suggestedIdx - 1];
            if (maybe && confidence === "high") targetSubject = maybe;
            else targetSubject = null;
          } else {
            targetSubject = null;
          }
        }

        if (targetSubject) {
          const { count } = await supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", targetSubject);
          // Upsert via unique (subject_id, stem_hash). ignoreDuplicates means a
          // re-run / double-click never creates a second row.
          const { data: q, error: qErr } = await supabase
            .from("questions")
            .upsert(
              {
                subject_id: targetSubject,
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
            skippedExisting++;
            continue;
          }
          const rows = parsed.options.map((o: any, idx: number) => ({
            question_id: q.id, label: o.letter || String.fromCharCode(65 + idx),
            text: o.body || o.text || "", is_correct: !!o.is_correct, sort_order: idx + 1,
          }));
          const { error: oErr } = await supabase.from("question_options").insert(rows);
          if (oErr) throw oErr;
          inserted++;
        } else if (job.auto_sort) {
          pending.push({
            key,
            preview: previewByKey.get(key) || String(parsed.prompt).slice(0, 100),
            prompt: parsed.prompt,
            options: parsed.options,
            explanation: parsed.explanation || "",
            concept_tag: parsed.concept_tag || "",
            suggested_index: suggestedIdx,
            confidence,
            reason,
            status: "pending",
          });
          queued++;
        } else {
          failed++; errors.push(`${key}: no subject and not auto-sort`);
        }
      } catch (e: any) {
        failed++; errors.push(`${key}: ${e?.message || String(e)}`.slice(0, 200));
      }
    }

    await supabase.from("jarvis_batch_jobs").update({
      status: pending.length > 0 ? "needs_review" : "ingested",
      pending_review: pending.length > 0 ? pending : null,
      result_summary: { inserted, skippedExisting, queued, failed, errors: errors.slice(0, 20) },
    }).eq("id", job.id);

    return { inserted, skippedExisting, queued, failed, errors: errors.slice(0, 20) };
  });

// ----- Submit classifier batch (two-pass mode, after solver succeeds) -----
const ClsSubmitInput = z.object({ jobId: z.string().uuid() });
export const submitClassifierBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClsSubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("jarvis_batch_jobs").select("*").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.auto_sort) throw new Error("Classifier only runs on auto-sort jobs");
    if (job.classifier_batch_id) throw new Error("Classifier already submitted");
    const apiKey = await getFirstGeminiKey(supabase);
    // Load solver responses
    const sj = await fetchBatch(apiKey, job.batch_id);
    if (mapBatchStatus(getBatchState(sj)) !== "succeeded") throw new Error("Solver batch not succeeded yet.");
    const items = await downloadResponses(apiKey, sj);
    const candidates: string[] = (Array.isArray(job.slice_map)
      ? (job.slice_map.find((x: any) => Array.isArray(x?.subjectCandidates))?.subjectCandidates ?? [])
      : []) as string[];
    if (candidates.length === 0) throw new Error("Job has no subject candidates");
    const subjectsBlock = buildSubjectsBlock(candidates);

    const sliceMap = Array.isArray(job.slice_map) ? job.slice_map : [];
    const previewByKey = new Map<string, string>(sliceMap.map((x: any) => [x.key, x.preview]));

    const solved: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = it?.metadata?.key || `q-${i}`;
      const parsed = extractJsonObject(responseText(it));
      if (!parsed?.prompt) continue;
      solved.push({ key, parsed, preview: previewByKey.get(key) || String(parsed.prompt).slice(0, 100) });
    }
    if (solved.length === 0) throw new Error("No solved questions to classify");

    const requests = solved.map(({ key, parsed }) => ({
      request: {
        systemInstruction: { parts: [{ text: CLASSIFIER_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [{ text: `${subjectsBlock}--- QUESTION ---\n${parsed.prompt}\n\n--- CONCEPT ---\n${parsed.concept_tag || ""}\n\n--- EXPLANATION ---\n${(parsed.explanation || "").slice(0, 4000)}\n--- END ---` }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256, responseMimeType: "application/json" },
      },
      metadata: { key },
    }));

    const body = {
      batch: {
        display_name: `jarvis-classifier-${Date.now()}`,
        input_config: { requests: { requests } },
      },
    };
    const submitted = await submitGeminiBatch({ apiKey, model: MODEL, body: body });
    const json: any = submitted.ok ? submitted.json : {};
    const res = { ok: submitted.ok, status: submitted.ok ? 200 : submitted.status };
    const submitError = submitted.ok ? "" : submitted.message;
    if (!res.ok) throw new Error(submitError);
    const batchName = json?.name || json?.metadata?.name;
    if (!batchName) throw new Error("Classifier returned no name");

    // Pre-fill pending_review with solved questions (subject TBD)
    const pending = solved.map(({ key, parsed, preview }) => ({
      key,
      preview,
      prompt: parsed.prompt,
      options: parsed.options || [],
      explanation: parsed.explanation || "",
      concept_tag: parsed.concept_tag || "",
      suggested_index: null,
      confidence: "pending",
      reason: "awaiting classifier",
      status: "pending",
    }));

    await supabase.from("jarvis_batch_jobs").update({
      classifier_batch_id: batchName,
      classifier_status: "pending",
      pending_review: pending,
      status: "classifying",
    }).eq("id", job.id);

    return { ok: true, batchName, count: solved.length };
  });

// ----- Ingest classifier results into pending_review -----
const IngestClsInput = z.object({ jobId: z.string().uuid() });
export const ingestClassifierBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IngestClsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("jarvis_batch_jobs").select("*").eq("id", data.jobId).single();
    if (error) throw error;
    if (!job.classifier_batch_id) throw new Error("No classifier batch on this job");
    const apiKey = await getFirstGeminiKey(supabase);
    const cj = await fetchBatch(apiKey, job.classifier_batch_id);
    if (mapBatchStatus(getBatchState(cj)) !== "succeeded") throw new Error("Classifier batch not succeeded yet.");
    const items = await downloadResponses(apiKey, cj);

    const byKey = new Map<string, { idx: number | null; conf: string; reason: string }>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = it?.metadata?.key || `q-${i}`;
      const parsed = extractJsonObject(responseText(it));
      if (!parsed) continue;
      byKey.set(key, {
        idx: Number.isInteger(parsed.subject_index) ? parsed.subject_index : null,
        conf: String(parsed.confidence || "medium"),
        reason: String(parsed.reason || ""),
      });
    }

    const pending = Array.isArray(job.pending_review) ? job.pending_review : [];
    const updated = pending.map((p: any) => {
      const r = byKey.get(p.key);
      if (!r) return p;
      return { ...p, suggested_index: r.idx, confidence: r.conf, reason: r.reason };
    });

    await supabase.from("jarvis_batch_jobs").update({
      pending_review: updated,
      classifier_status: "succeeded",
      status: "needs_review",
    }).eq("id", job.id);

    return { ok: true, classified: byKey.size };
  });

// ----- Import reviewed questions (manual overrides) -----
const ImportReviewInput = z.object({
  jobId: z.string().uuid(),
  // map: key → subject_id (override) ; if omitted, uses suggested_index
  overrides: z.record(z.string(), z.string().uuid().nullable()).optional(),
});
export const importReviewedQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from("jarvis_batch_jobs").select("*").eq("id", data.jobId).single();
    if (error) throw error;
    const pending = Array.isArray(job.pending_review) ? job.pending_review : [];
    if (pending.length === 0) return { inserted: 0, remaining: 0 };

    // Resolve candidate name → id for fallback (suggested_index path)
    const candidates: string[] = (Array.isArray(job.slice_map)
      ? (job.slice_map.find((x: any) => Array.isArray(x?.subjectCandidates))?.subjectCandidates ?? [])
      : []) as string[];
    let candidateIds: (string | null)[] = [];
    if (candidates.length) {
      const { data: subs } = await supabase.from("subjects").select("id, name").in("name", candidates);
      const byName = new Map<string, string>((subs ?? []).map((s: any) => [s.name, s.id]));
      candidateIds = candidates.map((n) => byName.get(n) ?? null);
    }

    const overrides = data.overrides || {};
    let inserted = 0;
    let skippedExisting = 0;
    const remaining: any[] = [];
    const errors: string[] = [];

    for (const p of pending) {
      if (p.status === "imported") continue;
      let targetSubject: string | null = null;
      if (Object.prototype.hasOwnProperty.call(overrides, p.key)) {
        targetSubject = overrides[p.key] ?? null;
      } else if (Number.isInteger(p.suggested_index) && p.suggested_index >= 1 && p.suggested_index <= candidateIds.length) {
        targetSubject = candidateIds[p.suggested_index - 1] ?? null;
      }
      if (!targetSubject) { remaining.push(p); continue; }
      try {
        const { count } = await supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", targetSubject);
        const { data: q, error: qErr } = await supabase
          .from("questions")
          .upsert(
            {
              subject_id: targetSubject,
              stem: p.prompt,
              explanation: p.explanation || null,
              sort_order: (count ?? 0) + 1,
            },
            { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        if (qErr) throw qErr;
        if (!q?.id) { skippedExisting++; continue; }
        const rows = (p.options || []).map((o: any, idx: number) => ({
          question_id: q.id, label: o.letter || String.fromCharCode(65 + idx),
          text: o.body || o.text || "", is_correct: !!o.is_correct, sort_order: idx + 1,
        }));
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        inserted++;
      } catch (e: any) {
        errors.push(`${p.key}: ${e?.message || String(e)}`.slice(0, 200));
        remaining.push(p);
      }
    }

    const newStatus = remaining.length === 0 ? "ingested" : "needs_review";
    await supabase.from("jarvis_batch_jobs").update({
      status: newStatus,
      pending_review: remaining.length > 0 ? remaining : null,
      result_summary: {
        ...(job.result_summary || {}),
        inserted: ((job.result_summary?.inserted ?? 0) as number) + inserted,
        skippedExisting: ((job.result_summary?.skippedExisting ?? 0) as number) + skippedExisting,
        review_errors: errors.slice(0, 20),
      },
    }).eq("id", job.id);

    return { inserted, skippedExisting, remaining: remaining.length, errors: errors.slice(0, 20) };
  });

// ----- Delete -----
const DelInput = z.object({ jobId: z.string().uuid() });
export const deleteJarvisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from("jarvis_batch_jobs").delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
