import { sendWebPush } from "./web-push.server";

export type PushBody = {
  title_en: string;
  body_en: string;
  title_ar: string;
  body_ar: string;
  url: string;
};

type Device = { user_id: string; endpoint: string; p256dh: string; auth: string; lang: string };

function payloadFor(msg: PushBody, lang: string) {
  const ar = lang === "ar";
  const title = (ar ? msg.title_ar : msg.title_en) || msg.title_en || msg.title_ar;
  const body = (ar ? msg.body_ar : msg.body_en) || msg.body_en || msg.body_ar;
  return { title, body, url: msg.url || "/", lang: ar ? "ar" : "en", dir: ar ? "rtl" : "ltr" };
}

/** Deliver one message to every device in the audience and record the results. */
export async function deliverMessage(messageId: string, msg: PushBody, groupIds: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("push_audience_devices", { _group_ids: groupIds });
  if (error) throw new Error(error.message);
  const devices = (data ?? []) as Device[];

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const rows: any[] = [];

  const batchSize = 25;
  for (let i = 0; i < devices.length; i += batchSize) {
    const batch = devices.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((d) => sendWebPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, payloadFor(msg, d.lang))),
    );
    results.forEach((r, idx) => {
      const d = batch[idx]!;
      if (r.ok) sent++;
      else {
        failed++;
        if (r.gone) dead.push(d.endpoint);
      }
      rows.push({
        message_id: messageId,
        user_id: d.user_id,
        endpoint: d.endpoint.slice(0, 400),
        ok: r.ok,
        status_code: r.status,
        error: r.error.slice(0, 300),
      });
    });
  }

  if (dead.length) await (supabaseAdmin.from as any)("push_subscriptions").delete().in("endpoint", dead);
  if (rows.length) await (supabaseAdmin.from as any)("push_deliveries").insert(rows);
  await (supabaseAdmin.from as any)("push_messages")
    .update({ status: "sent", sent_count: sent, failed_count: failed, sent_at: new Date().toISOString() })
    .eq("id", messageId);

  return { sent, failed, devices: devices.length };
}

/** Create + send in one go (used by the manual sender and the automatic triggers). */
export async function createAndSend(
  msg: PushBody,
  groupIds: string[],
  source: string,
  createdBy: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from as any)("push_messages")
    .insert({ ...msg, audience_group_ids: groupIds, source, created_by: createdBy, status: "sending" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return deliverMessage(data.id as string, msg, groupIds);
}

/** Only admins and committee heads may send notifications. */
export async function assertSender(context: any) {
  const [{ data: admin }, { data: head }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "committee_head" }),
  ]);
  if (!admin && !head) throw new Error("Forbidden");
}
