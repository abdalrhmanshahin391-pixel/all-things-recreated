import { Environment, Paddle, EventName } from "@paddle/paddle-node-sdk";

const getFirstEnv = (keys: string[]): string => {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(`Payment secret is not configured. Expected one of: ${keys.join(", ")}`);
};

export { EventName };

export type PaddleEnv = "sandbox" | "live";

/** Direct Paddle API base for the customer's own verified Paddle account. */
export function getApiBaseUrl(env: PaddleEnv): string {
  return env === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

export function getConnectionApiKey(env: PaddleEnv): string {
  return env === "sandbox"
    ? getFirstEnv(["PADDLE_SANDBOX_API_KEY", "PADDLE_TEST_API_KEY", "PAYMENTS_TEST_API_KEY"])
    : getFirstEnv([
        "PADDLE_LIVE_API_KEY",
        "PADDLE_API_KEY",
        "PAYMENTS_LIVE_API_KEY",
        "PAYMENTS_API_KEY",
        "PADDLE_SECRET_KEY",
        "PADDLE_KEY",
      ]);
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  return new Paddle(getConnectionApiKey(env), {
    environment: env === "sandbox" ? Environment.sandbox : Environment.production,
  });
}

export async function gatewayFetch(
  env: PaddleEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${getApiBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getConnectionApiKey(env)}`,
      ...init?.headers,
    },
  });
}

export function getWebhookSecret(env: PaddleEnv): string {
  return env === "sandbox"
    ? getFirstEnv(["PAYMENTS_SANDBOX_WEBHOOK_SECRET", "PADDLE_SANDBOX_WEBHOOK_SECRET", "PADDLE_TEST_WEBHOOK_SECRET"])
    : getFirstEnv([
        "PAYMENTS_LIVE_WEBHOOK_SECRET",
        "PADDLE_LIVE_WEBHOOK_SECRET",
        "PADDLE_WEBHOOK_SECRET",
        "PAYMENTS_WEBHOOK_SECRET",
      ]);
}

export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  const secret = getWebhookSecret(env);
  if (!signature || !body) throw new Error("Missing signature or body");
  const paddle = getPaddleClient(env);
  return await paddle.webhooks.unmarshal(body, secret, signature);
}

/**
 * Robust webhook verifier that gracefully tries live first, then sandbox,
 * preventing failed webhooks if the webhook URL omitted '?env=live'.
 */
export async function verifyWebhookAuto(req: Request, requestedEnv?: string | null): Promise<{ event: any; env: PaddleEnv }> {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  if (!signature || !body) throw new Error("Missing signature or body");

  // Determine priority: if specifically requested 'sandbox', test sandbox first. Otherwise try live first.
  const envOrder: PaddleEnv[] = requestedEnv === "sandbox" ? ["sandbox", "live"] : ["live", "sandbox"];

  let lastError: any = null;
  for (const env of envOrder) {
    try {
      const secret = getWebhookSecret(env);
      const paddle = getPaddleClient(env);
      const event = await paddle.webhooks.unmarshal(body, secret, signature);
      return { event, env };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Webhook signature verification failed for all environments");
}

/** Fetch transaction directly from Paddle API to verify status and items */
export async function getPaddleTransaction(env: PaddleEnv, transactionId: string): Promise<any> {
  const cleanId = transactionId.trim();
  if (!cleanId) throw new Error("Missing transaction ID");
  const res = await gatewayFetch(env, `/transactions/${cleanId}?include=customer,items`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Paddle transaction ${cleanId} (${res.status}): ${text.slice(0, 150)}`);
  }
  const json: any = await res.json();
  return json.data;
}

/** Find customer in Paddle by email */
export async function findPaddleCustomerByEmail(env: PaddleEnv, email: string): Promise<string | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  try {
    const res = await gatewayFetch(env, `/customers?email=${encodeURIComponent(cleanEmail)}&per_page=1`);
    if (res.ok) {
      const json: any = await res.json();
      const first = json?.data?.[0];
      return first?.id ?? null;
    }
  } catch (e) {
    console.warn("[paddle] find customer by email failed:", e);
  }
  return null;
}

/** Generate an authenticated Customer Portal session URL for viewing/removing saved payment methods */
export async function createPaddleCustomerPortalSession(
  env: PaddleEnv,
  customerId: string,
  returnUrl?: string,
): Promise<string> {
  const cleanId = customerId.trim();
  if (!cleanId) throw new Error("Missing customer ID");
  const bodyPayload: any = {};
  if (returnUrl) bodyPayload.return_url = returnUrl;

  const res = await gatewayFetch(env, `/customers/${cleanId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify(bodyPayload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to create Paddle portal session (${res.status}): ${text.slice(0, 150)}`);
  }

  const json: any = JSON.parse(text);
  const portalUrl = json?.data?.urls?.general?.overview || json?.data?.url;
  if (!portalUrl) throw new Error("Paddle did not return a portal overview URL");
  return portalUrl;
}

export interface CreateTransactionParams {
  env: PaddleEnv;
  items: Array<{ priceId: string; quantity: number }>;
  customer?: { email?: string; name?: string };
  customData?: Record<string, any>;
  checkoutSuccessUrl?: string;
}

/** Pre-creates a transaction directly with Paddle API with collection_mode=automatic */
export async function createPaddleTransaction(
  params: CreateTransactionParams,
): Promise<{ id: string; url?: string }> {
  const { env, items, customer, customData, checkoutSuccessUrl } = params;
  const payload: any = {
    items: items.map((i) => ({ price_id: i.priceId, quantity: i.quantity })),
    collection_mode: "automatic",
  };
  if (customData) {
    payload.custom_data = customData;
  }
  if (customer?.email) {
    payload.customer = {
      email: customer.email.trim().toLowerCase(),
      ...(customer.name ? { name: customer.name.trim() } : {}),
    };
  }
  if (checkoutSuccessUrl) {
    payload.checkout = {
      url: checkoutSuccessUrl,
    };
  }

  const res = await gatewayFetch(env, `/transactions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to initialize Paddle transaction (${res.status}): ${text.slice(0, 250)}`);
  }

  const json = JSON.parse(text);
  const txnId = json.data?.id;
  if (!txnId) throw new Error("Paddle did not return a transaction ID");

  return {
    id: txnId,
    url: json.data?.checkout?.url,
  };
}

