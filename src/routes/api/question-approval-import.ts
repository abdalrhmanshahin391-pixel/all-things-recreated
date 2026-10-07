import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Lets Aqua Studio (Aqua Papers) send a question group to Admin → Aqua MCQ Gen Pro → Question approval,
 * so QA can review it on the website, side by side with the original PDF pages.
 *
 * POST /api/question-approval-import      Authorization: Bearer <the person's Aqua session token>
 *   Step 1  { action: "create", group: { name, source_name? }, items: [ { page_no, order_index, number_label, form,
 *             stem, statements, options, flagged, flag_reason, answer_labels, answer_mode, explanation?, solved } ] }
 *           -> { groupId }
 *   Step 2  { action: "pages", groupId, pages: [ { page_no, image: "data:image/jpeg;base64,..." } ] }   (repeat in parts)
 *           -> { stored }
 *
 * Admin or QBank only. Every send makes a NEW group, so nothing that already exists can be overwritten.
 */

const MAX_BODY_BYTES = 45 * 1024 * 1024;
const MAX_ITEMS = 1500;
const BUCKET = "amg-pages";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function dupHash(stem: string): string {
  const norm = String(stem ?? "").toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, " ").replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) | 0;
  return `${norm.slice(0, 60)}#${h}`;
}

const short = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function cleanItem(raw: any, groupId: string, index: number) {
  const stem = short(raw?.stem, 8000);
  if (!stem) return null;
  const options = (Array.isArray(raw?.options) ? raw.options : []).slice(0, 30)
    .map((o: any, i: number) => ({ label: short(o?.label, 8) || String.fromCharCode(65 + i), text: short(o?.text, 2000) }))
    .filter((o: any) => o.text);
  const statements = (Array.isArray(raw?.statements) ? raw.statements : []).slice(0, 30)
    .map((s: any) => ({ n: short(s?.n, 8), text: short(s?.text, 2000) }))
    .filter((s: any) => s.text);
  const labels = (Array.isArray(raw?.answer_labels) ? raw.answer_labels : []).map((l: any) => short(l, 8).toUpperCase()).filter(Boolean).slice(0, 30);
  const explanationText = String(raw?.explanation ?? "").trim().slice(0, 18000);
  const solved = Boolean(raw?.solved) && labels.length > 0 && !!explanationText;
  return {
    group_id: groupId,
    page_no: Math.max(1, Math.min(1000, Number(raw?.page_no) || 1)),
    order_index: Number.isFinite(Number(raw?.order_index)) ? Number(raw.order_index) : index,
    form: raw?.form === "B" ? "B" : "A",
    number_label: short(raw?.number_label, 16),
    stem,
    statements,
    options,
    flagged: Boolean(raw?.flagged),
    flag_reason: short(raw?.flag_reason, 300),
    status: "pending",
    answer_labels: labels,
    answer_mode: raw?.answer_mode === "multiple" ? "multiple" : "single",
    explanation: explanationText ? { explanation: explanationText, format: "verdict_table_v1" } : null,
    solved,
    dup_hash: dupHash(stem),
  };
}

export const Route = createFileRoute("/api/question-approval-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const userId = authData.user.id;
        const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
        if (roleError) return jsonError("Forbidden", 403);
        if (!isAdmin) {
          const { data: isQbank } = await supabase.rpc("has_role", { _user_id: userId, _role: "qbank" as any });
          if (!isQbank) return jsonError("Forbidden: admin or QBank only", 403);
        }

        const length = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(length) && length > MAX_BODY_BYTES) return jsonError("That request is too large. Send fewer pages at a time.", 413);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonError("The request body is not valid JSON", 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body?.action === "create") {
          const rawItems: any[] = Array.isArray(body?.items) ? body.items : [];
          if (!rawItems.length) return jsonError("No questions to send", 400);
          if (rawItems.length > MAX_ITEMS) return jsonError(`At most ${MAX_ITEMS} questions per send`, 413);
          const name = short(body?.group?.name, 80) || "From Aqua Studio";
          const { data: group, error: gErr } = await supabaseAdmin.from("amg_groups").insert({
            name,
            status: "approval",
            source_name: short(body?.group?.source_name, 200),
            answer_source: "ai",
            created_by: userId,
          }).select("id").single();
          if (gErr || !group) return jsonError(`Could not create the group: ${gErr?.message ?? "unknown error"}`, 500);

          const rows = rawItems.map((r, i) => cleanItem(r, group.id, i)).filter((r): r is NonNullable<ReturnType<typeof cleanItem>> => r !== null);
          for (let i = 0; i < rows.length; i += 200) {
            const { error } = await supabaseAdmin.from("amg_items").insert(rows.slice(i, i + 200));
            if (error) {
              await supabaseAdmin.from("amg_groups").delete().eq("id", group.id);
              return jsonError(`Could not save the questions: ${error.message}`, 500);
            }
          }
          const pageCount = rows.reduce((m, r) => Math.max(m, r.page_no), 0);
          await supabaseAdmin.from("amg_groups").update({ page_count: pageCount }).eq("id", group.id);
          await supabaseAdmin.from("amg_events").insert({
            group_id: group.id, actor: userId, action: "sent_from_studio", detail: { questions: rows.length },
          });
          return Response.json({ groupId: group.id, questions: rows.length });
        }

        if (body?.action === "pages") {
          const groupId = String(body?.groupId ?? "");
          if (!/^[0-9a-f-]{36}$/i.test(groupId)) return jsonError("Missing group", 400);
          const { data: group } = await supabaseAdmin.from("amg_groups").select("id, created_by").eq("id", groupId).maybeSingle();
          if (!group) return jsonError("That group does not exist", 404);
          if (group.created_by !== userId && !isAdmin) return jsonError("Forbidden", 403);
          const pages: any[] = Array.isArray(body?.pages) ? body.pages.slice(0, 40) : [];
          let stored = 0;
          for (const p of pages) {
            const pageNo = Math.max(1, Math.min(1000, Number(p?.page_no) || 0));
            const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(p?.image ?? ""));
            if (!pageNo || !match) continue;
            const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
            const ext = match[1] === "png" ? "png" : "jpg";
            const path = `${groupId}/${String(pageNo).padStart(4, "0")}.${ext}`;
            const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: `image/${match[1]}`, upsert: true });
            if (error) return jsonError(`Could not store page ${pageNo}: ${error.message}`, 500);
            const { data: pageRow, error: pErr } = await supabaseAdmin.from("amg_pages").upsert(
              { group_id: groupId, page_no: pageNo, storage_path: path, status: "done", error: null },
              { onConflict: "group_id,page_no" },
            ).select("id").single();
            if (pErr) return jsonError(`Could not register page ${pageNo}: ${pErr.message}`, 500);
            if (pageRow) await supabaseAdmin.from("amg_items").update({ page_id: pageRow.id }).eq("group_id", groupId).eq("page_no", pageNo);
            stored += 1;
          }
          if (stored) {
            const { count } = await supabaseAdmin.from("amg_pages").select("id", { count: "exact", head: true }).eq("group_id", groupId);
            await supabaseAdmin.from("amg_groups").update({ pages_done: count ?? stored }).eq("id", groupId);
          }
          return Response.json({ stored });
        }

        return jsonError("Unknown action", 400);
      },
    },
  },
});
