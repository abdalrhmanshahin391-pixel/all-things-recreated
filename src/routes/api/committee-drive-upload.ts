import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/committee-drive-upload")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return jsonError("Unauthorized", 401);

        const backendUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!backendUrl || !publishableKey) return jsonError("Backend is not configured", 500);

        const supabase = createClient(backendUrl, publishableKey, {
          auth: { persistSession: false },
          global: {
            headers: { Authorization: authorization },
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (publishableKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${publishableKey}`) {
                headers.set("Authorization", authorization);
              }
              headers.set("apikey", publishableKey);
              return fetch(input, { ...init, headers });
            },
          },
        });
        const { data: authData, error: authError } = await supabase.auth.getUser(authorization.slice(7));
        if (authError || !authData.user) return jsonError("Unauthorized", 401);
        const { data: canManage, error: roleError } = await supabase.rpc("can_manage_committee", {
          _user_id: authData.user.id,
        });
        if (roleError || !canManage) return jsonError("Forbidden", 403);

        const rawUrl = request.headers.get("x-drive-upload-url");
        const contentRange = request.headers.get("content-range");
        if (!rawUrl || !contentRange) return jsonError("Missing upload session details", 400);

        let uploadUrl: URL;
        try {
          uploadUrl = new URL(rawUrl);
        } catch {
          return jsonError("Invalid upload session", 400);
        }
        const isGateway = uploadUrl.hostname === "connector-gateway.lovable.dev";
        const isGoogleApi = uploadUrl.hostname === "googleapis.com" || uploadUrl.hostname.endsWith(".googleapis.com");
        if (
          uploadUrl.protocol !== "https:" ||
          (!isGateway && !isGoogleApi) ||
          (isGateway && !uploadUrl.pathname.startsWith("/google_drive/"))
        ) {
          return jsonError("Untrusted upload session", 400);
        }

        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (!Number.isFinite(contentLength) || contentLength > MAX_CHUNK_BYTES) {
          return jsonError("Upload chunk is too large", 413);
        }
        const isStatusProbe = /^bytes \*\/\d+$/.test(contentRange);
        const isChunk = /^bytes \d+-\d+\/\d+$/.test(contentRange);
        if (!isStatusProbe && !isChunk) return jsonError("Invalid upload range", 400);
        if ((isStatusProbe && contentLength !== 0) || (isChunk && contentLength === 0)) {
          return jsonError("Upload range does not match its body", 400);
        }

        const headers = new Headers({ "Content-Range": contentRange });
        const contentType = request.headers.get("content-type");
        if (contentType) headers.set("Content-Type", contentType);
        if (isGateway) {
          const lovableKey = process.env["LOVABLE_API_KEY"];
          const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
          if (!lovableKey || !driveKey) return jsonError("Google Drive is not connected", 503);
          headers.set("Authorization", `Bearer ${lovableKey}`);
          headers.set("X-Connection-Api-Key", driveKey);
        }

        const body = contentLength > 0 ? await request.arrayBuffer() : undefined;
        let upstream: Response;
        try {
          upstream = await fetch(uploadUrl, {
            method: "PUT",
            headers,
            body,
            redirect: "manual",
          });
        } catch (error) {
          console.error("Drive chunk relay failed", error);
          return jsonError("The server could not reach Google Drive", 502);
        }

        const responseHeaders = new Headers();
        const range = upstream.headers.get("range");
        if (range) responseHeaders.set("Range", range);
        responseHeaders.set("Content-Type", upstream.headers.get("content-type") ?? "application/json");
        return new Response(await upstream.arrayBuffer(), {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: responseHeaders,
        });
      },
    },
  },
});