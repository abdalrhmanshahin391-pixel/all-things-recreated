import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import {
  gatewayFetch,
  getPaddleTransaction,
  findPaddleCustomerByEmail,
  createPaddleCustomerPortalSession,
  createPaddleTransaction,
  type PaddleEnv,
} from "@/lib/paddle.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminCaller, requireSignedInCaller } from "@/lib/auth-guards.server";

let _adminSupabase: ReturnType<typeof createClient> | null = null;
function getAdminSupabase() {
  if (!_adminSupabase) {
    const url =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "https://jnquwavtngmqcjshxsmv.supabase.co";
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_AG466RguMgvqqLNtVFis2g_4DQl9pKU";
    _adminSupabase = createClient(url, key);
  }
  return _adminSupabase;
}

export interface SyncPaddlePriceInput {
  courseId?: string;
  title: string;
  price: number;
  currency?: string;
  environment?: PaddleEnv;
  /** When false, never save the price onto the course (used for one-off coupon prices). */
  persist?: boolean;
}

/**
 * Automatically creates a Product and Price in Paddle via API and saves the generated
 * paddle_price_id ("pri_...") directly onto the course.
 */
async function syncPaddleCoursePriceCore(data: SyncPaddlePriceInput) {
    const env: PaddleEnv = data.environment || "live";
    const title = (data.title || "Course").trim();
    const paddleProductName = title.startsWith("AquaQBank") ? title : `AquaQBank — ${title}`;
    const price = Number(data.price) || 0;
    if (price <= 0) {
      throw new Error("Cannot create Paddle price for free course (price must be > 0)");
    }
    const currency = (data.currency || "USD").toUpperCase();
    const amountInCents = Math.round(price * 100).toString();

    // 1. Search for existing active product in Paddle
    let productId: string | null = null;
    try {
      const prodRes = await gatewayFetch(env, `/products?status=active&per_page=100`);
      if (prodRes.ok) {
        const prodData: any = await prodRes.json();
        const found = (prodData.data ?? []).find((p: any) => {
          const matchCourseId = data.courseId && p.custom_data?.course_id === data.courseId;
          const pName = (p.name || "").trim().toLowerCase();
          const matchName =
            pName === title.toLowerCase() ||
            pName === paddleProductName.toLowerCase() ||
            pName === `aquaqbank: ${title.toLowerCase()}` ||
            pName === `aquaqbank - ${title.toLowerCase()}`;
          return matchCourseId || matchName;
        });
        if (found) {
          productId = found.id;
        }
      }
    } catch (e) {
      console.warn("Could not query existing Paddle products:", e);
    }

    // 2. If no product exists yet, create it in Paddle
    if (!productId) {
      const createProdRes = await gatewayFetch(env, `/products`, {
        method: "POST",
        body: JSON.stringify({
          name: paddleProductName,
          tax_category: "standard",
          description: `AquaQBank Course: ${title}`,
          custom_data: {
            course_id: data.courseId || "",
            platform: "aquaqbank",
          },
        }),
      });
      const createProdText = await createProdRes.text();
      if (!createProdRes.ok) {
        throw new Error(
          `Failed to create product in Paddle (${createProdRes.status}): ${createProdText.slice(0, 200)}`,
        );
      }
      const prodJson = JSON.parse(createProdText);
      productId = prodJson.data?.id;
      if (!productId) {
        throw new Error("Paddle did not return a product ID");
      }
    }

    // 2b. Check if an active price for this product already matches the amount & currency
    try {
      const pricesRes = await gatewayFetch(
        env,
        `/prices?product_id=${productId}&status=active&per_page=50`,
      );
      if (pricesRes.ok) {
        const pricesData: any = await pricesRes.json();
        const matchingPrice = (pricesData.data ?? []).find((pr: any) => {
          return (
            pr.unit_price?.amount === amountInCents &&
            pr.unit_price?.currency_code?.toUpperCase() === currency
          );
        });
        if (matchingPrice) {
          if (data.courseId && data.persist !== false) {
            const supabase = getAdminSupabase();
            await (supabase.from("courses") as any)
              .update({ paddle_price_id: matchingPrice.id })
              .eq("id", data.courseId);
          }
          return { ok: true, paddlePriceId: matchingPrice.id, productId };
        }
      }
    } catch (priceLookupErr) {
      console.warn("Could not query existing Paddle prices:", priceLookupErr);
    }

    // 3. Create price for this product in Paddle
    const createPriceRes = await gatewayFetch(env, `/prices`, {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        description: `${title} Access`,
        unit_price: {
          amount: amountInCents,
          currency_code: currency,
        },
        custom_data: {
          course_id: data.courseId || "",
          external_id: data.courseId || title,
        },
      }),
    });
    const createPriceText = await createPriceRes.text();
    if (!createPriceRes.ok) {
      throw new Error(
        `Failed to create price in Paddle (${createPriceRes.status}): ${createPriceText.slice(0, 200)}`,
      );
    }
    const priceJson = JSON.parse(createPriceText);
    const paddlePriceId = priceJson.data?.id as string;
    if (!paddlePriceId) {
      throw new Error("Paddle did not return a price ID");
    }

    // 4. Update the course in Supabase if courseId was supplied
    if (data.courseId && data.persist !== false) {
      try {
        const supabase = getAdminSupabase();
        await (supabase.from("courses") as any)
          .update({ paddle_price_id: paddlePriceId })
          .eq("id", data.courseId);
      } catch (dbErr) {
        console.warn("Could not auto-update course in DB with paddle_price_id:", dbErr);
      }
    }

    return { ok: true, paddlePriceId, productId };
}

