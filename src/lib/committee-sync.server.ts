/**
 * Google Drive relink: keeps a full committee snapshot inside Drive so a fresh
 * project (a remix) can rebuild the whole library with one click, pointing at
 * the files that already live in that Drive.
 */
import {
  SNAPSHOT_FOLDER,
  SNAPSHOT_NAME,
  SNAPSHOT_IMAGES,
  driveWriteTextFile,
  driveReadTextFile,
  driveWriteBinary,
  driveReadFileBytes,
  driveFindFileInFolder,
  driveEnsureFolderPath,
  driveAbout,
} from "./committee-drive.server";
import {
  buildCommitteeSnapshot,
  restoreCommitteeSnapshot,
  normalizeSnapshot,
  type CommitteeSnapshot,
  type RestoreResult,
} from "./committee-snapshot.server";

export type DriveSnapshot = CommitteeSnapshot & {
  drive_images?: Array<{ bucket: string; path: string; drive_file_id: string }>;
};

function imageFileName(bucket: string, path: string) {
  return `${bucket}__${path}`.replace(/[\\/]/g, "__");
}

/** Writes the snapshot (and mirrors subject cover images) into Google Drive. */
export async function writeSnapshotToDrive(db: any, universitySlug?: string) {
  const snap = (await buildCommitteeSnapshot(db, universitySlug)) as DriveSnapshot;

  // Mirror the small images so a relink can restore them too.
  const images: Array<{ bucket: string; path: string; drive_file_id: string }> = [];
  const imageFiles = snap.files.filter((f) => f.bucket === "committee-images");
  for (const f of imageFiles) {
    try {
      const { data, error } = await db.storage.from(f.bucket).download(f.path);
      if (error || !data) continue;
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) continue;
      const id = await driveWriteBinary(
        SNAPSHOT_IMAGES,
        imageFileName(f.bucket, f.path),
        bytes,
        (data as Blob).type || "image/jpeg",
      );
      images.push({ bucket: f.bucket, path: f.path, drive_file_id: id });
    } catch {
      // A missing image must never block the snapshot.
    }
  }
  snap.drive_images = images;

  await driveWriteTextFile(SNAPSHOT_FOLDER, SNAPSHOT_NAME, JSON.stringify(snap));

  const counts = snapshotCounts(snap);
  return { ...counts, written_at: snap.exported_at, images: images.length };
}

export function snapshotCounts(snap: CommitteeSnapshot) {
  let subjects = 0, resources = 0, driveFiles = 0, localFiles = 0;
  for (const y of snap.years ?? []) {
    for (const s of y.subjects ?? []) {
      subjects++;
      for (const c of s.categories ?? []) {
        for (const r of c.resources ?? []) {
          resources++;
          if (r.drive_file_id) driveFiles++;
          else if (r.file_path) localFiles++;
        }
      }
    }
  }
  return { years: (snap.years ?? []).length, subjects, resources, driveFiles, localFiles };
}

export async function readSnapshotFromDrive(): Promise<{
  snapshot: DriveSnapshot;
  modifiedTime: string | null;
} | null> {
  const file = await driveReadTextFile(SNAPSHOT_FOLDER, SNAPSHOT_NAME);
  if (!file) return null;
  const parsed = JSON.parse(file.text);
  return { snapshot: normalizeSnapshot(parsed) as DriveSnapshot, modifiedTime: file.modifiedTime };
}

export async function driveLinkStatusInfo() {
  const about = await driveAbout();
  let snapshot: { modifiedTime: string | null; counts: ReturnType<typeof snapshotCounts>; university: string } | null = null;
  const found = await readSnapshotFromDrive();
  if (found) {
    snapshot = {
      modifiedTime: found.modifiedTime ?? found.snapshot.exported_at ?? null,
      counts: snapshotCounts(found.snapshot),
      university: found.snapshot.university?.name ?? "",
    };
  }
  return { account: about, snapshot };
}

/** Rebuilds the committee from the Drive snapshot. */
export async function relinkFromDriveSnapshot(
  db: any,
  opts: { replace?: boolean; targetUniversitySlug?: string } = {},
): Promise<RestoreResult & { imagesRestored: number }> {
  const found = await readSnapshotFromDrive();
  if (!found) throw new Error("No snapshot found in Google Drive (Committee / _AquaQBank).");
  const snap = found.snapshot;

  // Put subject cover images back into storage first.
  let imagesRestored = 0;
  if (snap.drive_images?.length) {
    const imagesFolderId = await driveEnsureFolderPath(SNAPSHOT_IMAGES);
    for (const img of snap.drive_images) {
      try {
        let fileId = img.drive_file_id;
        const byName = await driveFindFileInFolder(imageFileName(img.bucket, img.path), imagesFolderId);
        if (byName) fileId = byName.id;
        const bytes = await driveReadFileBytes(fileId);
        const { error } = await db.storage.from(img.bucket).upload(img.path, bytes, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (!error) imagesRestored++;
      } catch {
        // Skip images that cannot be restored; the tree still comes back.
      }
    }
  }

  const result = await restoreCommitteeSnapshot(db, snap, {
    replace: opts.replace,
    targetUniversitySlug: opts.targetUniversitySlug,
  });
  return { ...result, imagesRestored };
}
