// Browser-only helper: render PDF pages to JPEG base64 using pdfjs-dist.
// Used by the Jarvis Vision-mode importer for scanned / image-based PDFs.

// Use PDF.js' legacy browser build. The default v6 build depends on very new
// Safari APIs and has been the source of the iPad image-mode hangs.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Vite-friendly worker URL
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// pdfjs-dist v6 uses very new JS APIs that iPad Safari (and many current
// browsers) do not ship yet: Math.sumPrecise and Map/WeakMap
// getOrInsert / getOrInsertComputed. Without these, page.render() throws
// "getOrInsertComputed is not a function" and an import looks frozen.
// Patch them as soon as this module loads, before any PDF work happens.
(function installPdfJsPolyfills() {
  if (typeof (Math as any).sumPrecise !== "function") {
    (Math as any).sumPrecise = (values: Iterable<number>) => {
      let total = 0;
      for (const value of values) total += Number(value) || 0;
      return total;
    };
  }
  for (const Ctor of [Map, WeakMap] as any[]) {
    const proto = Ctor?.prototype;
    if (!proto) continue;
    if (typeof proto.getOrInsertComputed !== "function") {
      proto.getOrInsertComputed = function (key: any, callback: (k: any) => any) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        this.set(key, value);
        return value;
      };
    }
    if (typeof proto.getOrInsert !== "function") {
      proto.getOrInsert = function (key: any, value: any) {
        if (this.has(key)) return this.get(key);
        this.set(key, value);
        return value;
      };
    }
  }
})();

/** The PDF.js worker runs in its own JS realm, so it needs the same polyfills.
 *  We wrap the real worker in a tiny module that patches first, then loads it. */
function polyfilledWorkerUrl(realUrl: string): string {
  try {
    const abs = new URL(realUrl, window.location.href).href;
    const src = `
if (typeof Math.sumPrecise !== "function") {
  Math.sumPrecise = (v) => { let t = 0; for (const x of v) t += Number(x) || 0; return t; };
}
for (const C of [Map, WeakMap]) {
  const p = C && C.prototype;
  if (!p) continue;
  if (typeof p.getOrInsertComputed !== "function") {
    p.getOrInsertComputed = function (k, cb) {
      if (this.has(k)) return this.get(k);
      const v = cb(k); this.set(k, v); return v;
    };
  }
  if (typeof p.getOrInsert !== "function") {
    p.getOrInsert = function (k, v) {
      if (this.has(k)) return this.get(k);
      this.set(k, v); return v;
    };
  }
}
const pdfjsWorker = await import(${JSON.stringify(abs)});
globalThis.pdfjsWorker = pdfjsWorker;
export const WorkerMessageHandler = pdfjsWorker.WorkerMessageHandler;
`;
    return URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  } catch {
    return realUrl;
  }
}

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
    typeof window === "undefined" ? workerUrl : polyfilledWorkerUrl(workerUrl);
  workerConfigured = true;
}


let cachedDoc: { key: string; doc: any } | null = null;

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Lightweight page count without rendering or extracting page images. */
export async function getPdfPageCount(file: File): Promise<number> {
  // pdf.js document opening can hang on iPad/Safari for some Canva/iLovePDF files.
  // pdf-lib is usually faster for page count only, and we still use pdf.js later
  // for the actual per-page text extraction.
  try {
    const { PDFDocument, ParseSpeeds } = await import("pdf-lib");
    const buf = await file.arrayBuffer();
    const doc = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      parseSpeed: ParseSpeeds.Fastest,
      updateMetadata: false,
    } as any);
    const count = doc.getPageCount();
    if (count > 0) return count;
  } catch {
    // Fall back to pdf.js below.
  }
  const doc = await loadPdfForText(file);
  return Number(doc.numPages || 0);
}

function shouldDisablePdfWorker() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touchPoints = Number((navigator as any).maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1);
}

