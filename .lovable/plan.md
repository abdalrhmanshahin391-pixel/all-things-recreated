# Connect your own verified Paddle account

## What I found

The checkout code already exists in the project (Paddle overlay checkout, price lookup, webhook that unlocks courses after payment), but payments are **not actually connected**: there is no Paddle key, no client token and no webhook secret saved. Right now the code is also written to talk to Lovable's shared payments service rather than directly to your own Paddle account.

## What I will do

1. Point the payment code directly at your own Paddle account (live and sandbox), instead of the shared Lovable service.
2. Ask you to save two private values from your Paddle dashboard: an API key and a webhook signing secret.
3. Add your public client token (safe to store in the project) so the checkout window opens.
4. Give you the exact webhook address to paste into Paddle so purchases unlock the course automatically.

## What you need to get from Paddle (live account)

- **API key** — Paddle > Developer tools > Authentication > new API key.
- **Client-side token** — Paddle > Developer tools > Authentication > Client-side tokens (starts with `live_`). This one is public, you can paste it in chat.
- **Notification (webhook) destination** — created after I give you the URL; Paddle then shows a signing secret starting with `pdl_ntfset_`.

Events to enable on the webhook: `transaction.completed` and `adjustment.created`.

## Products and prices

Your courses look up a Paddle price by its **external/custom id**. Whatever prices you already have in your verified account will work as long as each one carries the id the course uses; I will show you what the site is asking for once the keys are in, so you can match them.

## Technical detail

- `src/lib/paddle.server.ts`: drop the connector-gateway base URL and custom headers; use `Environment.production` / `Environment.sandbox` with `PADDLE_LIVE_API_KEY` / `PADDLE_SANDBOX_API_KEY`; keep `verifyWebhook` and `getWebhookSecret` (`PAYMENTS_LIVE_WEBHOOK_SECRET`).
- `src/utils/payments.functions.ts`: replace `gatewayFetch` with a direct `https://api.paddle.com` (or `sandbox-api.paddle.com`) fetch using `Authorization: Bearer <api key>`.
- `src/lib/paddle.ts`: unchanged; reads `VITE_PAYMENTS_CLIENT_TOKEN` (added to `.env`), a `live_` token selects production.
- Webhook stays at `/api/public/payments/webhook?env=live`; it already grants course/package access and revokes on refund/chargeback.

## Cost

This is a small, focused change — well inside your 6 credits, provided the keys are supplied so I do not have to retry.
