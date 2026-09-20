// Aqua MCQ Gen Pro — Stage 1 (extraction).
//
// Every PDF page is rendered in the browser, uploaded to the private
// "amg-pages" bucket, and then read by the AI ONE PAGE AT A TIME as an image
// (never OCR text) so photographed papers keep their layout.
//
// Two run modes:
//   standard — one live request per page.
//   batch    — Google/OpenAI batch endpoints (~50% cheaper, slower).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GROUPS = "amg_groups";
const PAGES = "amg_pages";
const ITEMS = "amg_items";
const EVENTS = "amg_events";
const KEYS = "amg_keys";
const BUCKET = "amg-pages";

export const AMG_MODELS = {
  google: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  openai: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  ],
} as const;

type Ctx = { supabase: any; userId: string };

async function ensureStaff(context: any): Promise<Ctx> {
  const { supabase, userId } = context;
  const { data: allowed } = await supabase.rpc("can_use_amg", { _user_id: userId });
  if (!allowed) throw new Error("Forbidden");
  return { supabase, userId };
}

/** Approval stage: admins and QA members. */
async function ensureReviewer(context: any): Promise<Ctx> {
  const { supabase, userId } = context;
  const { data: allowed } = await supabase.rpc("can_review_amg", { _user_id: userId });
  if (!allowed) throw new Error("Forbidden");
  return { supabase, userId };
}

async function ensureAdmin(context: any): Promise<Ctx> {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase, userId };
}

