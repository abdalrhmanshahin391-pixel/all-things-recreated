import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolve a university image (cover or logo) to a usable URL.
 * Accepts either a full https URL or a storage path inside `university-logos`.
 * Signed URLs are cached in-memory for ~50 minutes.
 */
export async function resolveUniversityImageUrl(
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const now = Date.now();
  const hit = cache.get(value);
  if (hit && hit.expiresAt > now) return hit.url;

  const { data } = await supabase.storage
    .from("university-logos")
    .createSignedUrl(value, 3600);
  const url = data?.signedUrl ?? null;
  if (url) cache.set(value, { url, expiresAt: now + 50 * 60_000 });
  return url;
}
