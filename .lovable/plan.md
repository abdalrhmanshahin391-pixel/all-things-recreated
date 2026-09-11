# Finish Paddle Live Payments — Handoff Plan

The site's payment code is already fully wired to the user's verified Paddle account. The server secrets are saved (`PADDLE_LIVE_API_KEY`, `PAYMENTS_LIVE_WEBHOOK_SECRET`). Only 3 setup steps remain — all are copy-paste tasks, no coding.

## Step 1 — Get the live client token from Paddle and save it here

The checkout window can't open without this public token.

1. Open: https://vendors.paddle.com/authentication
2. Under "Client-side tokens", copy the **live** token (starts with `live_`).
3. Save it in the project as the environment variable:
   `VITE_PAYMENTS_CLIENT_TOKEN = live_xxxxxxxx`
   (This is a public token — safe to set as a frontend env var. In Lovable: Project Settings → add env variable, or paste it in chat and it gets set in code config.)

## Step 2 — Add the webhook in Paddle so paid orders unlock courses

Without this, customers pay but nothing unlocks.

1. Open: https://vendors.paddle.com/notifications
2. Click **New notification destination**.
3. URL (exact):
   `https://aquaqbank.com/api/public/payments/webhook?env=live`
4. Subscribe to these events (exact):
   - `transaction.completed`
   - `adjustment.created`
5. Save. The signing secret for this destination is already saved in the project as `PAYMENTS_LIVE_WEBHOOK_SECRET` — if Paddle shows a NEW secret for this destination, copy it and update that secret value.

## Step 3 — Match each course to its Paddle price

Each course in Course Control has a price id/name field. The checkout looks up a Paddle price by that value.

1. Open: https://vendors.paddle.com/products-v2
2. For each course, create/open the product and its price (make sure it is in **live** mode, not sandbox).
3. For each price, set **one** of:
   - custom data: `external_id` = the exact value typed in Course Control, OR
   - name the price exactly the same as the value in Course Control.
4. Alternatively, paste the real Paddle price id (starts with `pri_`) directly into Course Control.

## Step 4 — Test with a real small payment

1. Set one course to a small price (e.g. 1 JOD/USD).
2. Buy it from a normal account on https://aquaqbank.com.
3. Confirm: checkout opens, payment succeeds, the course unlocks immediately.
4. If payment succeeds but the course doesn't unlock, the webhook (Step 2) is the problem.

## Technical reference (for Antigravity)

- Webhook handler: `src/routes/api/public/payments/webhook.ts` — reads `?env=live|sandbox` (default sandbox), verifies signature via `PAYMENTS_LIVE_WEBHOOK_SECRET`, unlocks courses on `transaction.completed`, handles refunds via `adjustment.created`.
- Server API: `src/lib/paddle.server.ts` — uses `PADDLE_LIVE_API_KEY` against `https://api.paddle.com`.
- Client checkout: `src/lib/paddle.ts` — needs `VITE_PAYMENTS_CLIENT_TOKEN`.
- Price lookup: `src/utils/payments.functions.ts` — resolves `pri_...` id, or matches `custom_data.external_id` / price name / product name.
- Already saved secrets: `PADDLE_LIVE_API_KEY`, `PAYMENTS_LIVE_WEBHOOK_SECRET`. Missing: `VITE_PAYMENTS_CLIENT_TOKEN`.
