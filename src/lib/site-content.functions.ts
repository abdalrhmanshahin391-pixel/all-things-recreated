import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SavePayload = {
  rows: Array<{
    key: string;
    group_key: string;
    group_label: string;
    label: string;
    kind: string;
    sort_order: number;
    value_en: string;
    value_ar: string;
    default_en: string;
    default_ar: string;
  }>;
};

export const saveSiteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SavePayload) => {
    if (!Array.isArray(data?.rows) || data.rows.length === 0) {
      throw new Error("Nothing to save");
    }
    if (data.rows.length > 500) throw new Error("Too many rows");
    for (const r of data.rows) {
      if (!r.key || r.key.length > 200) throw new Error("Invalid key");
      if ((r.value_en?.length ?? 0) > 4000 || (r.value_ar?.length ?? 0) > 4000) {
        throw new Error("Text is too long (max 4000 characters)");
      }
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
    const { error } = await (supabaseAdmin.from as any)("site_content").upsert(
      data.rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "key" },
    );
    if (error) throw error;
    return { ok: true, saved: data.rows.length };
  });

export const resetSiteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { keys: string[] }) => {
    if (!Array.isArray(data?.keys) || data.keys.length === 0) throw new Error("No keys");
    if (data.keys.length > 500) throw new Error("Too many keys");
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
    const { error } = await (supabaseAdmin.from as any)("site_content")
      .delete()
      .in("key", data.keys);
    if (error) throw error;
    return { ok: true };
  });