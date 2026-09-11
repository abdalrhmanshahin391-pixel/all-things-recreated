import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

/**
 * Resolve a stored price reference into a real Paddle price id.
 * - "pri_..." values are used as-is.
 * - otherwise we look through the account's active prices and match on
 *   custom_data.external_id, the price name, or the product name.
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
      throw new Error(
        `Price "${wanted}" was not found in your ${data.environment} Paddle account. Add a price whose name or custom data external_id is "${wanted}".`,
      );
    }
    return match.id;
  });
