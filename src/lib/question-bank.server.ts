import {
  driveDelete,
  driveEnsureFolderPath,
  driveFindFileInFolder,
  driveReadTextFile,
  driveWriteTextFile,
} from "./committee-drive.server";
import { disambiguatePictureStems } from "./question-bank";
import type { QbGroupFile, QbIndex, QbMeta, QbOption, QbQuestion } from "./question-bank";

export const QB_ROOT = "QuestionBank";
export const QB_INDEX = "_index.json";
export const QB_FORMAT = "aquaqbank-question-bank";
export const QB_VERSION = 1;


/** Drive folder names can't contain slashes; keep them tidy and predictable. */
export function safeSegment(value: string, fallback: string): string {
  const cleaned = String(value ?? "").replace(/[\\/'"]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function groupPath(meta: Pick<QbMeta, "year" | "semester" | "subject">): string[] {
  return [
    QB_ROOT,
    safeSegment(meta.year, "Unsorted year"),
    safeSegment(meta.semester, "Unsorted semester"),
    safeSegment(meta.subject, "Unsorted subject"),
  ];
}

export function groupFileName(id: string): string {
  return `${id}.json`;
}

export async function readIndex(): Promise<QbIndex> {
  const file = await driveReadTextFile([QB_ROOT], QB_INDEX);
  if (!file?.text) return { format: QB_FORMAT, version: QB_VERSION, groups: [] };
  try {
    const parsed = JSON.parse(file.text) as QbIndex;
    return { format: QB_FORMAT, version: QB_VERSION, groups: Array.isArray(parsed.groups) ? parsed.groups : [] };
  } catch {
    return { format: QB_FORMAT, version: QB_VERSION, groups: [] };
  }
}

export async function writeIndex(index: QbIndex): Promise<void> {
  await driveWriteTextFile([QB_ROOT], QB_INDEX, JSON.stringify(index, null, 2));
}

export async function writeGroupFile(meta: QbMeta, questions: QbQuestion[]): Promise<void> {
  const body: QbGroupFile = { format: QB_FORMAT, version: QB_VERSION, meta, questions };
  await driveWriteTextFile(groupPath(meta), groupFileName(meta.id), JSON.stringify(body, null, 2));
}

export async function readGroupFile(meta: QbMeta): Promise<QbGroupFile | null> {
  const file = await driveReadTextFile(groupPath(meta), groupFileName(meta.id));
  if (!file?.text) return null;
  try {
    return JSON.parse(file.text) as QbGroupFile;
  } catch {
    return null;
  }
}

export async function deleteGroupFile(meta: QbMeta): Promise<void> {
  const parentId = await driveEnsureFolderPath(groupPath(meta));
  const existing = await driveFindFileInFolder(groupFileName(meta.id), parentId);
  if (existing) await driveDelete(existing.id);
}

export async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

/** Pulls questions (with their answers) out of a course subject. */
export async function collectQuestions(subjectId: string, questionIds?: string[]): Promise<QbQuestion[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("questions")
    .select("id,stem,explanation,answer_mode,sort_order")
    .eq("subject_id", subjectId)
    .order("sort_order", { ascending: true });
  if (questionIds?.length) query = query.in("id", questionIds);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as Array<{ id: string; stem: string; explanation: string | null; answer_mode: "single" | "multiple"; sort_order: number }>;
  if (!list.length) return [];

  const { data: optRows, error: oErr } = await supabaseAdmin
    .from("question_options")
    .select("question_id,label,text,is_correct,sort_order")
    .in("question_id", list.map((q) => q.id))
    .order("sort_order", { ascending: true });
  if (oErr) throw new Error(oErr.message);

  const byQuestion = new Map<string, QbOption[]>();
  for (const o of (optRows ?? []) as any[]) {
    const arr = byQuestion.get(o.question_id) ?? [];
    arr.push({ label: o.label, text: o.text, is_correct: !!o.is_correct, sort_order: o.sort_order ?? arr.length + 1 });
    byQuestion.set(o.question_id, arr);
  }

  return list.map((q, i) => ({
    stem: q.stem,
    explanation: q.explanation ?? null,
    answer_mode: q.answer_mode ?? "single",
    sort_order: q.sort_order ?? i + 1,
    options: byQuestion.get(q.id) ?? [],
  }));
}

/** Creates a fresh subject in a course section and fills it with the saved questions. */
export async function pourIntoCourse(opts: {
  sectionId: string;
  subjectName: string;
  questions: QbQuestion[];
  /** Add to this EXISTING subject instead of creating a new one (the new questions go after the ones it has). */
  existingSubjectId?: string;
}): Promise<{ subjectId: string; saved: number; skipped: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let subject: { id: string } | null = null;
  let order = 1;
  if (opts.existingSubjectId) {
    const { data: found, error: fErr } = await supabaseAdmin
      .from("subjects").select("id, group_id").eq("id", opts.existingSubjectId).maybeSingle();
    if (fErr || !found) throw new Error("That subject does not exist (anymore).");
    if (opts.sectionId && found.group_id !== opts.sectionId) throw new Error("That subject is not in the chosen section.");
    subject = { id: found.id };
    const { data: last } = await supabaseAdmin
      .from("questions").select("sort_order").eq("subject_id", found.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    order = Number((last as any)?.sort_order ?? 0) + 1;
  } else {
    const { count } = await supabaseAdmin
      .from("subjects")
      .select("id", { count: "exact", head: true })
      .eq("group_id", opts.sectionId);

    const { data: created, error: sErr } = await supabaseAdmin
      .from("subjects")
      .insert({ group_id: opts.sectionId, name: opts.subjectName, sort_order: (count ?? 0) + 1 })
      .select("id")
      .single();
    if (sErr || !created) throw new Error(sErr?.message ?? "Could not create the subject");
    subject = created;
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const q of disambiguatePictureStems(opts.questions)) {
    if (!q.stem?.trim()) { failed++; continue; }
    const { data: inserted, error: qErr } = await supabaseAdmin
      .from("questions")
      .insert({
        subject_id: subject.id,
        stem: q.stem.trim(),
        explanation: q.explanation,
        answer_mode: q.answer_mode ?? "single",
        sort_order: order++,
        image_url: q.image_url ?? null,
      })
      .select("id")
      .single();
    if (qErr || !inserted) {
      if (/duplicate key|stemhash/i.test(qErr?.message ?? "")) skipped++;
      else failed++;
      continue;
    }
    if (q.options.length) {
      const { error: oErr } = await supabaseAdmin.from("question_options").insert(
        q.options.map((o, i) => ({
          question_id: inserted.id,
          label: o.label,
          text: o.text,
          is_correct: o.is_correct,
          sort_order: o.sort_order ?? i + 1,
        })),
      );
      if (oErr) failed++;
    }
    saved++;
  }
  return { subjectId: subject.id, saved, skipped, failed };
}

const stemKey = (stem: string) => String(stem ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Adds questions to an EXISTING Question Bank group. Questions whose text is already in the group are skipped. */
export async function appendToGroup(groupId: string, incoming: QbQuestion[]): Promise<{ id: string; name: string; added: number; skipped: number; total: number }> {
  const index = await readIndex();
  const meta = index.groups.find((g) => g.id === groupId);
  if (!meta) throw new Error("That Question Bank group does not exist (anymore).");
  const file = await readGroupFile(meta);
  const existing = file?.questions ?? [];
  const seen = new Set(existing.map((q) => stemKey(q.stem)));
  const fresh: QbQuestion[] = [];
  let skipped = 0;
  for (const q of incoming) {
    const key = stemKey(q.stem);
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    fresh.push(q);
  }
  const all = [...existing, ...fresh].map((q, i) => ({ ...q, sort_order: i + 1 }));
  meta.count = all.length;
  meta.updated_at = new Date().toISOString();
  await writeGroupFile(meta, all);
  await writeIndex(index);
  return { id: meta.id, name: meta.name, added: fresh.length, skipped, total: all.length };
}
