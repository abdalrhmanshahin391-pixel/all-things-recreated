import { supabase } from "@/integrations/supabase/client";

/**
 * The bucket is public, so an image has one fixed URL that a browser keeps for a year and that
 * needs no request to build. If the bucket is private again the image fails to load and callers
 * fall back to resolveUniversityImageUrl (signed).
 */
export function publicUniversityImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return supabase.storage.from("university-logos").getPublicUrl(value).data.publicUrl;
}

/**
 * Resolve a university image (cover or logo) to a usable URL.
 * Accepts either a full https URL or a storage path inside `university-logos`.
 * The bucket is public, so this is a plain URL: no signing request per image.
 */
export async function resolveUniversityImageUrl(
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return supabase.storage.from("university-logos").getPublicUrl(value).data.publicUrl;
}