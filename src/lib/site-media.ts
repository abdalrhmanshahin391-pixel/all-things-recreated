import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";

export const SITE_MEDIA_BUCKET = "site-media";

export async function uploadSiteMedia(file: File): Promise<string> {
  const img = await compressImage(file, { maxEdge: 1920 });
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${img.ext}`;
  const { error } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(path, img.file, { cacheControl: "3600", upsert: false, contentType: img.contentType });
  if (error) throw error;
  return path;
}

export async function signSiteMedia(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}