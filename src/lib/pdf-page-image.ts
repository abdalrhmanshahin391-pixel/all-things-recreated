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
  targetWidth = 2800,
  timeoutMs = 55_000,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1.5, targetWidth / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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

export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.95): string {
  const url = canvas.toDataURL("image/jpeg", quality);
  const i = url.indexOf(",");
  return i >= 0 ? url.slice(i + 1) : url;
}

// ── IndexedDB Page Image Cache ──────────────────────────────────────────────
const IDB_NAME = "mcq_124_pro_cache";
const IDB_STORE = "page_images";
const IDB_SESSION_STORE = "session_images";
const IDB_VERSION = 2;

let cachedDb: IDBDatabase | null = null;

function openPageImageDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  if (cachedDb && cachedDb.version >= IDB_VERSION) return Promise.resolve(cachedDb);
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {}
    cachedDb = null;
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "pageNum" });
        }
        if (!db.objectStoreNames.contains(IDB_SESSION_STORE)) {
          db.createObjectStore(IDB_SESSION_STORE, { keyPath: "sessionId" });
        }
      };
      req.onsuccess = () => {
        cachedDb = req.result;
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePageJpegToCache(pageNum: number, jpegBase64: string): Promise<void> {
  try {
    const db = await openPageImageDb();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ pageNum, jpegBase64 });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-fatal cache failure
  }
}

export async function getPageJpegFromCache(pageNum: number): Promise<string | null> {
  try {
    const db = await openPageImageDb();
    if (!db) return null;
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(pageNum);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.jpegBase64 || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllCachedPageJpegs(): Promise<Record<number, string>> {
  try {
    const db = await openPageImageDb();
    if (!db) return {};
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const result: Record<number, string> = {};
        for (const item of req.result || []) {
          if (item?.pageNum && item?.jpegBase64) {
            result[item.pageNum] = item.jpegBase64;
          }
        }
        resolve(result);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

// ── Per-Session Image Store in IndexedDB ─────────────────────────────────────
export async function saveSessionPageImages(
  sessionId: string,
  images: Record<number, string>,
): Promise<void> {
  if (!sessionId || !images || Object.keys(images).length === 0) return;
  try {
    const db = await openPageImageDb();
    if (!db) return;
    const tx = db.transaction(IDB_SESSION_STORE, "readwrite");
    tx.objectStore(IDB_SESSION_STORE).put({
      sessionId,
      images,
      pageCount: Object.keys(images).length,
      updatedAt: Date.now(),
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("Failed to save session page images to IndexedDB:", e);
  }
}

export async function getSessionPageImages(sessionId: string): Promise<Record<number, string>> {
  if (!sessionId) return {};
  try {
    const db = await openPageImageDb();
    if (!db) return {};
    const tx = db.transaction(IDB_SESSION_STORE, "readonly");
    const req = tx.objectStore(IDB_SESSION_STORE).get(sessionId);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.images || {});
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function deleteSessionPageImages(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    const db = await openPageImageDb();
    if (!db) return;
    const tx = db.transaction(IDB_SESSION_STORE, "readwrite");
    tx.objectStore(IDB_SESSION_STORE).delete(sessionId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

/** Convenience aliases for Final Approval batches */
export const saveBatchPageImages = saveSessionPageImages;
export const getBatchPageImages = getSessionPageImages;
export const deleteBatchPageImages = deleteSessionPageImages;

export async function clearPageJpegCache(): Promise<void> {
  try {
    const db = await openPageImageDb();
    if (!db) return;
    const storeNames = [IDB_STORE];
    if (db.objectStoreNames.contains(IDB_SESSION_STORE)) {
      storeNames.push(IDB_SESSION_STORE);
    }
    const tx = db.transaction(storeNames, "readwrite");
    tx.objectStore(IDB_STORE).clear();
    // Clear active workspace images, preserving saved session archives
    if (db.objectStoreNames.contains(IDB_SESSION_STORE)) {
      tx.objectStore(IDB_SESSION_STORE).delete("current_active_workspace");
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  }
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
