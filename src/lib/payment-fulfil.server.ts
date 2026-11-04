/**
 * Shared helpers for turning a paid Paddle transaction into access, used by the webhook, the buyer's own verify call and the
 * admin "Check payments" tool. They accept both shapes of a transaction: REST (snake_case) and webhook/SDK (camelCase).
 */
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";
import { paidPriceIds } from "@/lib/payment-grant.server";

export type TxnInfo = {
  transactionId: string;
  status: string;
  customerId: string | null;
  userId: string | null;
  courseId: string | null;
  packageId: string | null;
  billedAt: string | null;
  amountCents: number | null;
  currency: string | null;
  priceIds: string[];
  /** Why a user or a course could not be named, when that is the case. */
  note: string;
};

/** The Supabase client used for fulfilment. It must be the service-role client: with any other key a write is silently refused. */
export async function fulfilmentDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function customerEmail(env: PaddleEnv, customerId: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await gatewayFetch(env, `/customers/${customerId}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    const email = String(json?.data?.email ?? "").trim().toLowerCase();
    return email ? { email, name: String(json?.data?.name ?? "") } : null;
  } catch {
    return null;
  }
}

/** The signed-up user with this email (the sign-up emails are unique), found by paging through the user list. */
export async function findUserIdByEmail(db: any, email: string): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users: any[] = data?.users ?? [];
    const hit = users.find((u) => String(u.email ?? "").toLowerCase() === wanted);
    if (hit) return hit.id as string;
    if (users.length < 1000) break;
  }
  return null;
}

/**
 * Who paid for what. The custom data of our own checkout names both; when it is missing (a payment that did not come through our
 * checkout page) the buyer is found by the email Paddle holds, and the course by the price that was paid.
 */
export async function describeTransaction(db: any, txn: any, env: PaddleEnv): Promise<TxnInfo & { email: string; courseTitle: string }> {
  const cd = txn?.customData ?? txn?.custom_data ?? {};
  const customerId: string | null = txn?.customerId ?? txn?.customer_id ?? txn?.customer?.id ?? null;
  const priceIds = paidPriceIds(txn);
  const totals = txn?.details?.totals ?? {};
  const grand = totals.grandTotal ?? totals.grand_total;
  const notes: string[] = [];

  let email = String(txn?.customer?.email ?? "").trim().toLowerCase();
  if (!email && customerId) email = (await customerEmail(env, customerId))?.email ?? "";

  let userId: string | null = cd.userId || cd.user_id || null;
  if (userId) {
    const { data: u } = await db.auth.admin.getUserById(userId);
    if (!u?.user) {
      notes.push("the user named in the payment no longer exists");
      userId = null;
    }
  }
  if (!userId && email) {
    userId = await findUserIdByEmail(db, email);
    if (!userId) notes.push(`no account with the email ${email}`);
  }
  if (!userId && !email) notes.push("no user and no email in the payment");

  let courseId: string | null = cd.courseId || cd.course_id || null;
  const packageId: string | null = cd.packageId || cd.package_id || null;
  if (!courseId && !packageId && priceIds.length) {
    const { data: byPrice } = await db.from("courses").select("id").in("paddle_price_id", priceIds).limit(2);
    if ((byPrice ?? []).length === 1) courseId = byPrice[0].id;
    else notes.push((byPrice ?? []).length ? "the price matches more than one course" : "the price matches no course");
  }

  let courseTitle = "";
  if (courseId) {
    const { data: c } = await db.from("courses").select("title").eq("id", courseId).maybeSingle();
    courseTitle = c?.title ?? "";
  }

  return {
    transactionId: String(txn?.id ?? ""),
    status: String(txn?.status ?? ""),
    customerId,
    userId,
    courseId,
    packageId,
    billedAt: txn?.billedAt ?? txn?.billed_at ?? txn?.createdAt ?? txn?.created_at ?? null,
    amountCents: grand != null && Number.isFinite(Number(grand)) ? Number(grand) : null,
    currency: String(txn?.currencyCode ?? txn?.currency_code ?? "").toLowerCase() || null,
    priceIds,
    note: notes.join("; "),
    email,
    courseTitle,
  };
}

/** Whether the person already has the course (questions or lectures). */
export async function hasCourseAccess(db: any, userId: string, courseId: string): Promise<boolean> {
  const { data: c } = await db.from("courses").select("kind").eq("id", courseId).maybeSingle();
  const table = (c?.kind ?? "questions") === "lectures" ? "user_lecture_courses" : "user_courses";
  const { data } = await db.from(table).select("user_id").eq("user_id", userId).eq("course_id", courseId).limit(1);
  return (data ?? []).length > 0;
}

/** Gives the access and checks it is really there afterwards. Throws when it is not, so a payment is never reported as fulfilled when nothing was saved. */
export async function grantCourseAccess(db: any, userId: string, courseId: string): Promise<{ kind: string }> {
  const { data: c } = await db.from("courses").select("kind").eq("id", courseId).maybeSingle();
  const kind = c?.kind ?? "questions";
  const table = kind === "lectures" ? "user_lecture_courses" : "user_courses";
  const { error } = await db.from(table).upsert({ user_id: userId, course_id: courseId }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not save the access (${error.message})`);
  if (!(await hasCourseAccess(db, userId, courseId))) throw new Error("The access was not saved");
  return { kind };
}

/** Keeps a record of the payment, without ever failing the fulfilment when the record cannot be written. */
export async function recordPayment(db: any, row: Record<string, unknown> & { paddle_transaction_id: string }) {
  try {
    const { data: found } = await db.from("payment_events").select("id").eq("paddle_transaction_id", row.paddle_transaction_id).limit(1);
    if ((found ?? []).length) {
      await db.from("payment_events").update({ status: row.status, raw: row.raw }).eq("paddle_transaction_id", row.paddle_transaction_id);
    } else {
      await db.from("payment_events").insert(row);
    }
  } catch (e) {
    console.warn("[payments] could not record the payment:", e);
  }
}
