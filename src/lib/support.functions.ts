import { createServerFn } from "@tanstack/react-start";

export type SupportSubmitInput = {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
};

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Saves a support request and sends a phone/desktop notification to every admin who enabled notifications.
 * Works for signed-out visitors too; a signed-in sender is attached to the ticket from the verified token.
 */
export const submitSupportRequestServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: SupportSubmitInput) => {
    const out = {
      name: clip(d?.name, 120),
      email: clip(d?.email, 200),
      category: clip(d?.category, 60) || "other",
      subject: clip(d?.subject, 200),
      message: clip(d?.message, 4000),
    };
    if (!out.name) throw new Error("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error("Please enter a valid email address.");
    if (!out.subject) throw new Error("Please add a short subject.");
    if (out.message.length < 10) throw new Error("Please describe the problem in at least 10 characters.");
    return out;
  })
  .handler(async ({ data }) => {
    const { getCaller } = await import("@/lib/auth-guards.server");
    const { userId, supabaseAdmin } = await getCaller();
    const db = supabaseAdmin as any;

    // At most 3 requests per address (or account) in 10 minutes.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const recentQuery = db.from("support_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
    const { count } = await (userId ? recentQuery.eq("user_id", userId) : recentQuery.eq("email", data.email));
    if ((count ?? 0) >= 3) throw new Error("Too many requests. Please wait a few minutes and try again.");

    const { data: row, error } = await db
      .from("support_requests")
      .insert({ user_id: userId, ...data })
      .select("ticket_no")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const ticketNo = (row?.ticket_no as number | undefined) ?? null;

    // Tell the admins. A failure here must never lose the student's request.
    try {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = ((admins ?? []) as { user_id: string }[]).map((a) => a.user_id);
      if (adminIds.length) {
        const { data: subs } = await db
          .from("push_subscriptions")
          .select("endpoint,p256dh,auth,lang")
          .in("user_id", adminIds);
        const { sendWebPush } = await import("@/lib/web-push.server");
        const title = `New support request${ticketNo ? ` #${ticketNo}` : ""}`;
        const body = `${data.name} · ${data.category}: ${data.subject}`.slice(0, 160);
        const dead: string[] = [];
        await Promise.all(
          ((subs ?? []) as any[]).map(async (s) => {
            const res = await sendWebPush(
              { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
              { title, body, url: "/admin/support", lang: "en", dir: "ltr" },
            );
            if (res.gone) dead.push(s.endpoint);
          }),
        );
        if (dead.length) await db.from("push_subscriptions").delete().in("endpoint", dead);
      }
    } catch (err) {
      console.warn("[support] could not notify admins:", err);
    }

    return { ticketNo };
  });
