import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush } from "@/lib/web-push.server";

/**
 * Sends a phone notification for live classes starting within the next 30 minutes.
 * Called by a scheduler; protected with a shared secret header.
 */
export const Route = createFileRoute("/api/public/lecture-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const soon = new Date(now + 30 * 60_000).toISOString();

        const { data: classes, error } = await (supabaseAdmin.from as any)("lecture_classes")
          .select("id,course_id,title,starts_at,meeting_url")
          .is("notified_at", null)
          .gte("starts_at", new Date(now).toISOString())
          .lte("starts_at", soon);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let sent = 0;
        for (const cls of (classes ?? []) as any[]) {
          const { data: students } = await (supabaseAdmin.from as any)("user_lecture_courses")
            .select("user_id")
            .eq("course_id", cls.course_id);
          const ids = ((students ?? []) as { user_id: string }[]).map((s) => s.user_id);
          if (ids.length) {
            const { data: subs } = await (supabaseAdmin.from as any)("push_subscriptions")
              .select("endpoint,p256dh,auth,lang")
              .in("user_id", ids);
            for (const s of ((subs ?? []) as any[])) {
              const ar = s.lang === "ar";
              const res = await sendWebPush(
                { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
                {
                  title: ar ? "محاضرة مباشرة قريباً" : "Live class starting soon",
                  body: ar ? `${cls.title} — تبدأ خلال 30 دقيقة` : `${cls.title} — starts in 30 minutes`,
                  url: `/lectures/${cls.course_id}`,
                  lang: ar ? "ar" : "en",
                  dir: ar ? "rtl" : "ltr",
                },
              );
              if (res.ok) sent++;
            }
          }
          await (supabaseAdmin.from as any)("lecture_classes")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", cls.id);
        }

        return Response.json({ classes: (classes ?? []).length, sent });
      },
    },
  },
});