async function openPdfJsDocument(
  data: Uint8Array,
  options: Record<string, unknown>,
  timeoutMs: number,
  label: string,
): Promise<any> {
  const loadingTask = (pdfjsLib as any).getDocument({
    ...options,
    data,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        try { loadingTask.destroy?.(); } catch { /* ignore cleanup failures */ }
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      loadingTask.promise.then(resolve).catch(reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadPdfForRender(file: File): Promise<any> {
  ensureWorker();
  const disableWorker = shouldDisablePdfWorker();
  const key = `${fileKey(file)}:${disableWorker ? "main-thread" : "worker"}`;
  if (cachedDoc && cachedDoc.key === key) return cachedDoc.doc;
  const buf = await file.arrayBuffer();
  const options = {
    stopAtErrors: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    disableWorker,
  };
  let doc: any;
  try {
    doc = await openPdfJsDocument(new Uint8Array(buf.slice(0)), options, 30_000, "PDF open");
  } catch (error) {
    if (disableWorker) throw error;
    // If the worker path fails, retry in the main thread. This is slower but
    // prevents the whole import from dying before chunk status can be shown.
    doc = await openPdfJsDocument(new Uint8Array(buf.slice(0)), {
      ...options,
      disableWorker: true,
    }, 45_000, "PDF fallback open");
  }
  cachedDoc = { key, doc };
  return doc;
}

/** Image-mode loader: prefer the PDF.js WORKER (off the main thread) even on iPad.
 *  Rendering equation/diagram pages on the main thread can hang Safari forever,
 *  so we try the worker first and only fall back to main-thread if it fails. */
export async function loadPdfForRenderPreferWorker(file: File): Promise<any> {
  ensureWorker();
  const key = `${fileKey(file)}:prefer-worker`;
  if (cachedDoc && cachedDoc.key === key) return cachedDoc.doc;
  const buf = await file.arrayBuffer();
  const options = {
    stopAtErrors: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  };
  let doc: any;
  let workerError: unknown;
  try {
    // Do not let a broken Safari worker initialization consume the whole page
    // timeout. If the worker does not open quickly, destroy it and immediately
    // retry without a worker.
    doc = await openPdfJsDocument(new Uint8Array(buf.slice(0)), {
      ...options,
      disableWorker: false,
    }, 12_000, "PDF worker open");
  } catch (error) {
    workerError = error;
    try {
      doc = await openPdfJsDocument(new Uint8Array(buf.slice(0)), {
        ...options,
        disableWorker: true,
      }, 35_000, "PDF main-thread open");
    } catch (fallbackError: any) {
      const first = workerError instanceof Error ? workerError.message : String(workerError || "worker failed");
      const second = fallbackError?.message || String(fallbackError || "main-thread fallback failed");
      throw new Error(`Image-mode PDF render setup failed. Worker: ${first}. Fallback: ${second}`.slice(0, 500));
    }
  }
  cachedDoc = { key, doc };
  return doc;
}

/** Text-only PDF.js loader. It never renders pages/canvas, so Canva PDFs with page images stay cheap. */
export async function loadPdfForText(file: File): Promise<any> {
  return loadPdfForRender(file);
}


/** Extract pure selectable text from the requested page range using the cached full pdfjs doc.
 *  Reusing the doc across chunks means the first page pays the parse cost and every later chunk
 *  is just per-page text extraction — no pdf-lib slicing, no re-parsing. */
export async function getPdfPageTexts(file: File, pageFrom: number, pageTo: number): Promise<string[]> {
  const doc = await loadPdfForRender(file);
  const total = Number(doc.numPages || 0);
  const from = Math.max(1, Math.min(total || pageFrom, pageFrom));
  const to = Math.max(from, Math.min(total || pageTo, pageTo));
  const texts: string[] = [];
  for (let i = from; i <= to; i++) {
    texts.push(await getPageText(doc, i));
  }
  return texts;
}

export function clearPdfRenderCache() {
  cachedDoc = null;
}

/** Extract the plain text of a single page via pdfjs (no OCR). Returns "" on failure. */
export async function getPageText(doc: any, pageNumber: number): Promise<string> {
  try {
    const page = await doc.getPage(pageNumber);
    const tc = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
    // Preserve rough reading lines instead of flattening everything with spaces.
    // This makes local heading detection + bookend slicing much more reliable
    // and helps iPad/desktop produce the same low-cost text pipeline.
    const items = ((tc.items as any[]) ?? [])
      .map((it) => ({
        str: String(it.str ?? ""),
        x: Number(it.transform?.[4] ?? 0),
        y: Number(it.transform?.[5] ?? 0),
      }))
      .filter((it) => it.str.trim());
    if (!items.length) return "";
    const lines: { y: number; items: typeof items }[] = [];
    for (const it of items) {
      let line = lines.find((l) => Math.abs(l.y - it.y) <= 3);
      if (!line) {
        line = { y: it.y, items: [] };
        lines.push(line);
      }
      line.items.push(it);
      line.y = (line.y + it.y) / 2;
    }
    return lines
      .sort((a, b) => b.y - a.y)
      .map((line) => line.items.sort((a, b) => a.x - b.x).map((it) => it.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

/** Rough estimate of how many MCQs are on a page using text markers.
 *  Returns 0 if the page seems scanned/empty so callers know to use vision. */
export function estimateQuestionsInText(text: string): { expected: number; scanned: boolean } {
  const t = text || "";
  if (t.trim().length < 30) return { expected: 0, scanned: true };
  const answers = (t.match(/\b(?:Ans|Answer)\s*[\.:：]?/gi) || []).length;
  const options = (t.match(/(?:^|\n|\s)[A-D]\s*[\).:]/g) || []).length;
  const numbered = (t.match(/(?:^|\n|\s)(\d{1,3})\s*[\).]/g) || []).length;
  const qmarks = (t.match(/\?/g) || []).length;
  // Numbered table-of-contents pages can look like questions. Only trust numbering
  // when answer markers/options/question marks say this is real exam content.
  if (answers === 0 && options < 4 && qmarks === 0) return { expected: 0, scanned: false };
  // Pick the highest reasonable signal, capped at 40 per chunk.
  const expected = Math.min(40, Math.max(answers, Math.min(numbered, Math.ceil(options / 4)), Math.ceil(qmarks * 0.6)));
  return { expected, scanned: false };
}

/** Render a single page (1-indexed) to a JPEG base64 string (no data: prefix). */
export async function renderPageToJpegBase64(
  doc: any,
  pageNumber: number,
  opts: { targetWidth?: number; quality?: number } = {},
): Promise<string> {
  const targetWidth = opts.targetWidth ?? 1100;
  const quality = opts.quality ?? 0.7;


  const page = await doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, targetWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  // strip "data:image/jpeg;base64,"
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}
