import { createFileRoute } from "@tanstack/react-router";

/**
 * Drains scheduled notifications. Called on a schedule with the project's
 * publishable key in the `apikey` header.
 */
export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || key !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deliverMessage } = await import("@/lib/push.server");
        const { data } = await (supabaseAdmin.from as any)("push_messages")
          .select("*")
          .eq("status", "scheduled")
          .lte("scheduled_at", new Date().toISOString())
          .limit(5);

        let handled = 0;
        for (const m of (data ?? []) as any[]) {
          await (supabaseAdmin.from as any)("push_messages").update({ status: "sending" }).eq("id", m.id);
          await deliverMessage(m.id, m, m.audience_group_ids ?? []);
          await (supabaseAdmin.rpc as any)("unschedule_push_job", { _id: m.id });
          handled++;
        }
        return Response.json({ handled });
      },
    },
  },
});
