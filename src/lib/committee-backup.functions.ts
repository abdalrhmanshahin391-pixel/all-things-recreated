import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guessContentType } from "./backup-tables";
import {
  assertCommitteeAdmin,
  buildCommitteeSnapshot,
  restoreCommitteeSnapshot,
  type CommitteeSnapshot,
} from "./committee-snapshot.server";

export type CommitteeBackup = CommitteeSnapshot;

const COMMITTEE_BUCKETS = ["committee-files", "committee-images"] as const;

/** Builds the JSON tree; binary files are zipped client-side via signed URLs. */
export const exportCommitteeBackupData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { universitySlug?: string }) => d)
  .handler(async ({ data, context }): Promise<CommitteeBackup> => {
    await assertCommitteeAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await buildCommitteeSnapshot(supabaseAdmin, data.universitySlug);
  });

/** Short-lived signed URL for one committee storage object. */
export const signCommitteeFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string }) => d)
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertCommitteeAdmin(context);
    if (!(COMMITTEE_BUCKETS as readonly string[]).includes(data.bucket)) {
      throw new Error("Bucket not allowed");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(data.bucket).createSignedUrl(data.path, 600);
    if (error || !signed) throw new Error(error?.message ?? "Sign failed");
    return { url: signed.signedUrl };
  });

/** Rebuilds the committee tree from a backup (v2 and v3 files both work). */
export const importCommitteeBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { payload: any; targetUniversitySlug?: string; replace?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertCommitteeAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await restoreCommitteeSnapshot(supabaseAdmin, data.payload, {
      targetUniversitySlug: data.targetUniversitySlug,
      replace: data.replace,
    });
  });

/** Uploads one binary file back to its committee bucket path during import. */
export const uploadCommitteeFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string; base64: string; contentType?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCommitteeAdmin(context);
    if (!(COMMITTEE_BUCKETS as readonly string[]).includes(data.bucket)) {
      throw new Error("Bucket not allowed");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage.from(data.bucket).upload(data.path, bin, {
      contentType: data.contentType ?? guessContentType(data.path),
      upsert: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
