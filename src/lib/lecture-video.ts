import { supabase } from "@/integrations/supabase/client";
import { resolveLectureVideoUrlServer, resolveLecturePdfUrlServer } from "./lecture-video.functions";

/**
 * Resolve a lecture video reference into a playable URL.
 * Handles external URLs directly (YouTube, Vimeo, Drive, etc.).
 * For storage paths (including course intro/preview videos), uses the server resolver
 * so private bucket RLS does not block intro previews or students.
 */
export async function resolveLectureVideoUrl(
  videoUrl: string | null,
  storagePath: string | null,
  options?: { courseId?: string; itemId?: string },
): Promise<string | null> {
  // If external URL without storage path, return directly
  if (!storagePath && videoUrl) {
    return videoUrl;
  }

  if (storagePath) {
    try {
      const res = await resolveLectureVideoUrlServer({
        data: {
          videoUrl: videoUrl ?? null,
          storagePath,
          courseId: options?.courseId,
          itemId: options?.itemId,
        },
      });
      if (res?.url) return res.url;
    } catch (err) {
      console.warn("[resolveLectureVideoUrl] Server resolver error, falling back to client:", err);
    }

    // Client fallback
    try {
      const { data } = await supabase.storage
        .from("lecture-videos")
        .createSignedUrl(storagePath, 60 * 60 * 2);
      if (data?.signedUrl) return data.signedUrl;
    } catch {}
  }

  return videoUrl ?? null;
}

/**
 * Resolve a lecture PDF reference into a short-lived viewable URL.
 */
export async function resolveLecturePdfUrl(
  pdfUrl: string | null,
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath && pdfUrl) {
    return pdfUrl;
  }

  if (storagePath) {
    try {
      const res = await resolveLecturePdfUrlServer({
        data: {
          pdfUrl: pdfUrl ?? null,
          storagePath,
        },
      });
      if (res?.url) return res.url;
    } catch (err) {
      console.warn("[resolveLecturePdfUrl] Server resolver error, falling back to client:", err);
    }

    // Client fallback
    try {
      const { data } = await supabase.storage
        .from("lecture-pdfs")
        .createSignedUrl(storagePath, 60 * 30);
      if (data?.signedUrl) return data.signedUrl;
    } catch {}
  }

  return pdfUrl ?? null;
}
