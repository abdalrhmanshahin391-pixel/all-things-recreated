/**
 * Shrinks user-picked images before they are uploaded.
 *
 * Photos and logos coming off a phone are routinely 4-8 MB; re-encoding them to
 * WebP at a sane maximum edge typically removes 60-80% of the bytes with no
 * visible quality loss, which keeps storage small and pages fast.
 */

export type CompressedImage = {
  /** The file to upload (may be the original when compression is not useful). */
  file: File;
  /** Content type to pass to the storage upload call. */
  contentType: string;
  /** Extension to use when building the storage path (no dot). */
  ext: string;
};

const SKIP_TYPES = new Set(["image/svg+xml", "image/gif"]);

function extOf(name: string, fallback: string) {
  const e = name.split(".").pop()?.toLowerCase();
  return e && /^[a-z0-9]{1,5}$/.test(e) ? e : fallback;
}

function passthrough(file: File): CompressedImage {
  return {
    file,
    contentType: file.type || "application/octet-stream",
    ext: extOf(file.name, "bin"),
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Returns a WebP version of the image capped to `maxEdge` pixels on its longest
 * side. Falls back to the original file for SVG/GIF, tiny files, unsupported
 * browsers, or whenever the re-encode does not actually save space.
 */
export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<CompressedImage> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;

  if (typeof document === "undefined") return passthrough(file);
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return passthrough(file);
  if (file.size < 120 * 1024) return passthrough(file);

  try {
    const bitmap = await loadBitmap(file);
    const w = "width" in bitmap ? bitmap.width : 0;
    const h = "height" in bitmap ? bitmap.height : 0;
    if (!w || !h) return passthrough(file);

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough(file);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, tw, th);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return passthrough(file);

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return {
      file: new File([blob], `${base}.webp`, { type: "image/webp" }),
      contentType: "image/webp",
      ext: "webp",
    };
  } catch {
    return passthrough(file);
  }
}
