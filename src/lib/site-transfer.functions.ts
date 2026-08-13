import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TransferMode, TransferOverview } from "./backup-tables";
import { EXPORT_TABLE_LIST } from "./backup-tables";

export type { TransferMode, TransferOverview };

export const getTransferOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode?: TransferMode }) => d ?? {})
  .handler(async ({ data, context }): Promise<TransferOverview> => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const { buildOverview } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildOverview(supabaseAdmin, data?.mode ?? "data");
  });

export const exportTransferChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string; offset: number; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<{ rows: any[]; done: boolean }> => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    if (!EXPORT_TABLE_LIST.includes(data.table)) throw new Error(`Table not allowed: ${data.table}`);
    const { fetchTableChunk } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return fetchTableChunk(supabaseAdmin, data.table, data.offset ?? 0, Math.min(data.limit ?? 500, 1000));
  });

export const getDriveManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const { buildDriveManifest } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildDriveManifest(supabaseAdmin);
  });

/** Read the current unlock code (admins only) so it can be shown/changed. */
export const getTransferCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ code: string }> => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const { currentTransferCode } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { code: await currentTransferCode(supabaseAdmin) };
  });

export const setTransferCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const code = (data.code ?? "").trim();
    if (code.length < 6) throw new Error("Code must be at least 6 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("site_secrets").upsert(
      { key: "transfer_code", value: code, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Gate for the restore step — verifies the unlock code before anything is written. */
export const unlockTransferRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const { assertTransferCode } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTransferCode(supabaseAdmin, data.code);
    return { ok: true as const };
  });

/** Restore one table from a transfer package (reuses the proven import engine). */
export const restoreTransferTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string; rows: any[]; code: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertAdmin, importTableRows } = await import("./site-backup.server");
    await assertAdmin(context);
    const { assertTransferCode } = await import("./site-transfer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTransferCode(supabaseAdmin, data.code);
    const { BACKUP_TABLE_LIST } = await import("./backup-tables");
    if (!BACKUP_TABLE_LIST.includes(data.table)) throw new Error(`Table not allowed: ${data.table}`);
    return importTableRows(supabaseAdmin, data.table, Array.isArray(data.rows) ? data.rows : []);
  });
