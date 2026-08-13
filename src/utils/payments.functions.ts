import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Payments lookup failed (${response.status}) for "${data.priceId}" in ${data.environment}: ${bodyText.slice(0, 200)}`,
      );
    }
    let result: { data?: Array<{ id: string }> } = {};
    try {
      result = JSON.parse(bodyText);
    } catch {
      throw new Error(`Invalid payments response for "${data.priceId}"`);
    }
    if (!result.data?.length) {
      throw new Error(
        `Price "${data.priceId}" not found in ${data.environment}. The product may still be syncing — try again in a moment.`,
      );
    }
    return result.data[0].id;
  });
