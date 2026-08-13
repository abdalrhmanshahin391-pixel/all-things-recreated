import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function handleTransactionCompleted(event: any, env: PaddleEnv) {
  const data = event.data;
  const customData = data.customData || {};
  const userId: string | undefined = customData.userId;
  const courseId: string | undefined = customData.courseId;
  const packageId: string | undefined = customData.packageId;
  const memberIds: string[] = Array.isArray(customData.memberIds) ? customData.memberIds : [];

  if (!userId) {
    console.warn("transaction.completed missing userId", { txn: data.id, customData });
    return;
  }

  const supabase = getSupabase();
  const amount_cents = data.details?.totals?.grandTotal
    ? Number(data.details.totals.grandTotal)
    : null;
  const currency = data.currencyCode?.toLowerCase() ?? null;

  // ---- PACKAGE PURCHASE ----
  if (packageId) {
    // Idempotent record of the package purchase
    await (supabase.from("package_purchases") as any).upsert(
      {
        package_id: packageId,
        buyer_id: userId,
        member_user_ids: memberIds,
        paddle_event_id: event.eventId,
        paddle_transaction_id: data.id,
        environment: env,
        amount_cents,
        currency,
      },
      { onConflict: "paddle_event_id" },
    );

    // Fetch courses included in this package
    const { data: links, error: linkErr } = await (supabase.from("package_courses") as any)
      .select("course_id")
      .eq("package_id", packageId);
    if (linkErr) {
      console.error("Failed to load package_courses", linkErr);
      throw linkErr;
    }
    const courseIds = ((links ?? []) as any[]).map((l) => l.course_id);
    if (courseIds.length === 0) {
      console.warn("Package has no courses; nothing to grant", { packageId });
      return;
    }

    const grantees = Array.from(new Set([userId, ...memberIds.filter(Boolean)]));
    const rows: Array<{ user_id: string; course_id: string }> = [];
    for (const uid of grantees) {
      for (const cid of courseIds) {
        rows.push({ user_id: uid, course_id: cid });
      }
    }
    if (rows.length > 0) {
      const { error } = await (supabase.from("user_courses") as any).upsert(rows, {
        onConflict: "user_id,course_id",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("Failed to grant package course access", error);
        throw error;
      }
    }
    return;
  }

  // ---- SINGLE-COURSE PURCHASE ----
  if (!courseId) {
    console.warn("transaction.completed missing courseId/packageId", {
      txn: data.id,
      customData,
    });
    return;
  }

  await (supabase.from("payment_events") as any).upsert(
    {
      paddle_event_id: event.eventId,
      paddle_transaction_id: data.id,
      user_id: userId,
      course_id: courseId,
      amount_cents,
      currency,
      environment: env,
      status: data.status,
      raw: event,
    },
    { onConflict: "paddle_event_id" },
  );

  // Decide which access table to write to based on course kind.
  const { data: courseRow } = await (supabase.from("courses") as any)
    .select("kind")
    .eq("id", courseId)
    .maybeSingle();
  const kind = (courseRow as any)?.kind ?? "questions";
  const accessTable = kind === "lectures" ? "user_lecture_courses" : "user_courses";

  const { error } = await (supabase.from(accessTable) as any).upsert(
    { user_id: userId, course_id: courseId },
    { onConflict: "user_id,course_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("Failed to grant course access", error);
    throw error;
  }
}


async function handleAdjustment(event: any, env: PaddleEnv) {
  const data = event.data;
  const action: string = data.action ?? "";
  if (!["refund", "chargeback", "chargeback_warning"].includes(action)) return;
  if (action === "chargeback_warning") return;

  const supabase = getSupabase();
  const transactionId: string | undefined = data.transactionId;
  if (!transactionId) return;

  const { data: pay } = await (supabase.from("payment_events") as any)
    .select("user_id,course_id")
    .eq("paddle_transaction_id", transactionId)
    .maybeSingle();
  if (!pay?.user_id || !pay?.course_id) {
    console.warn("Adjustment with no matching payment", { transactionId, action });
    return;
  }

  const { data: courseRow } = await (supabase.from("courses") as any)
    .select("kind")
    .eq("id", pay.course_id)
    .maybeSingle();
  const accessTable =
    (courseRow as any)?.kind === "lectures" ? "user_lecture_courses" : "user_courses";

  await (supabase.from(accessTable) as any)
    .delete()
    .eq("user_id", pay.user_id)
    .eq("course_id", pay.course_id);

  await (supabase.from("payment_events") as any)
    .update({ status: action === "refund" ? "refunded" : "charged_back" })
    .eq("paddle_transaction_id", transactionId);

  console.log("Revoked access after", action, { transactionId });
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.eventType) {
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event, env);
      break;
    case EventName.AdjustmentCreated:
      await handleAdjustment(event, env);
      break;
    default:
      console.log("Unhandled payment event:", event.eventType);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
