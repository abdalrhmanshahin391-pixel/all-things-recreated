import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  driveEnsureFolderPath,
  driveStartResumable,
  driveMakePublic,
  driveDelete,
  driveAbout,
  driveFolderPathForCategory,
  assertCommitteeManager,
  driveUploadBytes,
} from "@/lib/committee-drive.server";

export const startDriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        categoryId: z.string().uuid().nullable().optional(),
        fileName: z.string().min(1).max(300),
        mimeType: z.string().default("application/pdf"),
        size: z.number().int().nonnegative().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommitteeManager(context);
    const path = await driveFolderPathForCategory(context.supabase, data.categoryId ?? null);
    const folderId = await driveEnsureFolderPath(path);
    const uploadUrl = await driveStartResumable({
      name: data.fileName,
      mimeType: data.mimeType,
      parentId: folderId,
      size: data.size,
    });
    return { uploadUrl, folderId, folderPath: path.join(" / ") };
  });

export const finishDriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCommitteeManager(context);
    return await driveMakePublic(data.fileId);
  });

/** Fallback for browsers where the direct upload is blocked. Small files only. */
export const uploadDriveBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        categoryId: z.string().uuid().nullable().optional(),
        fileName: z.string().min(1).max(300),
        mimeType: z.string().default("application/pdf"),
        base64: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommitteeManager(context);
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length > 24 * 1024 * 1024) throw new Error("File too large for the fallback upload path");
    const path = await driveFolderPathForCategory(context.supabase, data.categoryId ?? null);
    const folderId = await driveEnsureFolderPath(path);
    const fileId = await driveUploadBytes({
      name: data.fileName,
      mimeType: data.mimeType,
      parentId: folderId,
      bytes,
    });
    return await driveMakePublic(fileId);
  });

export const deleteDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCommitteeManager(context);
    await driveDelete(data.fileId);
    return { ok: true };
  });

export const driveAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCommitteeManager(context);
    return await driveAbout();
  });