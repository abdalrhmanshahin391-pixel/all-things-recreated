import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubjectAccess = "paid" | "free_logged_in" | "free_public";

export const setSubjectAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subjectId: string; accessLevel: SubjectAccess }) => {
    if (!data?.subjectId) throw new Error("subjectId required");
    if (!["paid", "free_logged_in", "free_public"].includes(data.accessLevel)) {
      throw new Error("invalid accessLevel");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subjects")
      .update({ access_level: data.accessLevel })
      .eq("id", data.subjectId);
    if (error) throw error;
    return { ok: true };
  });

export const setSubjectOrdered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subjectId: string; ordered: boolean }) => {
    if (!data?.subjectId) throw new Error("subjectId required");
    if (typeof data.ordered !== "boolean") throw new Error("ordered required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("subjects") as any)
      .update({ ordered: data.ordered })
      .eq("id", data.subjectId);
    if (error) throw error;
    return { ok: true };
  });


/**
 * Admin: merge one subject into another of the same course (the two may be in different sections).
 * Every question of `fromSubjectId` moves to `intoSubjectId` and goes after the questions that are already there.
 * A question whose text is already in the target (the database allows a text only once per subject) stays where it is and is counted in `skipped`.
 * With `deleteEmpty` the source subject is deleted when nothing is left in it.
 */
export const mergeSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fromSubjectId: string; intoSubjectId: string; deleteEmpty?: boolean }) => {
    if (!data?.fromSubjectId || !data?.intoSubjectId) throw new Error("fromSubjectId and intoSubjectId required");
    if (data.fromSubjectId === data.intoSubjectId) throw new Error("Choose a different subject to merge into.");
    return { fromSubjectId: data.fromSubjectId, intoSubjectId: data.intoSubjectId, deleteEmpty: data.deleteEmpty !== false };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: subs, error: subErr } = await db
      .from("subjects")
      .select("id, name, subject_groups(course_id)")
      .in("id", [data.fromSubjectId, data.intoSubjectId]);
    if (subErr) throw subErr;
    const from = (subs ?? []).find((s: any) => s.id === data.fromSubjectId);
    const into = (subs ?? []).find((s: any) => s.id === data.intoSubjectId);
    if (!from || !into) throw new Error("Subject not found. Reload the page.");
    if (!from.subject_groups?.course_id || from.subject_groups.course_id !== into.subject_groups?.course_id) {
      throw new Error("The two subjects must be in the same course.");
    }

    // read every row of a subject (the API returns at most 1000 rows per request)
    const readAll = async (subjectId: string) => {
      const rows: { id: string; stem_hash: string | null; sort_order: number | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await db
          .from("questions")
          .select("id, stem_hash, sort_order")
          .eq("subject_id", subjectId)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      return rows;
    };
    const moving = await readAll(data.fromSubjectId);
    const existing = await readAll(data.intoSubjectId);

    const taken = new Set(existing.map((q) => q.stem_hash).filter(Boolean));
    const toMove: typeof moving = [];
    let skipped = 0;
    for (const q of moving) {
      if (q.stem_hash && taken.has(q.stem_hash)) {
        skipped++;
        continue;
      }
      if (q.stem_hash) taken.add(q.stem_hash);
      toMove.push(q);
    }

    // 1) move them, then 2) number them after the questions that were already in the target
    for (let i = 0; i < toMove.length; i += 200) {
      const chunk = toMove.slice(i, i + 200).map((q) => q.id);
      const { error } = await db.from("questions").update({ subject_id: data.intoSubjectId }).in("id", chunk);
      if (error) throw error;
    }
    const base = existing.reduce((m, q) => Math.max(m, q.sort_order ?? 0), 0);
    for (let i = 0; i < toMove.length; i += 15) {
      await Promise.all(
        toMove.slice(i, i + 15).map(async (q, k) => {
          const { error } = await db.from("questions").update({ sort_order: base + i + k + 1 }).eq("id", q.id);
          if (error) throw error;
        }),
      );
    }

    let deleted = false;
    if (data.deleteEmpty && skipped === 0) {
      const { count, error: cErr } = await db.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", data.fromSubjectId);
      if (cErr) throw cErr;
      if ((count ?? 0) === 0) {
        const { error } = await db.from("subjects").delete().eq("id", data.fromSubjectId);
        if (error) throw error;
        deleted = true;
      }
    }
    return { ok: true, moved: toMove.length, skipped, deleted, fromName: from.name as string, intoName: into.name as string };
  });

/** Admin: put the subjects (topics) of one section in a new order. `subjectIds` is the whole section, first to last. */
export const reorderSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { groupId: string; subjectIds: string[] }) => {
    if (!data?.groupId) throw new Error("groupId required");
    if (!Array.isArray(data.subjectIds) || !data.subjectIds.length || data.subjectIds.length > 500) throw new Error("subjectIds required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // only subjects that really belong to this section, each once
    const { data: rows, error: readErr } = await (supabaseAdmin.from("subjects") as any).select("id").eq("group_id", data.groupId);
    if (readErr) throw readErr;
    const inGroup = new Set((rows ?? []).map((r: any) => r.id as string));
    const ids = [...new Set(data.subjectIds)].filter((id) => inGroup.has(id));
    if (ids.length !== inGroup.size) throw new Error("The list does not match the subjects of this section. Reload the page.");
    for (let i = 0; i < ids.length; i++) {
      const { error } = await (supabaseAdmin.from("subjects") as any).update({ sort_order: i + 1 }).eq("id", ids[i]);
      if (error) throw error;
    }
    return { ok: true };
  });