async function getKey(supabase: any, provider: string): Promise<string> {
  const { data } = await supabase.from(KEYS).select("api_key").eq("provider", provider).maybeSingle();
  const key = String(data?.api_key ?? "").trim();
  if (!key) {
    throw new Error(
      provider === "google"
        ? "No Google AI Studio key saved for Aqua MCQ Gen Pro. Add it in the tool's key box."
        : "No OpenAI key saved for Aqua MCQ Gen Pro. Add it in the tool's key box.",
    );
  }
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function downloadPageBase64(supabase: any, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("The page image could not be loaded. Re-upload the PDF.");
  return bytesToBase64(new Uint8Array(await data.arrayBuffer()));
}

// ---------------------------------------------------------------- prompt ---

function buildPrompt(group: any, pageNo: number): string {
  const multi = String(group?.form_b_style ?? "in_question") === "multi_answer";
  const extra = String(group?.instructions ?? "").trim();
  return `You transcribe ONE page (page ${pageNo}) of a medical exam past paper. The page is given to you as an IMAGE. Read it visually, exactly as printed.

Return STRICT JSON only, no markdown fences:
{"questions":[{"number":"12","form":"A|B","stem":"...","statements":[{"n":"1","text":"..."}],"options":[{"label":"A","text":"..."}],"flagged":false,"flag_reason":""}]}

TWO QUESTION SHAPES — decide per question:

FORM A (normal): a numbered stem, then options A) B) C) D) whose texts are answer wordings.
 - "form":"A", "stem" = the question number and statement, "statements":[], "options" = A–D verbatim.

FORM B (combination): a numbered stem, then NUMBERED statements 1) 2) 3) 4), then options A) B) C) D) that are combinations of those numbers ("1,2", "1,2,3", "all mentioned", "all of the above", "1,4").
 - The rule: if numbered statements 1,2,3,4 appear ABOVE options A–D, it is FORM B.
 - "form":"B".
${multi
  ? ` - MULTI-ANSWER STYLE: "stem" = the question line only. Put every numbered statement into "options" using its number as the label ("1","2","3","4"). Copy the printed A–D combinations into "statements" as {"n":"A","text":"1,2"} so the reviewer can still see them.`
  : ` - IN-QUESTION STYLE: "stem" = the question line FOLLOWED by all numbered statements, each on its own line, verbatim. Also list them separately in "statements". "options" = the printed A–D combinations verbatim.`}

RULES:
- Transcribe EVERY question on this page, in reading order. Never skip, shorten, translate or correct anything.
- Keep the printed question number in "number".
- FLAGGING: if anything is missing or unreadable — a missing option, a missing statement, a stem cut off, a question continuing on another page — still return the question, set "flagged":true and write a short "flag_reason". Never invent missing content.
- Pay special attention to the FIRST and LAST question on the page: they are often split across pages. If incomplete, flag them.
- A Form A question missing any of its options must be flagged too.
- If the page has no questions (cover, index, blank), return {"questions":[]}.
- Do NOT answer the questions and do NOT explain anything.${extra ? `\n\nADMINISTRATOR INSTRUCTIONS FOR THIS PDF (follow them):\n${extra.slice(0, 4000)}` : ""}`;
}

function parseJson(text: string): any {
  let raw = String(text ?? "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  raw = raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(raw);
}

function dupHash(stem: string): string {
  const norm = String(stem ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) | 0;
  return `${norm.slice(0, 60)}#${h}`;
}

function normaliseQuestions(json: any): any[] {
  const list = Array.isArray(json?.questions) ? json.questions : [];
  return list.map((q: any) => {
    const statements = Array.isArray(q?.statements)
      ? q.statements.map((s: any) => ({ n: String(s?.n ?? "").slice(0, 8), text: String(s?.text ?? "").slice(0, 2000) })).filter((s: any) => s.text)
      : [];
    const options = Array.isArray(q?.options)
      ? q.options.map((o: any) => ({ label: String(o?.label ?? "").slice(0, 8), text: String(o?.text ?? "").slice(0, 2000) })).filter((o: any) => o.text)
      : [];
    const stem = String(q?.stem ?? "").slice(0, 8000);
    const form = String(q?.form ?? "A").toUpperCase() === "B" ? "B" : "A";
    let flagged = Boolean(q?.flagged);
    let reason = String(q?.flag_reason ?? "").slice(0, 300);
    if (!stem) { flagged = true; reason = reason || "The question text is missing."; }
    if (options.length < 2) { flagged = true; reason = reason || "Some options are missing."; }
    if (form === "B" && statements.length === 0) { flagged = true; reason = reason || "The numbered statements are missing."; }
    return { number: String(q?.number ?? "").slice(0, 16), form, stem, statements, options, flagged, flag_reason: reason };
  }).filter((q: any) => q.stem || q.options.length);
}

async function storeQuestions(supabase: any, group: any, page: any, questions: any[]) {
  await supabase.from(ITEMS).delete().eq("group_id", group.id).eq("page_no", page.page_no).eq("status", "pending").eq("archived", false);
  if (!questions.length) return 0;
  const rows = questions.map((q, i) => {
    const base = {
      form: q.form,
      number_label: q.number,
      stem: q.stem,
      statements: q.statements,
      options: q.options,
      flagged: q.flagged,
      flag_reason: q.flag_reason,
      answer_mode: q.form === "B" && String(group.form_b_style) === "multi_answer" ? "multiple" : "single",
      answer_labels: [] as string[],
    };
    return {
      group_id: group.id,
      page_id: page.id,
      page_no: page.page_no,
      order_index: i,
      ...base,
      // Snapshot of the freshly extracted question, used to restart approval later.
      orig: base,
      dup_hash: dupHash(q.stem),
    };
  });
  const { error } = await supabase.from(ITEMS).insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ------------------------------------------------------------- providers ---

async function callGoogle(apiKey: string, model: string, prompt: string, imageB64: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageB64 } }, { text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google refused the page (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
}

async function callOpenAI(apiKey: string, model: string, prompt: string, imageB64: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(openAiBody(model, prompt, imageB64)),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI refused the page (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.choices?.[0]?.message?.content ?? "";
}

function openAiBody(model: string, prompt: string, imageB64: string) {
  const body: any = {
    model,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}`, detail: "high" } },
      ],
    }],
  };
  if (!/^gpt-5/.test(model)) body.temperature = 0;
  return body;
}

// ----------------------------------------------------------------- keys ----

export const amgListKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureStaff(context);
    const { data } = await supabase.from(KEYS).select("provider, updated_at");
    const out: Record<string, string | null> = { google: null, openai: null };
    for (const row of data ?? []) out[row.provider] = row.updated_at;
    return out;
  });

export const amgSaveKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: z.enum(["google", "openai"]),
    apiKey: z.string().min(10).max(400),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from(KEYS)
      .upsert({ provider: data.provider, api_key: data.apiKey.trim(), updated_at: new Date().toISOString() }, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const amgDeleteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.enum(["google", "openai"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    await supabase.from(KEYS).delete().eq("provider", data.provider);
    return { ok: true };
  });

// --------------------------------------------------------------- groups ----

export const amgListGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: groups } = await supabase.from(GROUPS).select("*").order("created_at", { ascending: false });
    const list = groups ?? [];
    if (!list.length) return [];
    const { data: items } = await supabase.from(ITEMS).select("group_id, status, flagged");
    return list.map((g: any) => {
      const mine = (items ?? []).filter((i: any) => i.group_id === g.id);
      return {
        ...g,
        total: mine.length,
        pending: mine.filter((i: any) => i.status === "pending").length,
        approved: mine.filter((i: any) => i.status === "approved").length,
        flagged: mine.filter((i: any) => i.flagged && i.status === "pending").length,
      };
    });
  });

export const amgCreateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(1).max(80),
    provider: z.enum(["google", "openai"]),
    model: z.string().min(2).max(60),
    mode: z.enum(["standard", "batch"]),
    formBStyle: z.enum(["in_question", "multi_answer"]),
    instructions: z.string().max(4000).default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const { data: row, error } = await supabase.from(GROUPS).insert({
      name: data.name.trim(),
      provider: data.provider,
      model: data.model,
      mode: data.mode,
      form_b_style: data.formBStyle,
      instructions: data.instructions,
      status: "draft",
      created_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amgUpdateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    patch: z.object({
      name: z.string().min(1).max(80).optional(),
      provider: z.enum(["google", "openai"]).optional(),
      model: z.string().min(2).max(60).optional(),
      mode: z.enum(["standard", "batch"]).optional(),
      form_b_style: z.enum(["in_question", "multi_answer"]).optional(),
      instructions: z.string().max(4000).optional(),
      status: z.enum(["draft", "extracting", "paused", "approval", "solving", "importing", "imported", "done"]).optional(),
      source_name: z.string().max(200).optional(),
      page_count: z.number().int().min(0).max(1000).optional(),
      error: z.string().max(500).nullable().optional(),
      answer_source: z.enum(["ai", "source", "key"]).optional(),
      answer_key: z.string().max(20000).optional(),
      source_text: z.string().max(40000).optional(),
      prefer_source: z.boolean().optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row, error } = await supabase.from(GROUPS).update(data.patch).eq("id", data.groupId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amgDeleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: pages } = await supabase.from(PAGES).select("storage_path").eq("group_id", data.groupId);
    const paths = (pages ?? []).map((p: any) => p.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from(GROUPS).delete().eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const amgGetGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group) throw new Error("This group no longer exists.");
    const { data: pages } = await supabase.from(PAGES).select("*").eq("group_id", data.groupId).order("page_no");
    const { data: items } = await supabase.from(ITEMS).select("id, page_no, status, flagged").eq("group_id", data.groupId);
    return { group, pages: pages ?? [], items: items ?? [] };
  });

/** Registers one rendered page (client uploaded the image first). */
export const amgRegisterPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    pageNo: z.number().int().min(1).max(1000),
    storagePath: z.string().min(3).max(400),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: row, error } = await supabase.from(PAGES).upsert({
      group_id: data.groupId,
      page_no: data.pageNo,
      storage_path: data.storagePath,
      status: "ready",
      error: null,
    }, { onConflict: "group_id,page_no" }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ------------------------------------------------------- standard extract --

export const amgExtractPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    pageNo: z.number().int().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group) throw new Error("This group no longer exists.");
    const { data: page } = await supabase.from(PAGES).select("*").eq("group_id", data.groupId).eq("page_no", data.pageNo).maybeSingle();
    if (!page?.storage_path) throw new Error(`Page ${data.pageNo} has no stored image yet.`);

    try {
      const apiKey = await getKey(supabase, group.provider);
      const imageB64 = await downloadPageBase64(supabase, page.storage_path);
      const prompt = buildPrompt(group, data.pageNo);
      const text = group.provider === "google"
        ? await callGoogle(apiKey, group.model, prompt, imageB64)
        : await callOpenAI(apiKey, group.model, prompt, imageB64);
      const questions = normaliseQuestions(parseJson(text));
      const count = await storeQuestions(supabase, group, page, questions);
      await supabase.from(PAGES).update({ status: "done", error: null }).eq("id", page.id);
      return { ok: true, count };
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 400);
      await supabase.from(PAGES).update({ status: "failed", error: message }).eq("id", page.id);
      return { ok: false, count: 0, error: message };
    }
  });

// ---------------------------------------------------------- batch extract --

async function submitGoogleBatch(apiKey: string, model: string, requests: any[]): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ batch: { display_name: `amg-${Date.now()}`, input_config: { requests: { requests } } } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Batch submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  const name = json?.name || json?.metadata?.name;
  if (!name) throw new Error("Batch submit returned no job name.");
  return name;
}

async function submitOpenAiBatch(apiKey: string, model: string, lines: string[]): Promise<string> {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append("file", new Blob([lines.join("\n")], { type: "application/jsonl" }), "amg.jsonl");
  const up = await fetch("https://api.openai.com/v1/files", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  });
  const upJson: any = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`Batch upload failed (${up.status}): ${JSON.stringify(upJson).slice(0, 300)}`);
  const res = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input_file_id: upJson.id, endpoint: "/v1/chat/completions", completion_window: "24h" }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Batch create failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  void model;
  return json.id as string;
}

export const amgStartBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group) throw new Error("This group no longer exists.");
    const { data: pages } = await supabase.from(PAGES).select("*").eq("group_id", data.groupId).neq("status", "done").order("page_no");
    const todo = (pages ?? []).filter((p: any) => p.storage_path);
    if (!todo.length) throw new Error("Every page is already read.");
    const apiKey = await getKey(supabase, group.provider);

    const map: Record<string, number> = {};
    let batchName: string;
    if (group.provider === "google") {
      const requests: any[] = [];
      for (const p of todo) {
        const b64 = await downloadPageBase64(supabase, p.storage_path);
        const key = `p${p.page_no}`;
        map[key] = p.page_no;
        requests.push({
          request: {
            contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: b64 } }, { text: buildPrompt(group, p.page_no) }] }],
            generation_config: { temperature: 0, response_mime_type: "application/json" },
          },
          metadata: { key },
        });
      }
      batchName = await submitGoogleBatch(apiKey, group.model, requests);
    } else {
      const lines: string[] = [];
      for (const p of todo) {
        const b64 = await downloadPageBase64(supabase, p.storage_path);
        const key = `p${p.page_no}`;
        map[key] = p.page_no;
        lines.push(JSON.stringify({
          custom_id: key,
          method: "POST",
          url: "/v1/chat/completions",
          body: openAiBody(group.model, buildPrompt(group, p.page_no), b64),
        }));
      }
      batchName = await submitOpenAiBatch(apiKey, group.model, lines);
    }

    await supabase.from(GROUPS).update({
      batch_name: batchName, batch_stage: "extract", batch_map: map, status: "extracting", error: null,
    }).eq("id", group.id);
    await supabase.from(PAGES).update({ status: "queued" }).eq("group_id", group.id).neq("status", "done");
    return { ok: true, pages: todo.length };
  });

export const amgPollBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group?.batch_name) return { state: "idle" as const };
    const apiKey = await getKey(supabase, group.provider);

    let done = false;
    let results: { key: string; text: string }[] = [];

    if (group.provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${group.batch_name}`, { headers: { "x-goog-api-key": apiKey } });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Batch status failed (${res.status}).`);
      const state = String(json?.metadata?.state || json?.state || "");
      if (state.endsWith("FAILED") || state.endsWith("CANCELLED") || state.endsWith("EXPIRED")) {
        await supabase.from(GROUPS).update({ batch_name: null, batch_stage: null, error: `The batch run ended as ${state}.` }).eq("id", group.id);
        return { state: "failed" as const };
      }
      done = state.endsWith("SUCCEEDED");
      if (done) {
        let inline: any[] = json?.response?.inlinedResponses?.inlinedResponses
          ?? json?.response?.inlineResponses?.inlineResponses ?? [];
        const file = json?.response?.responsesFile || json?.responsesFile;
        if ((!inline || !inline.length) && file) {
          const fr = await fetch(`https://generativelanguage.googleapis.com/download/v1beta/${file}:download?alt=media`, { headers: { "x-goog-api-key": apiKey } });
          const text = await fr.text();
          inline = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
        }
        results = (inline ?? []).map((item: any, i: number) => ({
          key: item?.metadata?.key ?? `k-${i}`,
          text: item?.response?.candidates?.[0]?.content?.parts?.[0]?.text
            ?? item?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        }));
      }
    } else {
      const res = await fetch(`https://api.openai.com/v1/batches/${group.batch_name}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Batch status failed (${res.status}).`);
      const status = String(json?.status ?? "");
      if (["failed", "expired", "cancelled"].includes(status)) {
        await supabase.from(GROUPS).update({ batch_name: null, batch_stage: null, error: `The batch run ended as ${status}.` }).eq("id", group.id);
        return { state: "failed" as const };
      }
      done = status === "completed";
      if (done && json?.output_file_id) {
        const fr = await fetch(`https://api.openai.com/v1/files/${json.output_file_id}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
        const text = await fr.text();
        results = text.split("\n").filter(Boolean).map((line) => {
          try {
            const row = JSON.parse(line);
            return { key: row?.custom_id ?? "", text: row?.response?.body?.choices?.[0]?.message?.content ?? "" };
          } catch { return { key: "", text: "" }; }
        });
      }
    }

    if (!done) return { state: "running" as const };

    const map: Record<string, number> = group.batch_map ?? {};
    const { data: pages } = await supabase.from(PAGES).select("*").eq("group_id", group.id);
    let stored = 0;
    for (const r of results) {
      const pageNo = map[r.key];
      const page = (pages ?? []).find((p: any) => p.page_no === pageNo);
      if (!page) continue;
      try {
        const questions = normaliseQuestions(parseJson(r.text));
        stored += await storeQuestions(supabase, group, page, questions);
        await supabase.from(PAGES).update({ status: "done", error: null }).eq("id", page.id);
      } catch (e: any) {
        await supabase.from(PAGES).update({ status: "failed", error: String(e?.message ?? e).slice(0, 300) }).eq("id", page.id);
      }
    }
    await supabase.from(GROUPS).update({ batch_name: null, batch_stage: null, status: "approval" }).eq("id", group.id);
    await supabase.from(EVENTS).insert({ group_id: group.id, action: "batch_extract_done", detail: { questions: stored } });
    return { state: "done" as const, stored };
  });

// =========================================================== approval =======

/** Signed links to every page picture of a group (for the review screen). */
export const amgPageUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: pages } = await supabase.from(PAGES).select("page_no, storage_path").eq("group_id", data.groupId).order("page_no");
    const out: { page_no: number; url: string | null }[] = [];
    for (const p of pages ?? []) {
      if (!p.storage_path) { out.push({ page_no: p.page_no, url: null }); continue; }
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 60 * 60 * 6);
      out.push({ page_no: p.page_no, url: signed?.signedUrl ?? null });
    }
    return out;
  });

export const amgListItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    filter: z.enum(["pending", "flagged", "approved", "all"]).default("pending"),
    pageNo: z.number().int().min(0).max(1000).default(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    let q = supabase.from(ITEMS).select("*").eq("group_id", data.groupId).order("page_no").order("order_index");
    if (data.filter === "pending") q = q.eq("status", "pending");
    if (data.filter === "approved") q = q.eq("status", "approved");
    if (data.filter === "flagged") q = q.eq("flagged", true).eq("status", "pending");
    if (data.pageNo > 0) q = q.eq("page_no", data.pageNo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ItemPatch = z.object({
  stem: z.string().max(8000).optional(),
  number_label: z.string().max(16).optional(),
  form: z.enum(["A", "B"]).optional(),
  statements: z.array(z.object({ n: z.string().max(8), text: z.string().max(2000) })).max(30).optional(),
  options: z.array(z.object({ label: z.string().max(8), text: z.string().max(2000) })).max(30).optional(),
  answer_mode: z.enum(["single", "multiple"]).optional(),
  answer_labels: z.array(z.string().max(8)).max(30).optional(),
  flagged: z.boolean().optional(),
  flag_reason: z.string().max(300).optional(),
});

/**
 * Admin-only: clear the review copy of a group (all extracted questions) while
 * keeping the group and its uploaded pages, so they can be sent again.
 */
export const amgClearGroupItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const { count } = await supabase.from(ITEMS).select("id", { count: "exact", head: true }).eq("group_id", data.groupId);
    const { error } = await supabase.from(ITEMS).delete().eq("group_id", data.groupId);
    if (error) throw new Error(error.message);
    await supabase.from(GROUPS).update({ status: "draft" }).eq("id", data.groupId);
    await supabase.from(EVENTS).insert({
      group_id: data.groupId, actor_id: userId, action: "review_cleared", detail: { count: count ?? 0 },
    });
    return { ok: true, removed: count ?? 0 };
  });

export const amgUpdateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid(), patch: ItemPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const patch: any = { ...data.patch, updated_at: new Date().toISOString() };
    if (typeof patch.stem === "string") patch.dup_hash = dupHash(patch.stem);
    const { data: row, error } = await supabase.from(ITEMS).update(patch).eq("id", data.itemId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amgAddItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    pageNo: z.number().int().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: page } = await supabase.from(PAGES).select("id").eq("group_id", data.groupId).eq("page_no", data.pageNo).maybeSingle();
    const { data: last } = await supabase.from(ITEMS).select("order_index").eq("group_id", data.groupId).eq("page_no", data.pageNo)
      .order("order_index", { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await supabase.from(ITEMS).insert({
      group_id: data.groupId, page_id: page?.id ?? null, page_no: data.pageNo,
      order_index: (last?.order_index ?? -1) + 1,
      form: "A", stem: "", options: [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }],
      flagged: true, flag_reason: "Added by hand — still empty.",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const amgDeleteItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { error } = await supabase.from(ITEMS).delete().in("id", data.itemIds);
    if (error) throw new Error(error.message);
    return { ok: true, removed: data.itemIds.length };
  });

export const amgSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    itemIds: z.array(z.string().uuid()).min(1).max(1000),
    status: z.enum(["pending", "approved", "skipped"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureReviewer(context);
    const { error } = await supabase.from(ITEMS).update({ status: data.status, updated_at: new Date().toISOString() }).in("id", data.itemIds);
    if (error) throw new Error(error.message);
    const { data: first } = await supabase.from(ITEMS).select("group_id").eq("id", data.itemIds[0]).maybeSingle();
    if (first) {
      await supabase.from(EVENTS).insert({
        group_id: first.group_id, actor_id: userId,
        action: data.status === "approved" ? "approved" : data.status === "pending" ? "returned_to_review" : "skipped",
        detail: { count: data.itemIds.length },
      });
    }
    return { ok: true };
  });

export const amgListEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: rows } = await supabase.from(EVENTS).select("*").eq("group_id", data.groupId)
      .order("created_at", { ascending: false }).limit(100);
    return rows ?? [];
  });

/** Questions whose text repeats inside the group, newest copies listed first. */
export const amgDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: rows } = await supabase.from(ITEMS)
      .select("id, page_no, order_index, number_label, stem, statements, options, dup_hash, status, flagged")
      .eq("group_id", data.groupId).order("page_no").order("order_index");
    const byHash = new Map<string, any[]>();
    for (const r of rows ?? []) {
      if (!r.dup_hash) continue;
      const list = byHash.get(r.dup_hash) ?? [];
      list.push(r);
      byHash.set(r.dup_hash, list);
    }
    return [...byHash.values()].filter((l) => l.length > 1)
      .map((l) => ({ keep: l[0], extras: l.slice(1), items: l }));
  });

/** Ask the AI to fill in whatever is missing, reading the page picture again. */
export const amgCompleteItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    itemIds: z.array(z.string().uuid()).min(1).max(40),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group) throw new Error("This group no longer exists.");
    const apiKey = await getKey(supabase, group.provider);
    const { data: items } = await supabase.from(ITEMS).select("*").in("id", data.itemIds);
    const { data: pages } = await supabase.from(PAGES).select("page_no, storage_path").eq("group_id", data.groupId);

    let fixed = 0;
    const failures: string[] = [];
    for (const item of items ?? []) {
      const page = (pages ?? []).find((p: any) => p.page_no === item.page_no);
      if (!page?.storage_path) { failures.push(`Page ${item.page_no} has no picture.`); continue; }
      try {
        const b64 = await downloadPageBase64(supabase, page.storage_path);
        const prompt = `${buildPrompt(group, item.page_no)}

You are NOT transcribing the whole page this time. Find ONLY this question on the page and return it complete, filling in whatever is missing:
${JSON.stringify({ number: item.number_label, form: item.form, stem: item.stem, statements: item.statements, options: item.options, missing: item.flag_reason })}

Return the same JSON shape with exactly ONE question in "questions". If part of it truly is not on this page, keep "flagged":true and say why.`;
        const text = group.provider === "google"
          ? await callGoogle(apiKey, group.model, prompt, b64)
          : await callOpenAI(apiKey, group.model, prompt, b64);
        const [q] = normaliseQuestions(parseJson(text));
        if (!q) { failures.push(`Question ${item.number_label || item.id.slice(0, 6)} came back empty.`); continue; }
        const { error } = await supabase.from(ITEMS).update({
          form: q.form, number_label: q.number || item.number_label, stem: q.stem,
          statements: q.statements, options: q.options,
          flagged: q.flagged, flag_reason: q.flag_reason, dup_hash: dupHash(q.stem),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        if (error) throw new Error(error.message);
        fixed += 1;
      } catch (e: any) {
        failures.push(`Question ${item.number_label || item.id.slice(0, 6)}: ${String(e?.message ?? e).slice(0, 160)}`);
      }
    }
    return { fixed, failures };
  });

// =========================================================== solve & import ===

const SOLVE_SYSTEM = `You are a medical exam tutor. You are given ONE multiple-choice question with its options.

Return STRICT JSON only, no markdown fences:
{"answers":["A"],"concept":"<=8 words","explanation":"markdown","summary_table":"markdown table"}

Rules:
- "answers" holds the labels of the correct options exactly as given (e.g. ["C"] or ["1","3"]).
- ANSWER MODE SINGLE: exactly one label. MULTIPLE: every correct label.
- If the message lists ALLOWED ANSWER SETS (the combinations printed on the paper), you MUST return exactly one of those sets.
- "explanation" is GitHub-flavored Markdown with THREE sections separated by BLANK LINES:
  **Concept** — 3-4 sentences on the mechanism, including the key clue in the stem that points to it.
  **Why the correct answer is right** — 3-4 short bullets (typical presentation, diagnostic clue, or rule that settles it).
  **Why the other options are wrong** — one bullet per wrong option, each starting with the option's OWN TEXT in **bold** (no letter prefix), then a dash and 1-2 sentences saying what it would look like instead.
  Finish with one line starting with **Take-home** — a single sentence worth remembering.
- Keep it useful but tight: never exceed ~180 words in total.
- "summary_table" is a Markdown table: | Option | Verdict | Reason | with a |---|---|---| separator and one row per option; the Option column holds the option TEXT only (no letter prefix), correct rows ✓ and wrong rows ✗.
- Never invent options and never change their wording or order.
- Output JSON only.`;

async function callGoogleText(apiKey: string, model: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google refused the question (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
}

async function callOpenAiText(apiKey: string, model: string, system: string, prompt: string): Promise<string> {
  const body: any = {
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
  };
  if (!/^gpt-5/.test(model)) body.temperature = 0.2;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI refused the question (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json?.choices?.[0]?.message?.content ?? "";
}

/** "12: C" / "12 - A,B" / "12) 1,3" → { "12": ["C"] } */
function parseAnswerKey(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of String(text ?? "").split(/[\r\n;]+/)) {
    const m = line.match(/^\s*([\w.]+)\s*[).:\-–=]+\s*([A-Za-z0-9](?:\s*[,/+ ]\s*[A-Za-z0-9])*)\s*$/);
    if (!m) continue;
    const labels = m[2].split(/[,/+ ]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (labels.length) out.set(m[1].trim().toUpperCase(), labels);
  }
  return out;
}

function comboSetsFromItem(item: any): string[][] {
  if (item.form !== "B") return [];
  const raw = Array.isArray(item.statements) ? item.statements : [];
  const sets: string[][] = [];
  for (const s of raw) {
    const nums = String(s?.text ?? "").match(/\d+/g);
    if (nums && nums.length > 1) sets.push(nums);
  }
  return sets;
}

/** Solve a slice of approved questions. Call repeatedly until remaining is 0. */
export const amgSolveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    limit: z.number().int().min(1).max(10).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureStaff(context);
    const { data: group } = await supabase.from(GROUPS).select("*").eq("id", data.groupId).maybeSingle();
    if (!group) throw new Error("This group no longer exists.");

    const { data: items } = await supabase.from(ITEMS)
      .select("*").eq("group_id", data.groupId).eq("status", "approved").eq("solved", false)
      .order("page_no").order("order_index").limit(data.limit ?? 4);

    const answerSource = String(group.answer_source ?? "ai");
    const keyMap = answerSource === "key" ? parseAnswerKey(group.answer_key ?? "") : new Map<string, string[]>();
    const sourceText = String(group.source_text ?? "").trim();
    const apiKey = await getKey(supabase, group.provider);

    let solved = 0;
    const failures: string[] = [];

    for (const item of items ?? []) {
      try {
        const opts = Array.isArray(item.options) ? item.options : [];
        if (opts.length < 2) throw new Error("It has no options.");
        const optText = opts.map((o: any) => `${o.label}. ${o.text}`).join("\n");
        const sets = comboSetsFromItem(item);
        const given = keyMap.get(String(item.number_label ?? "").toUpperCase());
        const keyBlock = given?.length
          ? `OFFICIAL ANSWER KEY: the correct option(s) for this question are ${given.join(", ")}. You MUST mark exactly these and explain why they are right.\n`
          : "";
        const sourceBlock = sourceText && (answerSource === "source" || group.prefer_source)
          ? `REFERENCE SOURCE (base the answer and explanation on this text):\n${sourceText.slice(0, 20000)}\n\n`
          : "";
        const comboBlock = sets.length
          ? `ALLOWED ANSWER SETS (printed on the paper — choose exactly one):\n${sets.map((s) => s.join(",")).join("\n")}\n`
          : "";
        const mode = item.answer_mode === "multiple" ? "MULTIPLE" : "SINGLE";
        const prompt = `${sourceBlock}${keyBlock}ANSWER MODE: ${mode}\n${comboBlock}--- QUESTION ---\n${item.stem}\n\n${optText}\n--- END ---`;

        const text = group.provider === "google"
          ? await callGoogleText(apiKey, group.model, SOLVE_SYSTEM, prompt)
          : await callOpenAiText(apiKey, group.model, SOLVE_SYSTEM, prompt);
        const json = parseJson(text);

        const labels: string[] = Array.isArray(json?.answers) ? json.answers.map((a: any) => String(a).trim().toUpperCase()) : [];
        const valid = labels.filter((l) => opts.some((o: any) => String(o.label).toUpperCase() === l));
        if (!valid.length) throw new Error("The answer did not match any option.");
        if (sets.length) {
          const ok = sets.some((s) => s.length === valid.length && s.every((n) => valid.includes(n)));
          if (!ok) throw new Error("The answer is not one of the paper's printed combinations.");
        }

        const { error } = await supabase.from(ITEMS).update({
          answer_labels: valid,
          answer_mode: valid.length > 1 ? "multiple" : item.answer_mode,
          explanation: {
            concept: String(json?.concept ?? "").slice(0, 200),
            explanation: String(json?.explanation ?? "").slice(0, 12000),
            summary_table: String(json?.summary_table ?? "").slice(0, 6000),
          },
          solved: true,
          solve_error: null,
        }).eq("id", item.id);
        if (error) throw new Error(error.message);
        solved += 1;
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 200);
        failures.push(`Question ${item.number_label || item.id.slice(0, 6)}: ${msg}`);
        await supabase.from(ITEMS).update({ solve_error: msg }).eq("id", item.id);
      }
    }

    const { count: remaining } = await supabase.from(ITEMS)
      .select("id", { count: "exact", head: true })
      .eq("group_id", data.groupId).eq("status", "approved").eq("solved", false);

    return { solved, failures, remaining: remaining ?? 0 };
  });

/** Counts for the solve/import screen. */
export const amgProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureReviewer(context);
    const { data: rows } = await supabase.from(ITEMS)
      .select("status, solved, solve_error").eq("group_id", data.groupId);
    const list = rows ?? [];
    return {
      total: list.length,
      pending: list.filter((r: any) => r.status === "pending").length,
      approved: list.filter((r: any) => r.status === "approved").length,
      imported: list.filter((r: any) => r.status === "imported").length,
      solved: list.filter((r: any) => r.solved).length,
      failed: list.filter((r: any) => !r.solved && r.solve_error).length,
    };
  });

/** Import every approved + solved question into a course subject. */
export const amgImportGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    groupId: z.string().uuid(),
    subjectId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureStaff(context);
    const { data: items } = await supabase.from(ITEMS)
      .select("*").eq("group_id", data.groupId).eq("status", "approved").eq("solved", true)
      .order("page_no").order("order_index");
    if (!items?.length) throw new Error("There is no approved, solved question to import yet.");

    const { count } = await supabase.from("questions")
      .select("id", { count: "exact", head: true }).eq("subject_id", data.subjectId);
    let sort = (count ?? 0) + 1;

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const exp = (item.explanation ?? {}) as any;
        const explanation = [String(exp.explanation ?? ""), exp.summary_table ? `\n\n${exp.summary_table}` : ""].join("").trim() || null;
        const { data: q, error: qErr } = await supabase.from("questions").upsert(
          {
            subject_id: data.subjectId,
            stem: item.stem,
            explanation,
            answer_mode: item.answer_mode ?? "single",
            sort_order: sort,
          },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (qErr) throw new Error(qErr.message);
        if (!q?.id) { skipped += 1; continue; }

        const correct = (item.answer_labels ?? []).map((l: string) => String(l).toUpperCase());
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
        inserted += 1;
        sort += 1;
      } catch (e: any) {
        failed += 1;
        errors.push(String(e?.message ?? e).slice(0, 160));
      }
    }

    await supabase.from(EVENTS).insert({
      group_id: data.groupId, actor: userId, action: "import",
      detail: { inserted, skipped, failed, subject_id: data.subjectId },
    });
    if (inserted) await supabase.from(GROUPS).update({ status: "imported" }).eq("id", data.groupId);

    return { inserted, skipped, failed, errors: errors.slice(0, 5) };
  });
