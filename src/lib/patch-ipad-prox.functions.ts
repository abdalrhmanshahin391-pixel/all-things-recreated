// Patch iPad ProX — fully batched (50% off) image importer.
// Phase 1: every page image goes into a Gemini BATCH job that returns the
//          question borders. The browser then crops + uploads the pictures.
// Phase 2: every uploaded question picture goes into a second Gemini BATCH job
//          that solves it. Import is only possible once phase 2 is complete.
//
// Jarvis Batch v2 iPad (and its image mode) is untouched: this file owns its
// own tables (patch_prox_jobs / _pages / _items).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  CUTTER_SYSTEM, IMAGE_SOLVER_SYSTEM, buildSubjectsBlock, decideCorrectLetter,
  extractJson, fetchBatch, downloadResponses, getBatchState, mapBatchStatus,
  responseText, normalizeLetter,
} from "@/lib/patch-ipad-prox.server";

const CUT_MODEL = "gemini-2.5-flash";
const SOLVE_MODEL = "gemini-2.5-flash";
const JOBS = "patch_prox_jobs";
const PAGES = "patch_prox_pages";
const ITEMS = "patch_prox_items";
export const PROX_BUCKET = "question-images";

async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase: supabase as any, userId: userId as string };
}

async function getGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
    .order("slot", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/gemini-keys.");
  return data.api_key as string;
}

async function submitBatch(apiKey: string, model: string, displayName: string, requests: any[]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ batch: { display_name: displayName, input_config: { requests: { requests } } } }),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Batch submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  const name: string | undefined = json?.name || json?.metadata?.name;
  if (!name) throw new Error("Batch submit returned no name");
  return name;
}

// ---------------- 1. create job ----------------

export const createProxJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    courseId: z.string().uuid(),
    groupId: z.string().uuid(),
    subjectId: z.string().uuid().nullable().optional(),
    pdfName: z.string().min(1).max(200),
    totalPages: z.number().int().min(1).max(2000),
    subjectCandidates: z.array(z.string().min(1).max(120)).max(200).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS).insert({
      user_id: userId,
      course_id: data.courseId,
      group_id: data.groupId,
      subject_id: data.subjectId ?? null,
      pdf_name: data.pdfName,
      total_pages: data.totalPages,
      subject_candidates: data.subjectCandidates,
      phase: "created",
    }).select("id").single();
    if (error) throw error;

    const rows = Array.from({ length: data.totalPages }, (_, i) => ({
      job_id: job.id, page_number: i + 1, status: "pending",
    }));
    const { error: pErr } = await supabase.from(PAGES).insert(rows);
    if (pErr) throw pErr;
    return { jobId: job.id as string };
  });

// ---------------- 2. phase 1 — submit page images to the cut batch ----------------

export const submitCutBatchProX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    pages: z.array(z.object({
      pageNumber: z.number().int().min(1).max(2000),
      base64: z.string().min(100).max(8_000_000),
    })).min(1).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);
    const { data: job, error } = await supabase.from(JOBS).select("id, cut_batch_ids").eq("id", data.jobId).single();
    if (error) throw error;

    const requests = data.pages.map((p) => ({
      request: {
        systemInstruction: { parts: [{ text: CUTTER_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: p.base64 } },
            { text: "Locate every question on this page and return the JSON described in the system prompt." },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" },
      },
      metadata: { key: `page-${p.pageNumber}` },
    }));

    const batchName = await submitBatch(apiKey, CUT_MODEL, `prox-cut-${data.jobId.slice(0, 8)}-${Date.now()}`, requests);
    const ids = [...(Array.isArray(job.cut_batch_ids) ? job.cut_batch_ids : []), batchName];
    await supabase.from(JOBS).update({ cut_batch_ids: ids, phase: "cut_submitted", error: null, updated_at: new Date().toISOString() }).eq("id", data.jobId);
    await supabase.from(PAGES).update({ status: "cut_submitted" })
      .eq("job_id", data.jobId).in("page_number", data.pages.map((p) => p.pageNumber));

    return { batchId: batchName, pages: data.pages.length };
  });

// ---------------- 3. phase 1 — poll the cut batches ----------------

