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
