import { startDriveUpload, finishDriveUpload, uploadDriveBase64, deleteDriveFile } from "@/lib/committee-drive.functions";
import { supabase } from "@/integrations/supabase/client";

export type DriveFileResult = {
  fileId: string;
  name: string;
  size: number | null;
  webViewLink: string;
  downloadLink: string;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(s);
}

const MB = 1024 * 1024;
const DIRECT_RETRIES = 5;
/** Drive requires chunks to be multiples of 256 KB (except the final one). */
function chunkSizeFor(total: number) {
  // Keep chunks below common edge request limits so the same chunk can be
  // relayed safely when a browser cannot talk to the resumable URL directly.
  return 8 * MB;
}
/** Abort a chunk only when the connection actually stalls, never on a fixed clock. */
const STALL_MS = 90_000;

type ChunkResult = { done: boolean; id?: string; nextOffset?: number };
export type DriveUploadPhase = "uploading" | "recovering" | "finalizing" | "saving";

async function relayRequest(url: string, range: string, body?: Blob): Promise<ChunkResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Sign in again and retry the upload.");
  const response = await fetch("/api/committee-drive-upload", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Drive-Upload-Url": url,
      "Content-Range": range,
      ...(body?.type ? { "Content-Type": body.type } : {}),
    },
    body,
  });
  const text = await response.text();
  if (response.status === 308) {
    const confirmed = response.headers.get("Range");
    return { done: false, nextOffset: confirmed ? Number(confirmed.split("-")[1]) + 1 : 0 };
  }
  if (response.ok) {
    const id = responseFileId(text);
    if (id) return { done: true, id };
    throw new Error("Google Drive completed the upload but did not return a file id.");
  }
  let detail = text;
  try {
    detail = JSON.parse(text)?.error ?? text;
  } catch {
    // Preserve the upstream response text.
  }
  throw driveUploadError(response.status, detail);
}

function responseFileId(text: string): string | null {
  try {
    const value = JSON.parse(text || "{}");
    return typeof value?.id === "string" && value.id ? value.id : null;
  } catch {
    return null;
  }
}

function driveUploadError(status: number, body = "") {
  if (status === 404 || status === 410) {
    return new Error("The Google Drive upload session expired. Press Save to retry the upload.");
  }
  if (status === 401 || status === 403) {
    return new Error("Google Drive rejected the upload permission. Reconnect Drive and try again.");
  }
  const detail = body.trim().slice(0, 180);
  return new Error(`Google Drive rejected the upload (${status})${detail ? `: ${detail}` : ""}`);
}

