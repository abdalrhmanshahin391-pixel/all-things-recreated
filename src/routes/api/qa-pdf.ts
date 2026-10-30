import { createFileRoute } from "@tanstack/react-router";

/**
 * AquaQadmin keeps the PDFs of its QA section in the Google Drive connected to this website.
 * Only the panel's server knows the key (the same QA_PUBLISH_KEY that publishes the questions).
 *
 *   POST /api/qa-pdf?action=start&name=<file name>&size=<bytes>   -> { uploadUrl }   (opens a resumable upload in Drive)
 *   POST /api/qa-pdf?action=chunk&url=<uploadUrl>   Content-Range, body = up to 8 MB
 *                                                                 -> { status, range, text }  (what Drive answered)
 *   POST /api/qa-pdf?action=upload&name=<file name>   body = the PDF bytes (small files, kept for old callers) -> { fileId }
 *   POST /api/qa-pdf?action=delete&id=<drive file id>                        -> { ok }
 *   GET  /api/qa-pdf?id=<drive file id>                                      -> the PDF bytes (streamed)
 *
 * A big PDF (up to 80 MB) never sits in memory: the panel sends it in chunks of 8 MB and each chunk is passed on to Drive.
 */

const FOLDER = ["QA PDFs"];
/** the old one-request upload keeps its smaller limit (the whole file is held in memory) */
const MAX_SIMPLE_BYTES = 40 * 1024 * 1024;
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function allowed(request: Request): Response | null {
  const secret = process.env["QA_PUBLISH_KEY"];
  if (!secret) return jsonError("The PDF storage is not set up: QA_PUBLISH_KEY is missing.", 500);
  if (!sameSecret(request.headers.get("x-qa-publish-key") ?? "", secret)) return jsonError("Unauthorized", 401);
  return null;
}

const cleanId = (value: string | null) => (value && /^[A-Za-z0-9_-]{10,200}$/.test(value) ? value : "");
const cleanName = (value: string | null) =>
  (value ?? "document.pdf").replace(/[\\/:*?"<>|]/g, "_").slice(0, 150) || "document.pdf";

export const Route = createFileRoute("/api/qa-pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = allowed(request);
        if (denied) return denied;
        const id = cleanId(new URL(request.url).searchParams.get("id"));
        if (!id) return jsonError("Missing file id", 400);
        try {
          const drive = await import("@/lib/committee-drive.server");
          const source = await drive.driveReadStream(id);
          const headers: Record<string, string> = {
            "content-type": "application/pdf",
            "cache-control": "private, no-store",
          };
          const length = source.headers.get("content-length");
          if (length) headers["content-length"] = length;
          return new Response(source.body, { headers });
        } catch (error) {
          console.error("qa-pdf read failed", error);
          return jsonError(error instanceof Error ? error.message : "Could not read the PDF", 502);
        }
      },

      POST: async ({ request }) => {
        const denied = allowed(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        try {
          const drive = await import("@/lib/committee-drive.server");
          if (action === "delete") {
            const id = cleanId(url.searchParams.get("id"));
            if (!id) return jsonError("Missing file id", 400);
            await drive.driveDelete(id);
            return Response.json({ ok: true });
          }

          if (action === "start") {
            const name = cleanName(url.searchParams.get("name"));
            const size = Number(url.searchParams.get("size"));
            if (!Number.isInteger(size) || size <= 0) return jsonError("The file is empty", 400);
            if (size > MAX_BYTES) return jsonError("The file is too large (80 MB at most)", 413);
            const parentId = await drive.driveEnsureFolderPath(FOLDER);
            const uploadUrl = await drive.driveStartResumable({
              name,
              mimeType: "application/pdf",
              parentId,
              size,
            });
            return Response.json({ uploadUrl });
          }

          if (action === "chunk") {
            let target: URL;
            try {
              target = new URL(url.searchParams.get("url") ?? "");
            } catch {
              return jsonError("Invalid upload session", 400);
            }
            const isGateway =
              target.hostname === "connector-gateway.lovable.dev" && target.pathname.startsWith("/google_drive/");
            const isGoogleApi = target.hostname === "googleapis.com" || target.hostname.endsWith(".googleapis.com");
            if (target.protocol !== "https:" || (!isGateway && !isGoogleApi)) {
              return jsonError("Untrusted upload session", 400);
            }
            const range = request.headers.get("content-range") ?? "";
            const probe = /^bytes \*\/\d+$/.test(range);
            if (!probe && !/^bytes \d+-\d+\/\d+$/.test(range)) return jsonError("Invalid upload range", 400);
            const length = Number(request.headers.get("content-length") ?? "0");
            if (!Number.isFinite(length) || length > MAX_CHUNK_BYTES) return jsonError("The chunk is too large", 413);
            if ((probe && length !== 0) || (!probe && length === 0)) {
              return jsonError("The range does not match the body", 400);
            }
            const headers = new Headers({ "Content-Range": range });
            if (isGateway) {
              const lovableKey = process.env["LOVABLE_API_KEY"];
              const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
              if (!lovableKey || !driveKey) return jsonError("Google Drive is not connected", 503);
              headers.set("Authorization", `Bearer ${lovableKey}`);
              headers.set("X-Connection-Api-Key", driveKey);
            }
            const body = length > 0 ? await request.arrayBuffer() : undefined;
            const upstream = await fetch(target, { method: "PUT", headers, body, redirect: "manual" });
            return Response.json({
              status: upstream.status,
              range: upstream.headers.get("range"),
              text: (await upstream.text()).slice(0, 2000),
            });
          }

          if (action === "upload") {
            const name = cleanName(url.searchParams.get("name"));
            const bytes = new Uint8Array(await request.arrayBuffer());
            if (!bytes.length) return jsonError("The file is empty", 400);
            if (bytes.length > MAX_SIMPLE_BYTES) return jsonError("The file is too large (40 MB at most)", 413);
            const parentId = await drive.driveEnsureFolderPath(FOLDER);
            const fileId = await drive.driveUploadBytes({ name, mimeType: "application/pdf", parentId, bytes });
            return Response.json({ fileId });
          }
          return jsonError("Unknown action", 400);
        } catch (error) {
          console.error("qa-pdf failed", error);
          return jsonError(error instanceof Error ? error.message : "The PDF storage failed", 502);
        }
      },
    },
  },
});
