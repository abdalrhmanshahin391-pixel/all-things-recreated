import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BACKUP_TABLE_LIST,
  guessContentType,
  type BackupMode,
  type SiteBackup,
  type ImportTableResult,
} from "./backup-tables";

export type { SiteBackup, BackupMode, ImportTableResult };

const STORAGE_BUCKETS = [
  "university-logos", "committee-images", "committee-files",
  "course-images", "question-images", "site-media",
] as const;

export const exportSiteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode?: BackupMode }) => d ?? {})
  .handler(async ({ data, context }): Promise<SiteBackup> => {
    const { assertAdmin, buildExport } = await import("./site-backup.server");
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildExport(supabaseAdmin, data?.mode ?? "db");
  });

export const signBackupFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string }) => d)
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    if (!(STORAGE_BUCKETS as readonly string[]).includes(data.bucket)) {
      throw new Error("Bucket not allowed");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage.from(data.bucket).createSignedUrl(data.path, 600);
    return { url: signed?.signedUrl ?? null };
  });

export const uploadBackupFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string; base64: string; contentType?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    if (!(STORAGE_BUCKETS as readonly string[]).includes(data.bucket)) {
      throw new Error("Bucket not allowed");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(data.path, bin, {
        contentType: data.contentType ?? guessContentType(data.path),
        upsert: true,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Restore a single table — the client calls this once per table. */
export const importSiteTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string; rows: any[] }) => d)
  .handler(async ({ data, context }): Promise<ImportTableResult> => {
    const { assertAdmin, importTableRows } = await import("./site-backup.server");
    await assertAdmin(context);
    if (!BACKUP_TABLE_LIST.includes(data.table)) {
      throw new Error(`Table not allowed: ${data.table}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return importTableRows(supabaseAdmin, data.table, Array.isArray(data.rows) ? data.rows : []);
  });

/** Current row counts, used for the before/after report. */
export const getBackupTableCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, number>> => {
    const { assertAdmin } = await import("./site-backup.server");
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: Record<string, number> = {};
    for (const t of BACKUP_TABLE_LIST) {
      const { count, error } = await supabaseAdmin.from(t as any).select("*", { count: "exact", head: true });
      out[t] = error ? 0 : (count ?? 0);
    }
    return out;
  });
