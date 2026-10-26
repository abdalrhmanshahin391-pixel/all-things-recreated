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
 * public URL) into a usable URL. The bucket is private, so we always return
 * a freshly signed URL.
 */
// A new signed URL every time means the browser can never reuse the picture it already
// downloaded, and each card waits for its own round trip. Keep the signed URL for most
// of its hour (in memory and in sessionStorage) and share one request per image.
const TTL_MS = 50 * 60 * 1000;
const memory = new Map<string, { url: string; at: number }>();
const inflight = new Map<string, Promise<string | null>>();
const STORE = "cimg:";

function readCached(path: string): string | null {
  const now = Date.now();
  const m = memory.get(path);
  if (m && now - m.at < TTL_MS) return m.url;
  try {
    const raw = sessionStorage.getItem(STORE + path);
    if (raw) {
      const s = JSON.parse(raw) as { url: string; at: number };
      if (now - s.at < TTL_MS) {
        memory.set(path, s);
        return s.url;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

/**
 * The bucket is public, so a picture has one fixed URL that never changes. A browser keeps it
 * for a year (the files are uploaded with that cache time) and no request is needed to get it.
 * If the bucket were private again the picture fails to load and the card falls back to
 * resolveCourseImageUrl below.
 */
export function publicCourseImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) && !value.includes(`/${BUCKET}/`)) return value;
  return supabase.storage.from(BUCKET).getPublicUrl(extractPath(value)).data.publicUrl;
}

export async function resolveCourseImageUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  // Already an http(s) URL that isn't a Supabase storage URL — use as-is.
  if (/^https?:\/\//i.test(value) && !value.includes(`/${BUCKET}/`)) return value;
  const path = extractPath(value);
  const hit = readCached(path);
  if (hit) return hit;
  const running = inflight.get(path);
  if (running) return running;
  const p = (async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error || !data) return null;
    const entry = { url: data.signedUrl, at: Date.now() };
    memory.set(path, entry);
    try {
      sessionStorage.setItem(STORE + path, JSON.stringify(entry));
    } catch {
      /* storage unavailable */
    }
    return data.signedUrl;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}