export const pollCutBatchProX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);
    const { data: job, error } = await supabase.from(JOBS).select("id, cut_batch_ids").eq("id", data.jobId).single();
    if (error) throw error;
    const batches: string[] = Array.isArray(job.cut_batch_ids) ? job.cut_batch_ids : [];
    if (!batches.length) return { done: false, states: [] as string[] };

    const states: string[] = [];
    let allDone = true;
    for (const b of batches) {
      let bj: any;
      try { bj = await fetchBatch(apiKey, b); } catch { states.push("pending"); allDone = false; continue; }
      const st = mapBatchStatus(getBatchState(bj));
      states.push(st);
      if (st !== "succeeded") { if (st === "failed" || st === "cancelled" || st === "expired") continue; allDone = false; continue; }

      const items = await downloadResponses(apiKey, bj);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const key = String(it?.metadata?.key || it?.key || it?.request?.metadata?.key || "");
        const m = key.match(/page-(\d+)/);
        if (!m) continue;
        const pageNumber = Number(m[1]);
        const parsed = it?.error ? null : extractJson(responseText(it));
        const raw: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
        const regions = raw
          .map((r: any, idx: number) => ({
            n: Number(r?.n ?? idx + 1),
            label: String(r?.label ?? `Q${idx + 1}`).slice(0, 40),
            y_top: Number(r?.y_top ?? 0),
            y_bottom: Number(r?.y_bottom ?? 0),
            x_left: Number(r?.x_left ?? 0),
            x_right: Number(r?.x_right ?? 1000),
          }))
          .filter((r) => Number.isFinite(r.y_top) && Number.isFinite(r.y_bottom) && r.y_bottom - r.y_top >= 15);
        await supabase.from(PAGES).update({
          regions,
          status: regions.length ? "cut_ready" : "empty",
          error: it?.error ? JSON.stringify(it.error).slice(0, 200) : null,
        }).eq("job_id", data.jobId).eq("page_number", pageNumber);
      }
    }

    // pages that were submitted but got no answer back stay pending -> mark failed
    if (allDone) {
      await supabase.from(PAGES).update({ status: "cut_failed", error: "Gemini returned no borders for this page" })
        .eq("job_id", data.jobId).eq("status", "cut_submitted");
      await supabase.from(JOBS).update({ phase: "cut_ready", updated_at: new Date().toISOString() }).eq("id", data.jobId);
    }
    return { done: allDone, states };
  });

// ---------------- 4. phase 1 — save the uploaded crops ----------------

export const saveCropsProX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    pageNumber: z.number().int().min(1).max(2000),
    crops: z.array(z.object({ path: z.string().min(3).max(300), label: z.string().max(120).optional() })).max(40),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    await supabase.from(PAGES).update({
      crops: data.crops,
      status: data.crops.length ? "cropped" : "empty",
      error: null,
    }).eq("job_id", data.jobId).eq("page_number", data.pageNumber);

    if (data.crops.length) {
      const rows = data.crops.map((c, i) => ({
        job_id: data.jobId, page_number: data.pageNumber, item_index: i,
        image_path: c.path, status: "pending",
      }));
      await supabase.from(ITEMS).delete().eq("job_id", data.jobId).eq("page_number", data.pageNumber);
      const { error } = await supabase.from(ITEMS).insert(rows);
      if (error) throw error;
    }
    return { saved: data.crops.length };
  });

// ---------------- 5. phase 2 — submit the question pictures to the solve batch ----------------

