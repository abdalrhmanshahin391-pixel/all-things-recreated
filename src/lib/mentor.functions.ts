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

export type MentorTreasureRow = {
  id: string;
  kind: "dua";
  title: string | null;
  body: string;
  source: string | null;
  tags: string[];
  is_pinned_today: boolean;
  pinned_on: string | null;
  sort_order: number;
  created_at: string;
};

export type MentorCategoryWithEntries = {
  id: string;
  kind: "dua";
  title: string;
  sort_order: number;
  entries: {
    id: string;
    category_id: string;
    title: string | null;
    body: string;
    sort_order: number;
  }[];
};

/** Get tasks for the authenticated user */
export const mentorGetTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { kind?: string } | undefined) => ({ kind: d?.kind || "religious" }))
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
  .validator((d: { kind?: string; title: string; is_daily: boolean }) => {
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

/** Seed default tasks template with one click */
export const mentorSeedDefaultTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PRESET_DAILY_TASKS } = await import("@/lib/mentor-data");

    const { data: existing } = await (supabaseAdmin.from as any)("mentor_tasks")
      .select("title")
      .eq("user_id", context.userId);

    const existingTitles = new Set((existing || []).map((t: any) => t.title));
    const toInsert = PRESET_DAILY_TASKS
      .filter((p) => !existingTitles.has(p.title))
      .map((p, idx) => ({
        user_id: context.userId,
        kind: "religious",
        title: p.title,
        is_daily: p.is_daily,
        sort_order: (existing?.length ?? 0) + idx,
      }));

    if (toInsert.length > 0) {
      const { error } = await (supabaseAdmin.from as any)("mentor_tasks").insert(toInsert);
      if (error) throw new Error(error.message);
    }

    return { ok: true, addedCount: toInsert.length };
  });

/** Update an existing task */
export const mentorUpdateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; title: string; is_daily: boolean }) => {
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
  .validator((d: { id: string }) => {
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
  .validator((d: { taskId: string; isDaily: boolean; completedOn: string }) => {
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
  .validator((d: { taskIds: string[] } | undefined) => ({ taskIds: d?.taskIds || [] }))
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
  .validator(() => ({}))
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

/* =========================================================================
   TREASURES SERVER FUNCTIONS
========================================================================= */

/** Get all treasures for user */
export const mentorGetTreasures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from as any)("mentor_treasures")
      .select("id,kind,title,body,source,tags,is_pinned_today,pinned_on,sort_order,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (rows as MentorTreasureRow[]) || [];
  });

/** Add a new custom treasure */
export const mentorAddTreasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { title?: string; body: string; source?: string; tags?: string[] }) => {
    const b = (d?.body || "").trim();
    if (!b) throw new Error("نص الكنز مطلوب");
    return {
      title: (d?.title || "").trim() || null,
      body: b,
      source: (d?.source || "").trim() || null,
      tags: Array.isArray(d?.tags) ? d.tags : [],
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await (supabaseAdmin.from as any)("mentor_treasures")
      .insert({
        user_id: context.userId,
        kind: "dua",
        title: data.title,
        body: data.body,
        source: data.source,
        tags: data.tags,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, treasure: inserted as MentorTreasureRow };
  });

/** Delete a treasure */
export const mentorDeleteTreasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("المعرف مطلوب");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_treasures")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pin a treasure for today */
export const mentorPinTreasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; today: string }) => {
    if (!d?.id || !d?.today) throw new Error("بيانات غير صالحة");
    return { id: d.id, today: d.today };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Clear other pins
    await (supabaseAdmin.from as any)("mentor_treasures")
      .update({ is_pinned_today: false, pinned_on: null })
      .eq("user_id", context.userId)
      .eq("is_pinned_today", true);

    const { error } = await (supabaseAdmin.from as any)("mentor_treasures")
      .update({ is_pinned_today: true, pinned_on: data.today })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Unpin today's treasure */
export const mentorUnpinTreasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => ({ id: d.id }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_treasures")
      .update({ is_pinned_today: false, pinned_on: null })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================================
   DUAS / CATEGORIES & ENTRIES SERVER FUNCTIONS
========================================================================= */

/** Get categories and their entries */
export const mentorGetCategoriesWithEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [catsRes, entriesRes] = await Promise.all([
      (supabaseAdmin.from as any)("mentor_categories")
        .select("id,kind,title,sort_order")
        .eq("user_id", context.userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      (supabaseAdmin.from as any)("mentor_entries")
        .select("id,category_id,title,body,sort_order")
        .eq("user_id", context.userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (catsRes.error) throw new Error(catsRes.error.message);
    if (entriesRes.error) throw new Error(entriesRes.error.message);

    const entriesByCat = new Map<string, any[]>();
    for (const entry of entriesRes.data || []) {
      if (!entriesByCat.has(entry.category_id)) entriesByCat.set(entry.category_id, []);
      entriesByCat.get(entry.category_id)!.push(entry);
    }

    const categories = (catsRes.data || []).map((cat: any) => ({
      ...cat,
      entries: entriesByCat.get(cat.id) || [],
    }));

    return categories as MentorCategoryWithEntries[];
  });

/** Add a new category */
export const mentorAddCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { title: string }) => {
    const t = (d?.title || "").trim();
    if (!t) throw new Error("عنوان الفئة مطلوب");
    return { title: t };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin.from as any)("mentor_categories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);

    const { data: inserted, error } = await (supabaseAdmin.from as any)("mentor_categories")
      .insert({
        user_id: context.userId,
        kind: "dua",
        title: data.title,
        sort_order: count ?? 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, category: inserted };
  });

/** Delete a category */
export const mentorDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => ({ id: d.id }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_categories")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Add an entry (Dua) to category */
export const mentorAddEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { categoryId: string; title?: string; body: string }) => {
    const b = (d?.body || "").trim();
    if (!d?.categoryId || !b) throw new Error("بيانات غير مكتملة");
    return {
      categoryId: d.categoryId,
      title: (d?.title || "").trim() || null,
      body: b,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await (supabaseAdmin.from as any)("mentor_entries")
      .insert({
        user_id: context.userId,
        category_id: data.categoryId,
        title: data.title,
        body: data.body,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, entry: inserted };
  });

/** Delete an entry */
export const mentorDeleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => ({ id: d.id }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("mentor_entries")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Save a suggested Dua directly into user's personal collection */
export const mentorSaveSuggestedDua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { title: string; body: string; categoryTitle?: string }) => ({
    title: d.title,
    body: d.body,
    categoryTitle: d.categoryTitle || "أدعية مختارة ومحفوظة",
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let { data: cat } = await (supabaseAdmin.from as any)("mentor_categories")
      .select("id")
      .eq("user_id", context.userId)
      .eq("title", data.categoryTitle)
      .maybeSingle();

    if (!cat) {
      const { data: newCat, error: catErr } = await (supabaseAdmin.from as any)("mentor_categories")
        .insert({
          user_id: context.userId,
          kind: "dua",
          title: data.categoryTitle,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (catErr) throw new Error(catErr.message);
      cat = newCat;
    }

    const { error: entryErr } = await (supabaseAdmin.from as any)("mentor_entries")
      .insert({
        user_id: context.userId,
        category_id: cat.id,
        title: data.title,
        body: data.body,
      });

    if (entryErr) throw new Error(entryErr.message);
    return { ok: true };
  });
