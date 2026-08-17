import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PushDraft = {
  title_en: string;
  body_en: string;
  title_ar: string;
  body_ar: string;
  url: string;
  group_ids: string[];
  scheduled_at?: string | null;
};

/** The browser needs the VAPID public key to subscribe. It is not a secret. */
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => ({
  key: process.env["VAPID_PUBLIC_KEY"] ?? "",
}));

async function assertSender(context: any) {
  const [{ data: admin }, { data: head }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "committee_head" }),
  ]);
  if (!admin && !head) throw new Error("Forbidden");
}

export const sendPushMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PushDraft) => d)
  .handler(async ({ data, context }) => {
    await assertSender(context);
    const body = {
      title_en: (data.title_en ?? "").slice(0, 120),
      body_en: (data.body_en ?? "").slice(0, 400),
      title_ar: (data.title_ar ?? "").slice(0, 120),
      body_ar: (data.body_ar ?? "").slice(0, 400),
      url: (data.url ?? "").slice(0, 400),
    };
    if (!body.title_en && !body.title_ar) throw new Error("Please write a title.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groupIds = (data.group_ids ?? []).filter(Boolean);

    if (data.scheduled_at) {
      const { error } = await (supabaseAdmin.from as any)("push_messages").insert({
        ...body,
        audience_group_ids: groupIds,
        scheduled_at: data.scheduled_at,
        status: "scheduled",
        source: "manual",
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
      return { scheduled: true, sent: 0, failed: 0, devices: 0 };
    }

    const { createAndSend } = await import("@/lib/push.server");
    const res = await createAndSend(body, groupIds, "manual", context.userId);
    return { scheduled: false, ...res };
  });

/** Send only to the caller's own devices, so a message can be checked first. */
export const sendPushTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PushDraft) => d)
  .handler(async ({ data, context }) => {
    await assertSender(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWebPush } = await import("@/lib/web-push.server");
    const { data: subs } = await (supabaseAdmin.from as any)("push_subscriptions")
      .select("endpoint,p256dh,auth,lang")
      .eq("user_id", context.userId)
      .eq("enabled", true);
    const list = (subs ?? []) as { endpoint: string; p256dh: string; auth: string; lang: string }[];
    if (!list.length) return { sent: 0, devices: 0 };
    let sent = 0;
    for (const s of list) {
      const ar = s.lang === "ar";
      const r = await sendWebPush(s, {
        title: (ar ? data.title_ar : data.title_en) || data.title_en || data.title_ar,
        body: (ar ? data.body_ar : data.body_en) || data.body_en || data.body_ar,
        url: data.url || "/",
        lang: ar ? "ar" : "en",
        dir: ar ? "rtl" : "ltr",
      });
      if (r.ok) sent++;
    }
    return { sent, devices: list.length };
  });

export const cancelScheduledPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSender(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from as any)("push_messages")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "scheduled");
    return { ok: true };
  });

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, boolean>) => d)
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("notification_settings").update(data).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type AutoKind = "on_event" | "on_committee_resource" | "on_new_course" | "on_urgent_announcement";

/**
 * Fired by admin pages after they publish something. It only sends when the
 * matching automatic toggle is on, so call sites never need to check first.
 */
export const autoNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: AutoKind; title_en: string; body_en: string; title_ar: string; body_ar: string; url?: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: admin }, { data: head }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "committee_head" }),
    ]);
    if (!admin && !head) return { sent: 0, skipped: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await (supabaseAdmin.from as any)("notification_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (!settings?.[data.kind]) return { sent: 0, skipped: true };

    const { createAndSend } = await import("@/lib/push.server");
    const res = await createAndSend(
      {
        title_en: (data.title_en ?? "").slice(0, 120),
        body_en: (data.body_en ?? "").slice(0, 400),
        title_ar: (data.title_ar ?? "").slice(0, 120),
        body_ar: (data.body_ar ?? "").slice(0, 400),
        url: (data.url ?? "").slice(0, 400),
      },
      [],
      data.kind,
      context.userId,
    );
    return { ...res, skipped: false };
  });
