// Client-only helper: extract unique frames from a video file.
// Samples ~1 frame/sec, dedupes via 16x16 grayscale average-hash (hamming <= 4 = duplicate).

export type ExtractOptions = {
  fps?: number;            // sample rate, default 1
  jpegQuality?: number;    // 0..1, default 0.82
  maxWidth?: number;       // downscale long edge, default 1280
  signal?: AbortSignal;    // cancel
  onProgress?: (done: number, total: number) => void;
};

export type ExtractedFrame = {
  base64: string;          // raw base64 (no data: prefix)
  mimeType: "image/jpeg";
  timeSec: number;
};

const HASH_SIDE = 16;
const HASH_BITS = HASH_SIDE * HASH_SIDE;
const DUP_THRESHOLD = 4; // hamming distance; <= means duplicate

function hamming(a: Uint8Array, b: Uint8Array) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

function aHash(canvas: HTMLCanvasElement): Uint8Array {
  const hctx = document.createElement("canvas");
  hctx.width = HASH_SIDE; hctx.height = HASH_SIDE;
  const ctx = hctx.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, HASH_SIDE, HASH_SIDE);
  const img = ctx.getImageData(0, 0, HASH_SIDE, HASH_SIDE).data;
  const gray = new Float32Array(HASH_BITS);
  let sum = 0;
  for (let i = 0, p = 0; i < img.length; i += 4, p++) {
    const g = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    gray[p] = g;
    sum += g;
  }
  const avg = sum / HASH_BITS;
  const bits = new Uint8Array(Math.ceil(HASH_BITS / 8));
  for (let i = 0; i < HASH_BITS; i++) {
    if (gray[i] > avg) bits[i >> 3] |= 1 << (i & 7);
  }
  return bits;
}

export async function extractFrames(file: File, opts: ExtractOptions = {}): Promise<ExtractedFrame[]> {
  const fps = opts.fps ?? 1;
  const quality = opts.jpegQuality ?? 0.82;
  const maxW = opts.maxWidth ?? 1280;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load the video."));
    });

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      throw new Error("Video has no readable duration.");
    }

    const ratio = Math.min(1, maxW / Math.max(video.videoWidth, video.videoHeight));
    const W = Math.max(2, Math.round(video.videoWidth * ratio));
    const H = Math.max(2, Math.round(video.videoHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const step = 1 / fps;
    const total = Math.max(1, Math.floor(duration / step));
    const frames: ExtractedFrame[] = [];
    let lastHash: Uint8Array | null = null;

    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const t = Math.min(duration - 0.05, i * step);
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
        const onErr = () => { video.removeEventListener("error", onErr); reject(new Error("Seek failed")); };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onErr, { once: true });
        try { video.currentTime = t; } catch (e) { reject(e as Error); }
      });

      ctx.drawImage(video, 0, 0, W, H);
      const hash = aHash(canvas);
      if (lastHash && hamming(hash, lastHash) <= DUP_THRESHOLD) {
        opts.onProgress?.(i + 1, total);
        continue;
      }
      lastHash = hash;

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", quality),
      );
      if (!blob) { opts.onProgress?.(i + 1, total); continue; }
      const base64 = await blobToBase64(blob);
      frames.push({ base64, mimeType: "image/jpeg", timeSec: t });
      opts.onProgress?.(i + 1, total);
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
