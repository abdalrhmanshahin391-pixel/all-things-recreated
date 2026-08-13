import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saveAdminHubLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { layout: unknown }) => {
    const l = data?.layout as { groups?: unknown } | null;
    if (!l || !Array.isArray(l.groups)) throw new Error("Invalid layout");
    if (JSON.stringify(l).length > 200_000) throw new Error("Layout too large");
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
    const { error } = await (supabaseAdmin.from as any)("admin_hub_layout").upsert(
      { id: true, layout: data.layout, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) throw error;
    return { ok: true };
  });