export const submitSolveBatchProX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    items: z.array(z.object({
      pageNumber: z.number().int().min(1).max(2000),
      itemIndex: z.number().int().min(0).max(200),
      base64: z.string().min(100).max(6_000_000),
    })).min(1).max(12),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);

    const { data: job, error } = await supabase.from(JOBS)
      .select("id, phase, subject_candidates, solve_batch_ids").eq("id", data.jobId).single();
    if (error) throw error;

    // gate: phase 1 must be finished
    const { data: pages } = await supabase.from(PAGES).select("status").eq("job_id", data.jobId);
    const unfinished = (pages ?? []).filter((p: any) => p.status !== "cropped" && p.status !== "empty");
    if (unfinished.length) throw new Error(`Phase 1 is not finished yet — ${unfinished.length} page(s) still pending.`);

    const subjectsBlock = buildSubjectsBlock(Array.isArray(job.subject_candidates) ? job.subject_candidates : []);
    const requests = data.items.map((it) => ({
      request: {
        systemInstruction: { parts: [{ text: IMAGE_SOLVER_SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: it.base64 } },
            { text: `${subjectsBlock}Solve this single question image and return JSON per the system prompt.` },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" },
      },
      metadata: { key: `q-${it.pageNumber}-${it.itemIndex}` },
    }));

    const batchName = await submitBatch(apiKey, SOLVE_MODEL, `prox-solve-${data.jobId.slice(0, 8)}-${Date.now()}`, requests);
    const ids = [...(Array.isArray(job.solve_batch_ids) ? job.solve_batch_ids : []), batchName];
    await supabase.from(JOBS).update({ solve_batch_ids: ids, phase: "solve_submitted", updated_at: new Date().toISOString() }).eq("id", data.jobId);
    for (const it of data.items) {
      await supabase.from(ITEMS).update({ status: "submitted" })
        .eq("job_id", data.jobId).eq("page_number", it.pageNumber).eq("item_index", it.itemIndex);
    }
    return { batchId: batchName, count: data.items.length };
  });

// ---------------- 6. phase 2 — poll the solve batches ----------------

export const pollSolveBatchProX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const apiKey = await getGeminiKey(supabase);
    const { data: job, error } = await supabase.from(JOBS).select("id, solve_batch_ids").eq("id", data.jobId).single();
    if (error) throw error;
    const batches: string[] = Array.isArray(job.solve_batch_ids) ? job.solve_batch_ids : [];
    if (!batches.length) return { done: false, states: [] as string[] };

    const states: string[] = [];
    let allDone = true;
    for (const b of batches) {
      let bj: any;
      try { bj = await fetchBatch(apiKey, b); } catch { states.push("pending"); allDone = false; continue; }
      const st = mapBatchStatus(getBatchState(bj));
      states.push(st);
      if (st !== "succeeded") { if (st === "failed" || st === "cancelled" || st === "expired") continue; allDone = false; continue; }

      const items = await downloadResponses(apiKey, bj);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const key = String(it?.metadata?.key || it?.key || it?.request?.metadata?.key || "");
        const m = key.match(/q-(\d+)-(\d+)/);
        if (!m) continue;
        const pageNumber = Number(m[1]);
        const itemIndex = Number(m[2]);
        const parsed = it?.error ? null : extractJson(responseText(it));
        if (!parsed?.correct_letter && !parsed?.explanation) {
          await supabase.from(ITEMS).update({
            status: "failed",
            error: it?.error ? JSON.stringify(it.error).slice(0, 200) : "no usable answer from Gemini",
          }).eq("job_id", data.jobId).eq("page_number", pageNumber).eq("item_index", itemIndex);
          continue;
        }
        const letters: string[] = Array.isArray(parsed.letters) && parsed.letters.length >= 2
          ? parsed.letters.map((l: any) => normalizeLetter(l)).filter(Boolean)
          : ["A", "B", "C", "D"];
        const explanation = String(parsed.explanation || "").trim();
        const correct = decideCorrectLetter(explanation, letters, parsed.correct_letter);
        await supabase.from(ITEMS).update({
          status: "solved",
          letters,
          correct_letter: correct,
          stem: String(parsed.prompt || "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
          explanation: explanation || null,
          subject_index: Number.isInteger(parsed.subject_index) ? parsed.subject_index : null,
          error: null,
        }).eq("job_id", data.jobId).eq("page_number", pageNumber).eq("item_index", itemIndex);
      }
    }

    if (allDone) {
      await supabase.from(ITEMS).update({ status: "failed", error: "no answer returned for this picture" })
        .eq("job_id", data.jobId).eq("status", "submitted");
      await supabase.from(JOBS).update({ phase: "solve_ready", updated_at: new Date().toISOString() }).eq("id", data.jobId);
    }
    return { done: allDone, states };
  });

// ---------------- 7. import ----------------