export const syncPaddleCoursePrice = createServerFn({ method: "POST" })
  .inputValidator((data: SyncPaddlePriceInput) => data)
  .handler(async ({ data }) => {
    await requireAdminCaller();
    return syncPaddleCoursePriceCore(data);
  });

/**
 * Zero-click background reconciliation for all courses.
 * Scans every paid course and automatically generates authentic Paddle Products & Prices
 * if paddle_price_id is missing or contains invalid legacy test values (e.g. not starting with "pri_").
 */
export const autoReconcileCoursesToPaddle = createServerFn({ method: "POST" })
  .inputValidator((data?: { environment?: PaddleEnv; force?: boolean }) => data || {})
  .handler(async ({ data }) => {
    await requireAdminCaller();
    const env: PaddleEnv = data?.environment || "live";
    const supabase = getAdminSupabase();
    const { data: courses, error } = await (supabase.from("courses") as any)
      .select("id, title, price, currency, paddle_price_id")
      .gt("price", 0);

    if (error) {
      console.warn("[autoReconcileCoursesToPaddle] Error fetching courses:", error.message);
      return { ok: false, error: error.message, reconciled: 0 };
    }

    const list = courses || [];
    // Identify courses that need Paddle synchronization (missing or not starting with "pri_")
    const needSync = list.filter(
      (c: any) =>
        data?.force ||
        !c.paddle_price_id ||
        typeof c.paddle_price_id !== "string" ||
        !c.paddle_price_id.startsWith("pri_"),
    );

    if (needSync.length === 0) {
      return { ok: true, message: "All courses are already synced with Paddle", reconciled: 0, synced: 0, total: list.length };
    }

    const reconciled: Array<{ id: string; title: string; paddlePriceId?: string; error?: string }> = [];

    for (const c of needSync) {
      try {
        const syncRes = await syncPaddleCoursePriceCore({
            courseId: (c as any).id,
            title: (c as any).title,
            price: Number((c as any).price),
            currency: (c as any).currency || "USD",
            environment: env,
        });
        reconciled.push({ id: (c as any).id, title: (c as any).title, paddlePriceId: syncRes.paddlePriceId });
      } catch (err: any) {
        console.warn(`[autoReconcileCoursesToPaddle] Failed for course "${(c as any).title}":`, err?.message || err);
        reconciled.push({ id: (c as any).id, title: (c as any).title, error: err?.message || String(err) });
      }
    }

    const syncedCount = reconciled.filter((r) => r.paddlePriceId).length;
    return {
      ok: true,
      total: list.length,
      needsSyncCount: needSync.length,
      reconciled: syncedCount,
      synced: syncedCount,
      results: reconciled,
    };
  });

