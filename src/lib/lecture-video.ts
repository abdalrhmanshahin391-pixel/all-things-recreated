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

/**
 * Resolve a lecture PDF reference into a short-lived viewable URL.
 * Uploaded files live in the private "lecture-pdfs" bucket (RLS gated to
 * admins, course owners and free lessons); links are used as-is.
 */
export async function resolveLecturePdfUrl(
  pdfUrl: string | null,
  storagePath: string | null,
): Promise<string | null> {
  if (storagePath) {
    const { data } = await supabase.storage
      .from("lecture-pdfs")
      .createSignedUrl(storagePath, 60 * 30);
    if (data?.signedUrl) return data.signedUrl;
  }
  return pdfUrl ?? null;
}
