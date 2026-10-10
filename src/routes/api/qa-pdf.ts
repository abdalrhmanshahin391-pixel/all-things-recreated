import { createFileRoute } from "@tanstack/react-router";

/**
 * AquaQadmin keeps the PDFs of its QA section in the Google Drive connected to this website.
 * Only the panel's server knows the key (the same QA_PUBLISH_KEY that publishes the questions).
 *
 *   POST /api/qa-pdf?action=upload&name=<file name>   body = the PDF bytes   -> { fileId }
 *   POST /api/qa-pdf?action=delete&id=<drive file id>                        -> { ok }
 *   GET  /api/qa-pdf?id=<drive file id>                                      -> the PDF bytes
 */

const FOLDER = ["QA PDFs"];
const MAX_BYTES = 40 * 1024 * 1024;

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
          const bytes = await drive.driveReadFileBytes(id);
          return new Response(bytes as unknown as BodyInit, {
            headers: { "content-type": "application/pdf", "cache-control": "private, no-store" },
          });
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
          if (action === "upload") {
            const name = (url.searchParams.get("name") ?? "document.pdf").replace(/[\\/:*?"<>|]/g, "_").slice(0, 150) || "document.pdf";
            const bytes = new Uint8Array(await request.arrayBuffer());
            if (!bytes.length) return jsonError("The file is empty", 400);
            if (bytes.length > MAX_BYTES) return jsonError("The file is too large (40 MB at most)", 413);
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
