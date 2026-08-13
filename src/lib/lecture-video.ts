import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a lecture video reference into a playable URL.
 * If a storage path is set we generate a signed URL from the private bucket
 * (which RLS gates to admins + course owners). Otherwise we use the external URL.
 */
export async function resolveLectureVideoUrl(
  videoUrl: string | null,
  storagePath: string | null,
): Promise<string | null> {
  if (storagePath) {
    const { data } = await supabase.storage
      .from("lecture-videos")
      .createSignedUrl(storagePath, 60 * 60 * 2);
    if (data?.signedUrl) return data.signedUrl;
  }
  return videoUrl ?? null;
}
