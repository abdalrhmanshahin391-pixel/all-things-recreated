/**
 * What a paid Paddle transaction is allowed to unlock.
 *
 * A checkout opened in the browser (Paddle.js) lets the buyer choose the custom data, so the course or package named
 * there is a claim, not a fact. Before access is granted, the price that was actually paid has to belong to what is
 * being unlocked. Course checkouts made by our own server (origin "api") carry custom data the buyer cannot change.
 */

export type PaddleEnvName = "sandbox" | "live";

/** Real access is only given for live payments. PAYMENTS_ALLOW_SANDBOX=true turns sandbox payments on for testing. */
export function allowedPaddleEnv(requested?: string | null): PaddleEnvName {
  return requested === "sandbox" && process.env["PAYMENTS_ALLOW_SANDBOX"] === "true" ? "sandbox" : "live";
}

export function sandboxAllowed(): boolean {
  return process.env["PAYMENTS_ALLOW_SANDBOX"] === "true";
}

/** Price ids on a transaction, from the REST shape (snake_case) or the SDK/webhook shape (camelCase). */
export function paidPriceIds(txn: any): string[] {
  const items: any[] = Array.isArray(txn?.items) ? txn.items : [];
  const ids = items
    .map((i) => i?.price?.id ?? i?.priceId ?? i?.price_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return Array.from(new Set(ids));
}

export type GrantCheck =
  | { ok: true; memberIds: string[]; pickedCourseIds: string[] }
  | { ok: false; reason: string };

/**
 * Checks a purchase against our own records. `buyerId` is the signed-in user (verify) or the buyer named in the
 * transaction (webhook). `claim` is what the custom data says.
 */
export async function checkGrant(
  db: any,
  txn: any,
  claim: { courseId?: string | null; packageId?: string | null; memberIds?: unknown; pickedCourseIds?: unknown },
  buyerId: string,
): Promise<GrantCheck> {
  const prices = paidPriceIds(txn);
  const origin = String(txn?.origin ?? "").toLowerCase();
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))) : [];

  if (claim.packageId) {
    const { data: pkg } = await db
      .from("packages")
      .select("id, paddle_price_id, package_type, group_size, selection_mode, choice_count")
      .eq("id", claim.packageId)
      .maybeSingle();
    if (!pkg) return { ok: false, reason: "Package not found" };
    if (!pkg.paddle_price_id || !prices.includes(pkg.paddle_price_id)) {
      return { ok: false, reason: "The price paid does not belong to this package" };
    }

    const memberIds = strings(claim.memberIds).filter((m) => m !== buyerId);
    if (pkg.package_type === "group") {
      if (memberIds.length !== Number(pkg.group_size) - 1) return { ok: false, reason: "Wrong number of group members" };
    } else if (memberIds.length > 0) {
      return { ok: false, reason: "This package cannot include extra members" };
    }

    let picked = strings(claim.pickedCourseIds);
    if (pkg.selection_mode === "student_choice") {
      if (picked.length !== Number(pkg.choice_count || 3)) return { ok: false, reason: "Wrong number of chosen courses" };
    } else {
      picked = [];
    }
    return { ok: true, memberIds, pickedCourseIds: picked };
  }

  if (claim.courseId) {
    const { data: course } = await db.from("courses").select("id, paddle_price_id").eq("id", claim.courseId).maybeSingle();
    if (!course) return { ok: false, reason: "Course not found" };
    const madeByServer = origin === "api";
    const paidFullPrice = !!course.paddle_price_id && prices.includes(course.paddle_price_id);
    if (!madeByServer && !paidFullPrice) return { ok: false, reason: "The price paid does not belong to this course" };
    return { ok: true, memberIds: [], pickedCourseIds: [] };
  }

  return { ok: false, reason: "No course or package in the transaction" };
}
