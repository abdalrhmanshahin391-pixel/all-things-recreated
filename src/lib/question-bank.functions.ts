import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QbIndex, QbMeta, QbQuestion } from "@/lib/question-bank";
import {
  QB_FORMAT,
  QB_VERSION,
  assertAdmin,
  collectQuestions,
  deleteGroupFile,
  pourIntoCourse,
  readGroupFile,
  readIndex,
  safeSegment,
  writeGroupFile,
  writeIndex,
} from "@/lib/question-bank.server";

/** Every saved group with its labels — the page reads this to draw the list. */
export const qbListGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ groups: QbMeta[] }> => {
    await assertAdmin(context);
    const index = await readIndex();
    return { groups: index.groups };
  });

/** Saves a whole subject (or a hand-picked set) as a reusable group on Drive. */
export const qbSaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    year: string;
    semester: string;
    subject: string;
    subjectId: string;
    questionIds?: string[];
    source?: string | null;
  }) => d)
  .handler(async ({ data, context }): Promise<{ meta: QbMeta }> => {
    await assertAdmin(context);
    const name = data.name.trim();
    if (!name) throw new Error("Give the group a name.");
    const questions = await collectQuestions(data.subjectId, data.questionIds);
    if (!questions.length) throw new Error("No questions found for that selection.");

    const now = new Date().toISOString();
    const index = await readIndex();
    const meta: QbMeta = {
      id: crypto.randomUUID(),
      name,
      year: safeSegment(data.year, "Unsorted year"),
      semester: safeSegment(data.semester, "Unsorted semester"),
      subject: safeSegment(data.subject, "Unsorted subject"),
      count: questions.length,
      sort_order: index.groups.length + 1,
      created_at: now,
      updated_at: now,
      source: data.source ?? null,
    };
    await writeGroupFile(meta, questions);
    index.groups.push(meta);
    await writeIndex(index);
    return { meta };
  });

/** Opens one group so it can be previewed or poured into a course. */
export const qbReadGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<{ meta: QbMeta; questions: QbQuestion[] } | { missing: true }> => {
    await assertAdmin(context);
    const index = await readIndex();
    const meta = index.groups.find((g) => g.id === data.id);
    if (!meta) throw new Error("That group is not in the index any more.");
    const file = await readGroupFile(meta);
    if (!file) return { missing: true };
    return { meta, questions: file.questions ?? [] };
  });

/** Renames a group or moves it to different Year / Semester / Subject shelves. */
export const qbUpdateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string; year: string; semester: string; subject: string }) => d)
  .handler(async ({ data, context }): Promise<{ meta: QbMeta }> => {
    await assertAdmin(context);
    const index = await readIndex();
    const current = index.groups.find((g) => g.id === data.id);
    if (!current) throw new Error("Group not found.");

    const next: QbMeta = {
      ...current,
      name: data.name.trim() || current.name,
      year: safeSegment(data.year, "Unsorted year"),
      semester: safeSegment(data.semester, "Unsorted semester"),
      subject: safeSegment(data.subject, "Unsorted subject"),
      updated_at: new Date().toISOString(),
    };

    const moved =
      next.year !== current.year || next.semester !== current.semester || next.subject !== current.subject;
    const file = await readGroupFile(current);
    if (file) {
      await writeGroupFile(next, file.questions ?? []);
      if (moved) await deleteGroupFile(current);
    }

    index.groups = index.groups.map((g) => (g.id === next.id ? next : g));
    await writeIndex(index);
    return { meta: next };
  });

/** Stores the manual order the admin dragged the groups into. */
export const qbReorderGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const index = await readIndex();
    const rank = new Map(data.ids.map((id, i) => [id, i + 1]));
    index.groups = index.groups.map((g) => ({ ...g, sort_order: rank.get(g.id) ?? g.sort_order }));
    await writeIndex(index);
    return { ok: true };
  });

export const qbDeleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const index = await readIndex();
    const meta = index.groups.find((g) => g.id === data.id);
    if (meta) {
      try {
        await deleteGroupFile(meta);
      } catch {
        // The index entry still goes away even when the Drive file was removed by hand.
      }
    }
    index.groups = index.groups.filter((g) => g.id !== data.id);
    await writeIndex(index);
    return { ok: true };
  });

/** Creates a new subject in the chosen course section and fills it from the group. */
export const qbAddToCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; sectionId: string; subjectName?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const index = await readIndex();
    const meta = index.groups.find((g) => g.id === data.id);
    if (!meta) throw new Error("Group not found.");
    const file = await readGroupFile(meta);
    if (!file) throw new Error("The group's file is missing on Google Drive.");
    const result = await pourIntoCourse({
      sectionId: data.sectionId,
      subjectName: (data.subjectName || meta.name).trim(),
      questions: file.questions ?? [],
    });
    return result;
  });

/** One download containing every group — the offline safety copy. */
export const qbExportAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const index = await readIndex();
    const groups: Array<{ meta: QbMeta; questions: QbQuestion[]; missing?: boolean }> = [];
    for (const meta of index.groups) {
      const file = await readGroupFile(meta);
      groups.push({ meta, questions: file?.questions ?? [], missing: !file });
    }
    return { format: QB_FORMAT, version: QB_VERSION, exported_at: new Date().toISOString(), groups };
  });

/** Restores groups from an exported file back onto Drive. */
export const qbImportAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groups: Array<{ meta: QbMeta; questions: QbQuestion[] }>; replace?: boolean }) => d)
  .handler(async ({ data, context }): Promise<{ imported: number; skipped: number }> => {
    await assertAdmin(context);
    const index: QbIndex = data.replace
      ? { format: QB_FORMAT, version: QB_VERSION, groups: [] }
      : await readIndex();
    let imported = 0;
    let skipped = 0;
    for (const entry of data.groups ?? []) {
      if (!entry?.meta?.name || !entry.questions?.length) { skipped++; continue; }
      const now = new Date().toISOString();
      const meta: QbMeta = {
        ...entry.meta,
        id: index.groups.some((g) => g.id === entry.meta.id) ? crypto.randomUUID() : entry.meta.id,
        count: entry.questions.length,
        sort_order: index.groups.length + 1,
        created_at: entry.meta.created_at || now,
        updated_at: now,
      };
      await writeGroupFile(meta, entry.questions);
      index.groups.push(meta);
      imported++;
    }
    await writeIndex(index);
    return { imported, skipped };
  });
