import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MentorTaskRow = {
  id: string;
  kind: "religious";
  title: string;
  is_daily: boolean;
  sort_order: number;
};

export type MentorCompletionRow = {
  task_id: string;
  completed_on: string;
};

/** Get tasks for the authenticated user */
export const mentorGetTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: string }) => ({ kind: d?.kind || "religious" }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from as any)("mentor_tasks")
      .select("id,kind,title,is_daily,sort_order")
      .eq("user_id", context.userId)
      .eq("kind", data.kind)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (rows as MentorTaskRow[]) || [];
  });

/** Add a new mentor task */
export const mentorAddTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: string; title: string; is_daily: boolean }) => {
    const t = (d?.title || "").trim();
    if (!t) throw new Error("يرجى إدخال عنوان المهمة");
    return {
      kind: d?.kind || "religious",
      title: t,
      is_daily: !!d?.is_daily,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Get current count for sort order
    const { count } = await (supabaseAdmin.from as any)("mentor_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("kind", data.kind);

    const { data: inserted, error } = await (supabaseAdmin.from as any)("mentor_tasks")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        title: data.title,
        is_daily: data.is_daily,
        sort_order: count ?? 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, task: inserted as MentorTaskRow };
  });

/** Update an existing task */
export const mentorUpdateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title: string; is_daily: boolean }) => {
    const t = (d?.title || "").trim();
    if (!d?.id || !t) throw new Error("بيانات غير صالحة");
    return { id: d.id, title: t, is_daily: !!d.is_daily };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_tasks")
      .update({ title: data.title, is_daily: data.is_daily })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a task */
export const mentorDeleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("معرّف المهمة مطلوب");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Toggle task completion status */
export const mentorToggleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; isDaily: boolean; completedOn: string }) => {
    if (!d?.taskId || !d?.completedOn) throw new Error("بيانات غير صالحة");
    return { taskId: d.taskId, isDaily: !!d.isDaily, completedOn: d.completedOn };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin.from as any)("mentor_task_completions")
      .select("id")
      .eq("task_id", data.taskId)
      .eq("user_id", context.userId);

    if (data.isDaily) {
      query = query.eq("completed_on", data.completedOn);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      let del = (supabaseAdmin.from as any)("mentor_task_completions")
        .delete()
        .eq("task_id", data.taskId)
        .eq("user_id", context.userId);
      if (data.isDaily) del = del.eq("completed_on", data.completedOn);
      const { error } = await del;
      if (error) throw new Error(error.message);
      return { ok: true, done: false };
    } else {
      const { error } = await (supabaseAdmin.from as any)("mentor_task_completions").insert({
        user_id: context.userId,
        task_id: data.taskId,
        completed_on: data.completedOn,
      });
      if (error) throw new Error(error.message);
      return { ok: true, done: true };
    }
  });

/** Get completions for a set of tasks */
export const mentorGetCompletions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskIds: string[] }) => ({ taskIds: d?.taskIds || [] }))
  .handler(async ({ data, context }) => {
    if (data.taskIds.length === 0) return [] as MentorCompletionRow[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin.from as any)("mentor_task_completions")
      .select("task_id,completed_on")
      .eq("user_id", context.userId)
      .in("task_id", data.taskIds);

    if (error) throw new Error(error.message);
    return (rows as MentorCompletionRow[]) || [];
  });

/** Overview stats query */
export const mentorGetOverviewStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [tasksRes, entriesCount, treasuresCount] = await Promise.all([
      (supabaseAdmin.from as any)("mentor_tasks")
        .select("id,kind,title,is_daily,sort_order")
        .eq("user_id", context.userId),
      (supabaseAdmin.from as any)("mentor_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
      (supabaseAdmin.from as any)("mentor_treasures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
    ]);

    const tasks = (tasksRes.data as MentorTaskRow[]) || [];
    const taskIds = tasks.map((t) => t.id);

    let completions: MentorCompletionRow[] = [];
    if (taskIds.length > 0) {
      const compRes = await (supabaseAdmin.from as any)("mentor_task_completions")
        .select("task_id,completed_on")
        .eq("user_id", context.userId)
        .in("task_id", taskIds);
      completions = (compRes.data as MentorCompletionRow[]) || [];
    }

    return {
      tasks,
      completions,
      entriesTotal: entriesCount.count ?? 0,
      treasuresTotal: treasuresCount.count ?? 0,
    };
  });
