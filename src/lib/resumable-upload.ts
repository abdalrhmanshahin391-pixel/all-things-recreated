import { supabase } from "@/integrations/supabase/client";

const CHUNK = 6 * 1024 * 1024; // Supabase's resumable endpoint wants exactly 6 MB pieces

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/**
 * Uploads a file of any size to a storage bucket. Small files go in one request; big ones (lecture videos)
 * are sent in 6 MB pieces over Supabase's resumable (TUS) endpoint, with a progress callback, retries for
 * dropped connections, and a clear message when the project's upload size limit is too small.
 */
export async function uploadLargeFile(
  bucket: string,
  path: string,
  file: File,
  opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const contentType = file.type || "application/octet-stream";

  if (file.size <= CHUNK) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType });
    if (error) throw new Error(error.message);
    opts.onProgress?.(100);
    return;
  }

  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const headers = async (extra: Record<string, string>) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You are signed out. Please sign in again and retry.");
    return { Authorization: `Bearer ${token}`, apikey, "Tus-Resumable": "1.0.0", ...extra };
  };

  const explain = async (res: Response) => {
    if (res.status === 413) {
      return "The file is bigger than the upload limit of this project. Raise it in Supabase → Storage → Settings → Upload file size limit (and on the bucket), then try again.";
    }
    if (res.status === 401 || res.status === 403) return "Upload not allowed for this account.";
    const text = await res.text().catch(() => "");
    return `Upload failed (${res.status}) ${text.slice(0, 160)}`.trim();
  };

  const create = await fetch(base, {
    method: "POST",
    signal: opts.signal,
    headers: await headers({
      "Upload-Length": String(file.size),
      "Upload-Metadata": [
        `bucketName ${b64(bucket)}`,
        `objectName ${b64(path)}`,
        `contentType ${b64(contentType)}`,
        `cacheControl ${b64("3600")}`,
      ].join(","),
      "x-upsert": "false",
    }),
  });
  if (!create.ok) throw new Error(await explain(create));
  const location = create.headers.get("Location");
  if (!location) throw new Error("The server did not accept the upload. Try again.");
  const url = location.startsWith("http") ? location : new URL(location, base).toString();

  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const piece = file.slice(offset, Math.min(offset + CHUNK, file.size));
    try {
      const res = await fetch(url, {
        method: "PATCH",
        signal: opts.signal,
        headers: await headers({
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        }),
        body: piece,
      });
      if (!res.ok) {
        if (res.status >= 500 || res.status === 409) throw new Error(`retry:${res.status}`);
        throw new Error(await explain(res));
      }
      offset = Number(res.headers.get("Upload-Offset") ?? offset + piece.size);
      failures = 0;
      opts.onProgress?.(Math.min(99, Math.round((offset / file.size) * 100)));
    } catch (err: any) {
      if (opts.signal?.aborted) throw new Error("Upload cancelled");
      const retryable = err?.message?.startsWith("retry:") || err?.name === "TypeError";
      if (!retryable || ++failures > 5) {
        throw new Error(retryable ? "The connection kept dropping. Check your internet and try again." : err.message);
      }
      // Ask the server how far it got, then carry on from there.
      await new Promise((r) => setTimeout(r, 1500 * failures));
      try {
        const head = await fetch(url, { method: "HEAD", headers: await headers({}) });
        const got = Number(head.headers.get("Upload-Offset"));
        if (head.ok && Number.isFinite(got)) offset = got;
      } catch {
        /* try the same piece again */
      }
    }
  }
  opts.onProgress?.(100);
}
