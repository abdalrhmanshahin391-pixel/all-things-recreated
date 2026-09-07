/**
 * Server-only engine for the full-site Transfer Package.
 * Imported exclusively from inside createServerFn handlers.
 */
import { EXPORT_TABLE_LIST, type TransferMode, type TransferOverview } from "./backup-tables";

/**
 * The transfer code lives in the admin-only `site_secrets` table. It used to
 * sit on `site_settings`, which is world-readable, so anyone could read it.
 */
export async function currentTransferCode(admin: any): Promise<string> {
  const { data } = await admin
    .from("site_secrets")
    .select("value")
    .eq("key", "transfer_code")
    .maybeSingle();
  const code = data?.value;
  if (typeof code !== "string" || !code.trim()) throw new Error("Transfer code is not configured");
  return code.trim();
}

export async function assertTransferCode(admin: any, code: string) {
  const expected = await currentTransferCode(admin);
  if ((code ?? "").trim() !== expected) throw new Error("Wrong transfer code");
}

/** Row counts for every table in the package. */
export async function buildOverview(admin: any, mode: TransferMode): Promise<TransferOverview> {
  const counts: Record<string, number> = {};
  for (const t of EXPORT_TABLE_LIST) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    counts[t] = error ? 0 : (count ?? 0);
  }

  const files: Array<{ bucket: string; path: string }> = [];
  const seen = new Set<string>();
  const push = (bucket: string, path: string | null | undefined) => {
    if (!path || typeof path !== "string") return;
    const key = `${bucket}::${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ bucket, path });
  };

  let siteName: string | null = null;
  const settings = await admin.from("site_settings").select("*").limit(1);
  const s = (settings.data ?? [])[0];
  siteName = s?.site_name ?? s?.brand_name ?? null;

  if (mode !== "data") {
    const unis = await admin.from("universities").select("logo_url,storage_path,cover_path");
    for (const u of unis.data ?? []) {
      push("university-logos", u.logo_url);
      push("university-logos", u.storage_path);
      push("university-logos", u.cover_path);
    }
    const courses = await admin.from("courses").select("image_url,intro_video_storage_path");
    for (const c of courses.data ?? []) push("course-images", c.image_url);
    if (mode === "all") {
      for (const c of courses.data ?? []) push("lecture-videos", c.intro_video_storage_path);
      const lecItems = await admin
        .from("lecture_items")
        .select("video_storage_path,pdf_storage_path");
      for (const i of (lecItems.data ?? []) as Array<Record<string, string | null>>) {
        push("lecture-videos", i["video_storage_path"] ?? null);
        push("lecture-pdfs", i["pdf_storage_path"] ?? null);
      }
    }
    if (s?.logo_url) push("site-media", s.logo_url);
    const questions = await admin.from("questions").select("image_url");
    for (const q of questions.data ?? []) push("question-images", q.image_url);
    const subs = await admin.from("committee_subjects").select("image_url");
    for (const x of subs.data ?? []) push("committee-images", x.image_url);
  }

  let driveCount = 0;
  const res = await admin
    .from("committee_resources")
    .select("file_path,storage_provider,drive_file_id");
  for (const r of res.data ?? []) {
    if (r.storage_provider === "drive" || r.drive_file_id) {
      driveCount++;
      continue;
    }
    if (mode === "all") push("committee-files", r.file_path);
  }
  if (mode === "all" && s?.study_plan_path) push("committee-files", s.study_plan_path);

  return {
    counts,
    files,
    drive_files: driveCount,
    site_name: siteName,
    exported_at: new Date().toISOString(),
  };
}

/** One page of one table, so huge tables never blow a single response. */
export async function fetchTableChunk(
  admin: any,
  table: string,
  offset: number,
  limit: number,
): Promise<{ rows: any[]; done: boolean }> {
  let ordered = true;
  let res = await admin.from(table).select("*").order("id", { ascending: true }).range(offset, offset + limit - 1);
  if (res.error) {
    ordered = false;
    res = await admin.from(table).select("*").range(offset, offset + limit - 1);
  }
  if (res.error) throw new Error(`${table}: ${res.error.message}`);
  const rows = res.data ?? [];
  void ordered;
  return { rows, done: rows.length < limit };
}

/** Google Drive manifest: the committee tree with every Drive id/link intact. */
export async function buildDriveManifest(admin: any) {
  const { data: resources } = await admin
    .from("committee_resources")
    .select("id,title,kind,storage_provider,drive_file_id,drive_view_url,file_path,category_id,subject_id,parent_resource_id,sort_order");
  let snapshot: any = null;
  try {
    const { buildCommitteeSnapshot } = await import("./committee-snapshot.server");
    snapshot = await buildCommitteeSnapshot(admin);
  } catch {
    snapshot = null;
  }
  return {
    resources: (resources ?? []).filter((r: any) => r.drive_file_id || r.storage_provider === "drive"),
    committee_snapshot: snapshot,
  };
}