export const importProxJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS)
      .select("id, subject_id, group_id, subject_candidates").eq("id", data.jobId).single();
    if (error) throw error;

    const { data: items, error: iErr } = await supabase.from(ITEMS)
      .select("id, page_number, item_index, image_path, status, letters, correct_letter, stem, explanation, subject_index")
      .eq("job_id", data.jobId).order("page_number").order("item_index");
    if (iErr) throw iErr;
    const all = items ?? [];
    if (!all.length) throw new Error("Nothing to import yet.");
    const pending = all.filter((i: any) => i.status === "pending" || i.status === "submitted");
    if (pending.length) throw new Error(`Phase 2 is not finished — ${pending.length} question(s) still waiting on Gemini.`);

    const candidates: string[] = Array.isArray(job.subject_candidates) ? job.subject_candidates : [];
    let idToUse: (string | null)[] = [];
    if (!job.subject_id && candidates.length) {
      const { data: subs } = await supabase.from("subjects").select("id, name").eq("group_id", job.group_id);
      const byLower = new Map<string, string>((subs ?? []).map((s: any) => [String(s.name).trim().toLowerCase(), s.id]));
      idToUse = candidates.map((n) => byLower.get(String(n).trim().toLowerCase()) ?? null);
    }

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const it of all) {
      if (it.status !== "solved") { failed++; continue; }
      try {
        let targetSubject: string | null = job.subject_id ?? null;
        if (!targetSubject) {
          const idx = Number.isInteger(it.subject_index) ? it.subject_index : 0;
          if (idx >= 1 && idx <= idToUse.length) targetSubject = idToUse[idx - 1];
          if (!targetSubject) targetSubject = idToUse.find(Boolean) ?? null;
        }
        if (!targetSubject) { failed++; errors.push(`p${it.page_number}q${it.item_index + 1}: no subject resolved`); continue; }

        const letters: string[] = (Array.isArray(it.letters) && it.letters.length >= 2 ? it.letters : ["A", "B", "C", "D"])
          .map((l: any) => normalizeLetter(l)).filter(Boolean);
        let correct = normalizeLetter(it.correct_letter);
        if (!letters.includes(correct)) correct = letters[0];

        const { count } = await supabase.from("questions")
          .select("id", { count: "exact", head: true }).eq("subject_id", targetSubject);

        const stem = String(it.stem || `Question ${it.item_index + 1} (page ${it.page_number})`).slice(0, 300);
        const { data: q, error: qErr } = await supabase.from("questions").upsert(
          {
            subject_id: targetSubject,
            stem,
            explanation: it.explanation || null,
            image_url: it.image_path,
            sort_order: (count ?? 0) + 1,
          },
          { onConflict: "subject_id,stem_hash", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (qErr) throw qErr;
        if (!q?.id) { skipped++; continue; }

        const rows = letters.map((l, j) => ({
          question_id: q.id, label: l, text: null as string | null,
          is_correct: l === correct, sort_order: j + 1,
        }));
        if (!rows.some((r) => r.is_correct)) rows[0].is_correct = true;
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        await supabase.from(ITEMS).update({ status: "imported" }).eq("id", it.id);
        inserted++;
      } catch (e: any) {
        failed++;
        errors.push(`p${it.page_number}q${it.item_index + 1}: ${(e?.message || String(e)).slice(0, 140)}`);
      }
    }

    await supabase.from(JOBS).update({
      phase: "imported", imported_count: inserted, updated_at: new Date().toISOString(),
      error: errors.length ? errors.slice(0, 5).join("; ").slice(0, 500) : null,
    }).eq("id", data.jobId);

    return { inserted, skipped, failed, errors: errors.slice(0, 10) };
  });

// ---------------- 8. listing / detail / delete ----------------

export const listProxJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data, error } = await supabase.from(JOBS)
      .select("id, pdf_name, total_pages, phase, imported_count, error, created_at")
      .order("created_at", { ascending: false }).limit(25);
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const getProxJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { data: job, error } = await supabase.from(JOBS).select("*").eq("id", data.jobId).single();
    if (error) throw error;
    const { data: pages } = await supabase.from(PAGES)
      .select("id, page_number, status, regions, crops, error").eq("job_id", data.jobId).order("page_number");
    const { data: items } = await supabase.from(ITEMS)
      .select("id, page_number, item_index, image_path, status, correct_letter, error")
      .eq("job_id", data.jobId).order("page_number").order("item_index");
    return { job, pages: pages ?? [], items: items ?? [] };
  });

export const deleteProxJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = await ensureAdmin(context);
    const { error } = await supabase.from(JOBS).delete().eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
