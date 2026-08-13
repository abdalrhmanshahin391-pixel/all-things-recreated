import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertSiteAdmin } from "@/lib/committee-snapshot.server";
import {
  driveLinkStatusInfo,
  writeSnapshotToDrive,
  relinkFromDriveSnapshot,
} from "@/lib/committee-sync.server";

/** Connected Drive account + whether a committee snapshot exists there. */
export const driveLinkStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSiteAdmin(context);
    return await driveLinkStatusInfo();
  });

/** Writes the current committee into Google Drive as a snapshot. */
export const writeDriveSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ universitySlug: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertSiteAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await writeSnapshotToDrive(supabaseAdmin, data.universitySlug);
  });

/** Rebuilds the committee from the snapshot stored in Google Drive. */
export const relinkFromDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ replace: z.boolean().optional(), targetUniversitySlug: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSiteAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await relinkFromDriveSnapshot(supabaseAdmin, data);
  });
