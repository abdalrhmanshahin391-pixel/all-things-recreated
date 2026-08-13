/**
 * Server-only backup engine. Imported exclusively from inside
 * createServerFn handlers (see site-backup.functions.ts).
 */
import {
  BACKUP_FORMAT, BACKUP_VERSION, EXPORT_TABLE_LIST, SELF_PARENT_COLUMNS,
  type BackupMode, type SiteBackup, type ImportTableResult,
} from "./backup-tables";

export async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

/** Paginate a table with a stable order so rows are never skipped or doubled. */
async function fetchAll(admin: any, table: string): Promise<any[]> {
  const rows: any[] = [];
  const page = 1000;
  let from = 0;
  let ordered = true;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let res = ordered
      ? await admin.from(table).select("*").order("id", { ascending: true }).range(from, from + page - 1)
      : await admin.from(table).select("*").range(from, from + page - 1);
    if (res.error && ordered) {
      // tables without an `id` column (settings singletons, join tables)
      ordered = false;
      res = await admin.from(table).select("*").range(from, from + page - 1);
    }
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    const data = res.data ?? [];
    if (!data.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

export async function buildExport(admin: any, mode: BackupMode): Promise<SiteBackup> {
  const tables: Record<string, any[]> = {};
  for (const t of EXPORT_TABLE_LIST) {
    try {
      tables[t] = await fetchAll(admin, t);
    } catch {
      tables[t] = [];
    }
  }

  const files: Array<{ bucket: string; path: string }> = [];
  const seen = new Set<string>();
  const push = (bucket: string, path: string | null | undefined) => {
    if (!path) return;
    const key = `${bucket}::${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ bucket, path });
  };

  if (mode !== "db") {
    for (const u of tables["universities"] ?? []) {
      push("university-logos", u.logo_path);
      push("university-logos", u.image_path);
      push("university-logos", u.hero_image_path);
    }
    for (const c of tables["courses"] ?? []) push("course-images", c.image_url);
    for (const q of tables["questions"] ?? []) push("question-images", q.image_url);
    for (const s of tables["committee_subjects"] ?? []) push("committee-images", s.image_url);
  }

  const drive_files: SiteBackup["drive_files"] = [];
  for (const r of tables["committee_resources"] ?? []) {
    if (r.storage_provider === "drive" || r.drive_file_id) {
      drive_files.push({ id: r.id, title: r.title, drive_file_id: r.drive_file_id ?? null });
      continue; // bytes already live safely on Google Drive
    }
    if (mode === "all") push("committee-files", r.file_path);
  }

  // The study-plan PDF lives in committee-files but is referenced from
  // site_settings, so it must be collected explicitly or it never travels.
  if (mode === "all") {
    for (const s of tables["site_settings"] ?? []) push("committee-files", s.study_plan_path);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    mode,
    tables,
    files,
    drive_files,
  };
}

/** Upsert a batch; on failure retry row-by-row so one bad row can't kill 199. */
async function writeRows(
  admin: any,
  table: string,
  rows: any[],
  failed: Array<{ id: string | null; error: string }>,
): Promise<number> {
  if (!rows.length) return 0;
  let written = 0;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await admin.from(table).upsert(slice, { onConflict: "id", ignoreDuplicates: false });
    if (!error) {
      written += slice.length;
      continue;
    }
    for (const row of slice) {
      const one = await admin.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: false });
      if (one.error) failed.push({ id: row?.id ?? null, error: one.error.message });
      else written++;
    }
  }
  return written;
}

/**
 * Restore one table. Self-referencing tables are written in waves: roots
 * first, then each generation of children, so folders always exist before
 * the files inside them.
 */
export async function importTableRows(admin: any, table: string, rows: any[]): Promise<ImportTableResult> {
  const failed: Array<{ id: string | null; error: string }> = [];
  if (!rows.length) return { table, attempted: 0, written: 0, failed };

  const parentCol = SELF_PARENT_COLUMNS[table];
  let written = 0;

  if (parentCol) {
    const done = new Set<string>();
    let pending = rows.slice();
    while (pending.length) {
      const ready = pending.filter((r) => !r[parentCol] || done.has(String(r[parentCol])));
      if (!ready.length) {
        // orphans or cycles — write the rest as-is and report anything rejected
        written += await writeRows(admin, table, pending, failed);
        break;
      }
      written += await writeRows(admin, table, ready, failed);
      for (const r of ready) done.add(String(r.id));
      const readyIds = new Set(ready.map((r) => r.id));
      pending = pending.filter((r) => !readyIds.has(r.id));
    }
  } else {
    written += await writeRows(admin, table, rows, failed);
  }

  return { table, attempted: rows.length, written, failed };
}