function putChunk(
  url: string,
  slice: Blob,
  start: number,
  end: number,
  total: number,
  onProgress?: (loaded: number) => void,
  relay = false,
): Promise<ChunkResult> {
  if (relay) {
    return relayRequest(url, `bytes ${start}-${end - 1}/${total}`, slice);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${total}`);
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let stalled = false;
    const arm = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, STALL_MS);
    };
    const clear = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    xhr.upload.onprogress = (event) => {
      arm();
      onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      clear();
      if (xhr.status === 308) {
        const range = xhr.getResponseHeader("Range");
        const next = range ? Number(range.split("-")[1]) + 1 : end;
        return resolve({ done: false, nextOffset: next });
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const id = responseFileId(xhr.responseText);
        if (id) return resolve({ done: true, id });
        return reject(new Error("Drive did not return a file id"));
      }
      reject(driveUploadError(xhr.status, xhr.responseText));
    };
    xhr.onerror = () => {
      clear();
      reject(new Error("The connection to Google Drive was interrupted."));
    };
    xhr.onabort = () => {
      clear();
      reject(new Error(stalled ? "The upload stalled with no data moving." : "The upload was cancelled."));
    };
    arm();
    xhr.send(slice);
  });
}

function queryUploadStatusDirect(url: string, total: number): Promise<ChunkResult | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Range", `bytes */${total}`);
    xhr.onload = () => {
      if (xhr.status === 308) {
        const range = xhr.getResponseHeader("Range");
        return resolve({ done: false, nextOffset: range ? Number(range.split("-")[1]) + 1 : 0 });
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const id = responseFileId(xhr.responseText);
        if (id) return resolve({ done: true, id });
        return reject(new Error("Google Drive completed the upload but did not return a file id."));
      }
      if (xhr.status === 404 || xhr.status === 410) return reject(driveUploadError(xhr.status));
      resolve(null);
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.timeout = 30_000;
    xhr.send();
  });
}

async function queryUploadStatus(url: string, total: number, relay: boolean): Promise<ChunkResult | null> {
  if (relay) return relayRequest(url, `bytes */${total}`);
  const direct = await queryUploadStatusDirect(url, total);
  if (direct) return direct;
  return relayRequest(url, `bytes */${total}`);
}

/** Resumable upload that recovers Drive's confirmed offset after interruptions. */
async function putChunked(
  url: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
  onPhase?: (phase: DriveUploadPhase) => void,
): Promise<string> {
  const total = blob.size;
  const chunk = chunkSizeFor(total);
  let offset = 0;
  let attempts = 0;
  let relay = false;
  while (offset < total) {
    const end = Math.min(offset + chunk, total);
    try {
      onPhase?.(end === total ? "finalizing" : "uploading");
      const res = await putChunk(url, blob.slice(offset, end), offset, end, total, (loaded) => {
        const sent = Math.min(total, offset + loaded);
        onProgress?.(Math.min(98, Math.round((sent / total) * 98)));
      }, relay);
      attempts = 0;
      if (res.done && res.id) {
        onProgress?.(99);
        return res.id;
      }
      offset = res.nextOffset ?? end;
      onProgress?.(Math.min(98, Math.round((offset / total) * 98)));
    } catch (e) {
      attempts++;
      onPhase?.("recovering");
      relay = true;
      let status: ChunkResult | null = null;
      try {
        status = await queryUploadStatus(url, total, relay);
      } catch (statusError) {
        if (attempts >= DIRECT_RETRIES) {
          const message = statusError instanceof Error ? statusError.message : "The connection was interrupted.";
          throw new Error(`${message} Drive could not resume after ${DIRECT_RETRIES} attempts. Press Save to retry.`);
        }
      }
      if (status?.done && status.id) {
        onProgress?.(99);
        return status.id;
      }
      if (typeof status?.nextOffset === "number") offset = status.nextOffset;
      if (attempts >= DIRECT_RETRIES) {
        const message = e instanceof Error ? e.message : "The connection was interrupted.";
        throw new Error(`${message} Drive could not resume after ${DIRECT_RETRIES} attempts. Press Save to retry.`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 1_000 * 2 ** (attempts - 1))));
    }
  }
  throw new Error("Drive upload finished without returning a file id");
}

/**
 * Uploads a file into the site's Google Drive and returns its public links.
 * Tries a direct browser -> Drive upload first (fast, no server hop); if the
 * browser blocks that, small files fall back to a server-side upload.
 */
export async function uploadFileToDrive(
  file: Blob,
  opts: {
    categoryId: string | null;
    fileName: string;
    onProgress?: (pct: number) => void;
    onPhase?: (phase: DriveUploadPhase) => void;
  },
): Promise<DriveFileResult> {
  const mimeType = file.type || "application/pdf";
  try {
    const { uploadUrl } = await startDriveUpload({
      data: { categoryId: opts.categoryId, fileName: opts.fileName, mimeType, size: file.size },
    });
    opts.onPhase?.("uploading");
    const fileId = await putChunked(uploadUrl, file, opts.onProgress, opts.onPhase);
    opts.onPhase?.("saving");
    const result = (await finishDriveUpload({ data: { fileId } })) as DriveFileResult;
    opts.onProgress?.(99);
    return result;
  } catch (err) {
    if (file.size > 24 * 1024 * 1024) throw err;
    const base64 = await blobToBase64(file);
    opts.onProgress?.(90);
    const res = (await uploadDriveBase64({
      data: { categoryId: opts.categoryId, fileName: opts.fileName, mimeType, base64 },
    })) as DriveFileResult;
    opts.onProgress?.(99);
    return res;
  }
}

export async function removeDriveFile(fileId: string) {
  try {
    await deleteDriveFile({ data: { fileId } });
  } catch {
    /* the row is going away regardless */
  }
}