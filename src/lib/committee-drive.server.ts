const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function headers(extra: Record<string, string> = {}) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!drive) throw new Error("Google Drive is not connected for this project");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": drive,
    ...extra,
  };
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
  });
  return res;
}

async function driveJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await driveFetch(path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Drive [${res.status}]: ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function assertCommitteeManager(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("can_manage_committee", { _user_id: context.userId });
  if (!ok) throw new Error("Forbidden: admins / committee only");
}

/** Human folder chain for a committee category: Committee / Year / Semester / Subject. */
export async function driveFolderPathForCategory(
  supabase: any,
  categoryId: string | null,
): Promise<string[]> {
  const base = ["Committee"];
  if (!categoryId) return [...base, "Uploads"];
  const { data: cat } = await supabase
    .from("committee_categories")
    .select("name, subject_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return [...base, "Uploads"];
  const { data: subj } = await supabase
    .from("committee_subjects")
    .select("name, year_id, semester_id")
    .eq("id", cat.subject_id)
    .maybeSingle();
  if (!subj) return [...base, "Uploads"];
  const { data: year } = await supabase
    .from("committee_years")
    .select("display_name, year_number")
    .eq("id", subj.year_id)
    .maybeSingle();
  let semester: string | null = null;
  if (subj.semester_id) {
    const { data: sem } = await supabase
      .from("committee_semesters")
      .select("name")
      .eq("id", subj.semester_id)
      .maybeSingle();
    semester = sem?.name ?? null;
  }
  const out = [...base, year?.display_name || `Year ${year?.year_number ?? "?"}`];
  if (semester) out.push(semester);
  out.push(subj.name);
  return out.map((s) => String(s).replace(/['\\]/g, "").trim() || "Untitled");
}

const folderCache = new Map<string, string>();

async function findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
  const cacheKey = `${parentId ?? "root"}::${name}`;
  const hit = folderCache.get(cacheKey);
  if (hit) return hit;

  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await driveJson<{ files?: Array<{ id: string }> }>(
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true`,
  );
  const existing = found.files?.[0]?.id;
  if (existing) {
    folderCache.set(cacheKey, existing);
    return existing;
  }
  const created = await driveJson<{ id: string }>(`/drive/v3/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  folderCache.set(cacheKey, created.id);
  return created.id;
}

export async function driveEnsureFolderPath(path: string[]): Promise<string> {
  let parent: string | null = null;
  for (const segment of path) {
    parent = await findOrCreateFolder(segment, parent);
  }
  return parent!;
}

/** Opens a resumable upload session; the returned URL is uploaded to directly by the browser. */
export async function driveStartResumable(opts: {
  name: string;
  mimeType: string;
  parentId: string;
  size?: number;
}): Promise<string> {
  const res = await driveFetch(`/upload/drive/v3/files?uploadType=resumable&fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      ...(opts.size ? { "X-Upload-Content-Length": String(opts.size) } : {}),
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.parentId] }),
  });
  const location = res.headers.get("location") || res.headers.get("Location");
  if (!res.ok || !location) {
    const body = await res.text();
    throw new Error(`Drive upload session failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return location;
}

export async function driveMakePublic(fileId: string) {
  // (permission + metadata below)
  await driveJson(`/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  const meta = await driveJson<{ id: string; name: string; size?: string; webViewLink?: string }>(
    `/drive/v3/files/${fileId}?fields=id,name,size,webViewLink&supportsAllDrives=true`,
  );
  return {
    fileId: meta.id,
    name: meta.name,
    size: meta.size ? Number(meta.size) : null,
    webViewLink: meta.webViewLink ?? `https://drive.google.com/file/d/${meta.id}/view`,
    // `confirm=t` skips Google's "can't scan for viruses" interstitial so the
    // file starts streaming on the first click.
    downloadLink: `https://drive.usercontent.google.com/download?id=${meta.id}&export=download&confirm=t`,
  };
}

export async function driveDelete(fileId: string) {
  const res = await driveFetch(`/drive/v3/files/${fileId}?supportsAllDrives=true`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Server-side multipart upload — fallback path for browsers blocked by CORS. */
export async function driveUploadBytes(opts: {
  name: string;
  mimeType: string;
  parentId: string;
  bytes: Uint8Array;
}): Promise<string> {
  const boundary = `lvbl${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: opts.name, parents: [opts.parentId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + opts.bytes.length + tail.length);
  body.set(head, 0);
  body.set(opts.bytes, head.length);
  body.set(tail, head.length + opts.bytes.length);
  const j = await driveJson<{ id: string }>(
    `/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return j.id;
}

export async function driveAbout() {
  const j = await driveJson<{ storageQuota?: { limit?: string; usage?: string; usageInDrive?: string }; user?: { emailAddress?: string } }>(
    `/drive/v3/about?fields=storageQuota,user(emailAddress)`,
  );
  return {
    email: j.user?.emailAddress ?? null,
    limit: j.storageQuota?.limit ? Number(j.storageQuota.limit) : null,
    usage: j.storageQuota?.usage ? Number(j.storageQuota.usage) : null,
    usageInDrive: j.storageQuota?.usageInDrive ? Number(j.storageQuota.usageInDrive) : null,
  };
}
/* ------------------------- Snapshot files in Drive ------------------------ */

export const SNAPSHOT_FOLDER = ["Committee", "_AquaQBank"];
export const SNAPSHOT_NAME = "committee-snapshot.json";
export const SNAPSHOT_IMAGES = ["Committee", "_AquaQBank", "images"];

export async function driveFindFileInFolder(name: string, parentId: string) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "trashed = false",
    `'${parentId}' in parents`,
  ].join(" and ");
  const found = await driveJson<{ files?: Array<{ id: string; modifiedTime?: string; size?: string }> }>(
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,modifiedTime,size)&pageSize=1&supportsAllDrives=true`,
  );
  return found.files?.[0] ?? null;
}

/** Creates or overwrites a text file (JSON) inside a Drive folder path. */
export async function driveWriteTextFile(path: string[], name: string, text: string) {
  const parentId = await driveEnsureFolderPath(path);
  const existing = await driveFindFileInFolder(name, parentId);
  if (existing) {
    const res = await driveFetch(
      `/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id&supportsAllDrives=true`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: text },
    );
    if (!res.ok) throw new Error(`Drive snapshot update failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    return existing.id;
  }
  const bytes = new TextEncoder().encode(text);
  return await driveUploadBytes({ name, mimeType: "application/json", parentId, bytes });
}

export async function driveReadTextFile(path: string[], name: string) {
  const parentId = await driveEnsureFolderPath(path);
  const existing = await driveFindFileInFolder(name, parentId);
  if (!existing) return null;
  const res = await driveFetch(`/drive/v3/files/${existing.id}?alt=media&supportsAllDrives=true`);
  if (!res.ok) throw new Error(`Drive read failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return { text: await res.text(), modifiedTime: existing.modifiedTime ?? null, fileId: existing.id };
}

export async function driveReadFileBytes(fileId: string): Promise<Uint8Array> {
  const res = await driveFetch(`/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!res.ok) throw new Error(`Drive download failed [${res.status}]`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Uploads (or replaces) a small binary asset such as a subject cover image. */
export async function driveWriteBinary(path: string[], name: string, bytes: Uint8Array, mimeType: string) {
  const parentId = await driveEnsureFolderPath(path);
  const existing = await driveFindFileInFolder(name, parentId);
  if (existing) await driveDelete(existing.id);
  return await driveUploadBytes({ name, mimeType, parentId, bytes });
}
