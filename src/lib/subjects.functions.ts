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
