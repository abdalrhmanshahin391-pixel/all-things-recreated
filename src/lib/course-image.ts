import { supabase } from "@/integrations/supabase/client";

const BUCKET = "course-images";

function extractPath(value: string): string {
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length);
  return value;
}

/**
 * Resolve a stored course image_url value (either a stored path or a legacy
 * public URL) into a usable URL. The bucket is public, so this is a plain URL
 * built on the spot: no signing request per image.
 */
export async function resolveCourseImageUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  // Already an http(s) URL that isn't a Supabase storage URL: use as-is.
  if (/^https?:\/\//i.test(value) && !value.includes(`/${BUCKET}/`)) return value;
  const path = extractPath(value);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}