import { supabase } from "@/integrations/supabase/client";

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