/**
 * Bulk synchronizes all paid courses in AquaQBank with Paddle.
 * Immediately provisions active Products & Prices in Paddle Dashboard
 * and saves generated paddle_price_id onto every course.
 */
export const syncAllCoursesToPaddle = createServerFn({ method: "POST" })
  .inputValidator((data?: { environment?: PaddleEnv; force?: boolean }) => data || {})
  .handler(async ({ data }) => {
    await requireAdminCaller();
    return autoReconcileCoursesToPaddle({ data: { ...data, force: true } });
  });

/**
 * Resolve a stored price reference into a real Paddle price id.
 * - "pri_..." values are used as-is.
 * - otherwise we look through the account's active prices and match on
 *   custom_data.external_id, the price name, or the product name.
 * - if still not found, automatically provisions the price in Paddle on the fly!
 */
export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    await requireSignedInCaller();
    const wanted = (data.priceId ?? "").trim();
    if (!wanted) throw new Error("Missing price id");
    if (wanted.startsWith("pri_")) return wanted;

    const response = await gatewayFetch(
      data.environment,
      `/prices?status=active&per_page=200&include=product`,
    );
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Payments lookup failed (${response.status}) for "${wanted}" in ${data.environment}: ${bodyText.slice(0, 200)}`,
      );
    }
    let result: {
      data?: Array<{
        id: string;
        name?: string | null;
        custom_data?: Record<string, unknown> | null;
        product?: { name?: string | null; custom_data?: Record<string, unknown> | null } | null;
      }>;
    } = {};
    try {
      result = JSON.parse(bodyText);
    } catch {
      throw new Error(`Invalid payments response for "${wanted}"`);
    }

    const key = wanted.toLowerCase();
    const match = (result.data ?? []).find((p) => {
      const ids = [
        p.custom_data?.["external_id"],
        p.custom_data?.["externalId"],
        p.product?.custom_data?.["external_id"],
        p.name,
        p.product?.name,
      ];
      return ids.some((v) => typeof v === "string" && v.trim().toLowerCase() === key);
    });

    if (!match) {
      // Auto-provision fallback: if the price was not found, check if wanted is a course ID, title, or stored legacy price ID
      try {
        const supabase = getAdminSupabase();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wanted);
        let courseRow: any = null;
        if (isUuid) {
          const { data } = await (supabase.from("courses") as any)
            .select("id, title, price, currency, paddle_price_id")
            .eq("id", wanted)
            .maybeSingle();
          courseRow = data;
        } else {
          const { data } = await (supabase.from("courses") as any)
            .select("id, title, price, currency, paddle_price_id")
            .or(`title.ilike.%${wanted}%,paddle_price_id.eq.${wanted}`)
            .maybeSingle();
          courseRow = data;
        }

        if (courseRow && Number(courseRow.price) > 0) {
          const syncRes = await syncPaddleCoursePrice({
            data: {
              courseId: courseRow.id,
              title: courseRow.title,
              price: Number(courseRow.price),
              currency: courseRow.currency || "USD",
              environment: data.environment,
            },
          });
          if (syncRes?.paddlePriceId) {
            return syncRes.paddlePriceId;
          }
        }
      } catch (autoErr) {
        console.warn("Auto-provisioning Paddle price fallback failed:", autoErr);
      }

      throw new Error(
        `Price "${wanted}" was not found in your ${data.environment} Paddle account. Add a price whose name or custom data external_id is "${wanted}".`,
      );
    }
    return match.id;
  });

export interface VerifyTransactionInput {
  transactionId: string;
  courseId?: string;
  packageId?: string;
  environment?: PaddleEnv;
}

/**
 * Instant server-side fulfillment and verification.
 * Directly queries Paddle API for transaction status and grants access in <1 second
 * without waiting on webhook delivery or polling timeouts.
 */
export const verifyAndFulfillTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VerifyTransactionInput) => data)
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as any;
    const env: PaddleEnv = data.environment || "live";
    const txnId = (data.transactionId || "").trim();
    if (!txnId) throw new Error("Missing transaction ID");

    // 1. Fetch transaction directly from Paddle API
    const txn = await getPaddleTransaction(env, txnId);
    if (!txn) throw new Error(`Transaction ${txnId} not found in Paddle`);

    const status = txn.status?.toLowerCase();
    if (status !== "completed" && status !== "paid") {
      return { ok: false, status, message: `Transaction status is ${status}` };
    }

    const customData = txn.custom_data || {};
    const effectiveUserId = customData.userId || customData.user_id || userId;
    const courseId = data.courseId || customData.courseId || customData.course_id;
    const packageId = data.packageId || customData.packageId || customData.package_id;
    const memberIds: string[] = Array.isArray(customData.memberIds) ? customData.memberIds : [];

    const adminDb = getAdminSupabase();

    // Resiliently resolve user email
    let userEmail = ((claims?.email as string) || "").toLowerCase();
    try {
      const { data: userData } = await adminDb.auth.admin.getUserById(userId);
      if (userData?.user?.email) {
        userEmail = userData.user.email.toLowerCase();
      }
    } catch (e) {
      console.warn("[verify] getUserById fallback:", e);
    }

    // Security check: ensure transaction customer or customData corresponds to current user
    const txnCustomerEmail = (txn.customer?.email || "").toLowerCase();
    const isOwner = effectiveUserId === userId || (txnCustomerEmail && txnCustomerEmail === userEmail);
    if (!isOwner) {
      throw new Error("Transaction does not belong to the current authenticated user");
    }

    // Cache customer ID into user_metadata for future 1-click / saved card checkout
    const customerId = txn.customer_id || txn.customer?.id;
    if (customerId) {
      try {
        await adminDb.auth.admin.updateUserById(userId, {
          user_metadata: { paddle_customer_id: customerId },
        });
      } catch (e) {
        console.warn("[verify] could not store customerId in user_metadata:", e);
      }
    }

    const amount_cents = txn.details?.totals?.grand_total
      ? Number(txn.details.totals.grand_total)
      : null;
    const currency = txn.currency_code?.toLowerCase() ?? null;

    // A. Package Fulfillment
    if (packageId) {
      await (adminDb.from("package_purchases") as any).upsert(
        {
          package_id: packageId,
          buyer_id: userId,
          member_user_ids: memberIds,
          paddle_transaction_id: txn.id,
          environment: env,
          amount_cents,
          currency,
        },
        { onConflict: "paddle_transaction_id", ignoreDuplicates: true },
      );

      const { data: links } = await (adminDb.from("package_courses") as any)
        .select("course_id")
        .eq("package_id", packageId);

      const linked = ((links ?? []) as any[]).map((l) => l.course_id as string);
      const picked: string[] = Array.isArray((customData as any).selectedCourseIds)
        ? (customData as any).selectedCourseIds.filter(Boolean)
        : [];
      // "Pick any N" packages: only grant the courses the student chose (and only ones in the package).
      const courseIds = picked.length > 0 ? linked.filter((id) => picked.includes(id)) : linked;
      const { data: meta } = courseIds.length
        ? await (adminDb.from("courses") as any).select("id, kind").in("id", courseIds)
        : { data: [] };
      const kind = new Map<string, string>(((meta ?? []) as any[]).map((c) => [c.id, c.kind || "questions"]));
      const grantees = Array.from(new Set([userId, ...memberIds.filter(Boolean)]));
      const qRows: Array<{ user_id: string; course_id: string }> = [];
      const lRows: Array<{ user_id: string; course_id: string }> = [];
      for (const uid of grantees) {
        for (const cid of courseIds) {
          (kind.get(cid) === "lectures" ? lRows : qRows).push({ user_id: uid, course_id: cid });
        }
      }
      if (qRows.length > 0) {
        await (adminDb.from("user_courses") as any).upsert(qRows, {
          onConflict: "user_id,course_id",
          ignoreDuplicates: true,
        });
      }
      if (lRows.length > 0) {
        await (adminDb.from("user_lecture_courses") as any).upsert(lRows, {
          onConflict: "user_id,course_id",
          ignoreDuplicates: true,
        });
      }

      return { ok: true, granted: true, type: "package", packageId };
    }

    // B. Course Fulfillment
    if (courseId) {
      // Record payment event
      await (adminDb.from("payment_events") as any).upsert(
        {
          paddle_transaction_id: txn.id,
          user_id: userId,
          course_id: courseId,
          amount_cents,
          currency,
          environment: env,
          status: txn.status,
          raw: txn,
        },
        { onConflict: "paddle_transaction_id", ignoreDuplicates: true },
      );

      // Check course kind (lectures vs questions)
      const { data: courseRow } = await (adminDb.from("courses") as any)
        .select("kind")
        .eq("id", courseId)
        .maybeSingle();

      const kind = (courseRow as any)?.kind ?? "questions";
      const accessTable = kind === "lectures" ? "user_lecture_courses" : "user_courses";

      await (adminDb.from(accessTable) as any).upsert(
        { user_id: userId, course_id: courseId },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );

      return { ok: true, granted: true, type: "course", courseId, kind };
    }

    return { ok: true, granted: false, message: "No course or package specified in transaction" };
  });

/**
 * Generates an authenticated Customer Portal link allowing the student to
 * manage saved cards, remove payment methods, and download invoices.
 */
export const getCustomerPortalUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { returnUrl?: string; environment?: PaddleEnv }) => data || {})
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as any;
    const env: PaddleEnv = data?.environment || "live";
    const adminDb = getAdminSupabase();

    let authUser: any = null;
    try {
      const { data: userData } = await adminDb.auth.admin.getUserById(userId);
      authUser = userData?.user;
    } catch (e) {
      console.warn("[getCustomerPortalUrl] getUserById fallback:", e);
    }

    // 1. Check user_metadata
    let customerId: string | null = (authUser?.user_metadata as any)?.paddle_customer_id || null;

    // 2. Check payment_events
    if (!customerId) {
      const { data: events } = await (adminDb.from("payment_events") as any)
        .select("raw")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

      for (const ev of events || []) {
        const ctm = ev.raw?.customer_id || ev.raw?.data?.customer_id || ev.raw?.data?.customerId;
        if (ctm) {
          customerId = ctm;
          break;
        }
      }
    }

    // 3. Check direct Paddle customer lookup by email
    const emailToLookup = authUser?.email || claims?.email;
    if (!customerId && emailToLookup) {
      customerId = await findPaddleCustomerByEmail(env, emailToLookup);
    }

    if (!customerId) {
      throw new Error(
        "No saved payment profile found yet. A billing profile is automatically created once you make your first purchase.",
      );
    }

    const returnUrl = data?.returnUrl || "https://aquaqbank.com/profile";
    const portalUrl = await createPaddleCustomerPortalSession(env, customerId, returnUrl);
    return { ok: true, portalUrl };
  });

/**
 * Resolves or dynamically syncs a Paddle price for checkout.
 * If a coupon reduces the price, this ensures Paddle charges the exact discounted amount.
 */
type ResolveCheckoutInput = {
  courseId: string;
  title: string;
  finalPrice: number;
  originalPrice: number;
  couponCode?: string;
  currency?: string;
  environment?: PaddleEnv;
};

async function resolveCheckoutPriceCore(data: ResolveCheckoutInput) {
    const env: PaddleEnv = data.environment || "live";
    const finalPrice = Number(data.finalPrice);
    const originalPrice = Number(data.originalPrice);

    // If no discount is active, use the course's stored paddle_price_id IF valid (starts with "pri_")
    if (!data.couponCode || Math.abs(finalPrice - originalPrice) < 0.01) {
      const adminDb = getAdminSupabase();
      const { data: c } = await (adminDb.from("courses") as any)
        .select("paddle_price_id")
        .eq("id", data.courseId)
        .maybeSingle();
      if (
        c?.paddle_price_id &&
        typeof c.paddle_price_id === "string" &&
        c.paddle_price_id.startsWith("pri_")
      ) {
        // Make sure the saved price still charges the listed amount (repairs old coupon overwrites).
        let matches = true;
        try {
          const pr = await gatewayFetch(env, `/prices/${c.paddle_price_id}`);
          if (pr.ok) {
            const pj: any = await pr.json();
            const amt = Number(pj?.data?.unit_price?.amount);
            if (Number.isFinite(amt) && amt !== Math.round(originalPrice * 100)) matches = false;
          }
        } catch {
          /* keep stored price if lookup fails */
        }
        if (matches) return { paddlePriceId: c.paddle_price_id };
      }
    }
    const isCoupon = !!data.couponCode && Math.abs(finalPrice - originalPrice) >= 0.01;

    // If discounted, sync a price matching the discounted amount
    const discountedTitle = data.couponCode
      ? `${data.title} (${data.couponCode} Discount)`
      : data.title;

    const syncRes = await syncPaddleCoursePriceCore({
      courseId: data.courseId,
      title: discountedTitle,
      price: finalPrice,
      currency: data.currency || "USD",
      environment: env,
      persist: !isCoupon,
    });

    return { paddlePriceId: syncRes.paddlePriceId };
}

/** Admin-only: the amounts are supplied by the caller, so students go through createCheckoutTransaction instead. */
export const resolvePaddleCheckoutPrice = createServerFn({ method: "POST" })
  .inputValidator((data: ResolveCheckoutInput) => data)
  .handler(async ({ data }) => {
    await requireAdminCaller();
    return resolveCheckoutPriceCore(data);
  });

export const syncPaddlePackagePrice = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      packageId?: string;
      name: string;
      price: number;
      currency?: string;
      environment?: PaddleEnv;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdminCaller();
    const env: PaddleEnv = data.environment || "live";
    const title = data.name.trim();
    const paddleProductName = title.startsWith("AquaQBank")
      ? title
      : `AquaQBank — ${title} (Package)`;
    const price = Number(data.price) || 0;
    if (price <= 0) throw new Error("Price must be > 0");
    const currency = (data.currency || "USD").toUpperCase();
    const amountInCents = Math.round(price * 100).toString();

    // 1. Search existing product
    let productId: string | null = null;
    try {
      const prodRes = await gatewayFetch(env, `/products?status=active&per_page=100`);
      if (prodRes.ok) {
        const prodData: any = await prodRes.json();
        const found = (prodData.data ?? []).find((p: any) => {
          const matchPkgId = data.packageId && p.custom_data?.package_id === data.packageId;
          const pName = (p.name || "").trim().toLowerCase();
          return (
            matchPkgId ||
            pName === title.toLowerCase() ||
            pName === paddleProductName.toLowerCase()
          );
        });
        if (found) productId = found.id;
      }
    } catch (e) {
      console.warn("Could not query existing Paddle products for package:", e);
    }

    if (!productId) {
      const createProdRes = await gatewayFetch(env, `/products`, {
        method: "POST",
        body: JSON.stringify({
          name: paddleProductName,
          tax_category: "standard",
          description: `AquaQBank Package: ${title}`,
          custom_data: { package_id: data.packageId || "", platform: "aquaqbank" },
        }),
      });
      const prodJson: any = await createProdRes.json();
      productId = prodJson?.data?.id;
    }

    if (!productId) throw new Error("Could not create Paddle product for package");

    // 2. Create price
    const createPriceRes = await gatewayFetch(env, `/prices`, {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        description: `${title} Access`,
        unit_price: { amount: amountInCents, currency_code: currency },
        custom_data: { package_id: data.packageId || "", external_id: data.packageId || title },
      }),
    });
    const priceJson: any = await createPriceRes.json();
    const paddlePriceId = priceJson?.data?.id;

    if (data.packageId && paddlePriceId) {
      const supabase = getAdminSupabase();
      await (supabase.from("packages") as any)
        .update({ paddle_price_id: paddlePriceId })
        .eq("id", data.packageId);
    }
    return { ok: true, paddlePriceId, productId };
  });

export interface CreateCheckoutInput {
  courseId: string;
  priceId?: string;
  finalPrice?: number;
  originalPrice?: number;
  couponCode?: string;
  currency?: string;
  environment?: PaddleEnv;
  returnUrl?: string;
  customerEmail?: string;
  customerName?: string;
}

/**
 * Pre-creates a verified Paddle transaction on the server side.
 * Directly communicates with Paddle API to guarantee accurate pricing,
 * valid items, and explicit redirect URLs, bypassing client-side iframe failures.
 */
export const createCheckoutTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateCheckoutInput) => data)
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as any;
    const env: PaddleEnv = data.environment || "live";
    const adminDb = getAdminSupabase();

    // Resiliently resolve customer email and name from claims, auth admin, or payload
    let userEmail: string | undefined = (claims?.email as string) || undefined;
    let userName: string | undefined = undefined;

    try {
      const { data: userData } = await adminDb.auth.admin.getUserById(userId);
      if (userData?.user) {
        userEmail = userData.user.email || userEmail;
        userName =
          (userData.user.user_metadata as any)?.full_name ||
          (userData.user.user_metadata as any)?.name ||
          undefined;
      }
    } catch (e) {
      console.warn("[createCheckoutTransaction] getUserById fallback to claims:", e);
    }

    if (!userEmail && data.customerEmail) {
      userEmail = data.customerEmail;
    }
    if (!userName && data.customerName) {
      userName = data.customerName;
    }

    // 1. Fetch course details
    const { data: course, error: cErr } = await (adminDb.from("courses") as any)
      .select("*")
      .eq("id", data.courseId)
      .maybeSingle();

    if (cErr || !course) {
      throw new Error("Course not found");
    }
    if (course.coming_soon) throw new Error("This course is coming soon.");

    // 2. Resolve genuine Paddle Price ID (must start with pri_)
    // The amount always comes from the database (and a coupon checked on the server), never from the browser.
    const originalPrice = Number(course.price);
    let finalPrice = originalPrice;
    let couponCode: string | undefined;
    if (data.couponCode) {
      const { data: v } = await (context as any).supabase.rpc("validate_coupon", {
        _code: String(data.couponCode).trim(),
        _course_id: course.id,
      });
      if (v?.valid && Number.isFinite(Number(v.price_after))) {
        finalPrice = Number(v.price_after);
        couponCode = v.code || String(data.couponCode).trim();
      }
    }
    if (!(originalPrice > 0)) throw new Error("This course is free.");

    // A price id from the browser is only used when it is this course's own full-price id.
    let paddlePriceId: string | undefined =
      !couponCode && data.priceId && data.priceId === course.paddle_price_id ? data.priceId : undefined;
    if (!paddlePriceId) {
      const resolved = await resolveCheckoutPriceCore({
        courseId: course.id,
        title: course.title,
        finalPrice,
        originalPrice,
        couponCode,
        currency: course.currency || "USD",
        environment: env,
      });
      paddlePriceId = resolved.paddlePriceId;
    }

    if (!paddlePriceId || !paddlePriceId.startsWith("pri_")) {
      throw new Error("Failed to prepare a valid payment price for this course.");
    }

    const checkoutSuccessUrl =
      data.returnUrl ||
      `https://aquaqbank.com/checkout/success?courseId=${course.id}`;

    // 3. Pre-create transaction in Paddle API
    const txn = await createPaddleTransaction({
      env,
      items: [{ priceId: paddlePriceId, quantity: 1 }],
      customer: {
        email: userEmail || undefined,
        name: userName || undefined,
      },
      customData: {
        userId,
        courseId: course.id,
        ...(couponCode ? { couponCode } : {}),
      },
      checkoutSuccessUrl,
    });

    return {
      ok: true,
      transactionId: txn.id,
      checkoutUrl: txn.url,
      paddlePriceId,
    };
  });


