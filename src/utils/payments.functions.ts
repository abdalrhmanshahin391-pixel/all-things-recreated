import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

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
}

/**
 * Automatically creates a Product and Price in Paddle via API and saves the generated
 * paddle_price_id ("pri_...") directly onto the course.
 */
export const syncPaddleCoursePrice = createServerFn({ method: "POST" })
  .inputValidator((data: SyncPaddlePriceInput) => data)
  .handler(async ({ data }) => {
    const env: PaddleEnv = data.environment || "live";
    const title = (data.title || "Course").trim();
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
          const matchName = p.name && p.name.trim().toLowerCase() === title.toLowerCase();
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
          name: title,
          tax_category: "standard",
          description: `AquaQBank Course: ${title}`,
          custom_data: {
            course_id: data.courseId || "",
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
    if (data.courseId) {
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
      // Auto-provision fallback: if the price was not found, check if wanted is a course ID or title in DB
      try {
        const supabase = getAdminSupabase();
        const { data: courseRow } = await (supabase.from("courses") as any)
          .select("id, title, price, currency")
          .or(`id.eq.${wanted},title.ilike.${wanted}`)
          .maybeSingle();

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
