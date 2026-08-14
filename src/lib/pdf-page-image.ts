// Browser-only helpers for Image Mode (equation-heavy exams).
// Renders a PDF page to a canvas once, then crops question strips out of it
// using normalized 0–1000 coordinates returned by Gemini.

export type CutRegion = {
  n: number;
  y_top: number;    // 0..1000
  y_bottom: number; // 0..1000
  x_left?: number;  // 0..1000 (optional, defaults to full width)
  x_right?: number;
  label?: string;
};

/** Render a single page (1-indexed) to an offscreen canvas. */
export async function renderPageToCanvas(
  doc: any,
  pageNumber: number,
  targetWidth = 1400,
  timeoutMs = 55_000,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, targetWidth / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport, canvas });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        try { task.cancel?.(); } catch { /* ignore cleanup failures */ }
        reject(new Error(`page ${pageNumber} render timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      task.promise.then(() => resolve()).catch(reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  return canvas;
}

export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.72): string {
  const url = canvas.toDataURL("image/jpeg", quality);
  const i = url.indexOf(",");
  return i >= 0 ? url.slice(i + 1) : url;
}

/** Crop one question strip out of a rendered page canvas. Coordinates are 0–1000. */
export function cropRegionToJpegBase64(
  canvas: HTMLCanvasElement,
  region: CutRegion,
  opts: { padding?: number; quality?: number } = {},
): string {
  const pad = opts.padding ?? 8;
  const quality = opts.quality ?? 0.78;
  const clamp = (v: number) => Math.max(0, Math.min(1000, Number(v) || 0));

  const top = clamp(Math.min(region.y_top, region.y_bottom));
  const bottom = clamp(Math.max(region.y_top, region.y_bottom));
  const left = clamp(region.x_left ?? 0);
  const right = clamp(region.x_right ?? 1000);

  const sx = Math.max(0, Math.floor((left / 1000) * canvas.width) - pad);
  const sy = Math.max(0, Math.floor((top / 1000) * canvas.height) - pad);
  const sw = Math.min(canvas.width - sx, Math.ceil(((right - left) / 1000) * canvas.width) + pad * 2);
  const sh = Math.min(canvas.height - sy, Math.ceil(((bottom - top) / 1000) * canvas.height) + pad * 2);
  if (sw < 20 || sh < 20) throw new Error("Crop region too small");

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvasToJpegBase64(out, quality);
}

export function base64ToBlob(base64: string, mime = "image/jpeg"): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Draw a stored page picture (JPEG blob) onto a canvas so crops can run later. */
export async function imageBlobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read the stored page picture"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
