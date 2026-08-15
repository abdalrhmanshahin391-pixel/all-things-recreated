import { supabase } from "@/integrations/supabase/client";
import { resolveCourseImageUrl } from "@/lib/course-image";

export const AD_BUCKET = "ad-media";

/** Turn a remote URL into a data URL so html-to-image can always embed it. */
export async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load image (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Could not read image"));
    fr.readAsDataURL(blob);
  });
}

/**
 * Resolve an Ad Studio image reference to a data URL.
 * Supported: `ad:<storage path>`, `course:<path>`, absolute http(s) URLs, data URLs.
 */
export async function resolveAdImage(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  try {
    if (ref.startsWith("data:")) return ref;
    let url: string | null = null;
    if (ref.startsWith("ad:")) {
      const { data } = await supabase.storage.from(AD_BUCKET).createSignedUrl(ref.slice(3), 3600);
      url = data?.signedUrl ?? null;
    } else if (ref.startsWith("course:")) {
      url = await resolveCourseImageUrl(ref.slice(7));
    } else {
      url = ref;
    }
    if (!url) return null;
    return await toDataUrl(url);
  } catch {
    return null;
  }
}

/** Upload a blob to the ad-media bucket and return its `ad:` reference. */
export async function uploadAdMedia(blob: Blob, folder: string, ext = "png"): Promise<string> {
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(AD_BUCKET).upload(path, blob, { contentType: blob.type || `image/${ext}` });
  if (error) throw error;
  return `ad:${path}`;
}

/**
 * Screenshot one of our own pages by rendering it in a hidden same-origin
 * iframe and rasterising it. Returns a PNG blob.
 */
export async function captureSitePage(path: string, width = 1280, height = 1600): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;border:0;width:${width}px;height:${height}px;`;
  frame.src = path.startsWith("http") ? path : `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The page took too long to load")), 25_000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.onerror = () => { clearTimeout(timer); reject(new Error("The page could not be opened")); };
    });
    // let fonts, images and animations settle
    await new Promise((r) => setTimeout(r, 2500));
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error("The page could not be read");
    const blob = await toBlob(doc.documentElement, { width, height, pixelRatio: 1, backgroundColor: "#0B1B33" });
    if (!blob) throw new Error("The screenshot could not be created");
    return blob;
  } finally {
    frame.remove();
  }
}
