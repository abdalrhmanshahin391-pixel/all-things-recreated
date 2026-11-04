import { supabase } from "@/integrations/supabase/client";

export const SHOWCASE_BUCKET = "showcase";
/** Bump the version when a clip is replaced: a year-long cache never re-checks the old name. */
export const SHOWCASE_VERSION = "v1";
export const SHOWCASE_KEYS = ["qbank", "lectures", "resources"] as const;
export type ShowcaseKey = (typeof SHOWCASE_KEYS)[number];

export function showcasePath(key: ShowcaseKey) {
  return `${key}.${SHOWCASE_VERSION}.webm`;
}

export function showcaseUrl(key: ShowcaseKey) {
  return supabase.storage.from(SHOWCASE_BUCKET).getPublicUrl(showcasePath(key)).data.publicUrl;
}

export async function uploadShowcaseClip(key: ShowcaseKey, file: File) {
  const { error } = await supabase.storage
    .from(SHOWCASE_BUCKET)
    .upload(showcasePath(key), file, { cacheControl: "31536000", upsert: false, contentType: "video/webm" });
  if (error) throw error;
}
