# Phone notifications (web push) with a bilingual sender page

Yes — members can get real pop-up notifications on their phones. It works through the installable app:

- Android + desktop: they just tap "Allow notifications".
- iPhone: they must first add AquaQBank to the Home Screen (iOS only allows push from installed web apps). The site will show a short "Add to Home Screen" hint on iPhone.

## What you get

**1. A new admin page: Notifications (`/admin/notifications`)**

- Write the message once in **English** and once in **Arabic** (title + body). Each member receives it in the language they are using on the site.
- Optional link (e.g. an event or a course page) so tapping the notification opens that page.
- Pick the audience from your existing **Groups** (Everyone, لجنة الطب والجراحة, admins, course owners, package owners, no-course-yet, hand-picked). Multiple groups can be selected.
- Live preview of how the notification looks, plus a count of how many devices will actually receive it.
- "Send test to me" button before the real send.
- Optional schedule (send now, or at a chosen date/time).
- History list: every notification sent, who it went to, how many delivered/failed.

**2. Automatic notifications (toggles on the same page)**

Each can be turned on/off:
- New event published
- New lecture or resource added to لجنة الطب والجراحة
- New course opened / university opened
- New site announcement marked urgent

**3. Member side**

- A "Notifications" switch in the profile page and a one-time gentle prompt after sign-in.
- On iPhone (not installed yet) it shows the Add-to-Home-Screen instructions instead of a dead button.
- Members can turn it off at any time; each device is remembered separately.

## Technical section

- Add a service worker at `public/push-sw.js` handling `push` and `notificationclick` only (no offline caching, no app-shell worker — the existing manifest-only install setup stays untouched).
- New tables: `push_subscriptions` (user_id, endpoint, keys, user_agent, lang, enabled), `push_messages` (bilingual title/body, url, audience group ids, schedule, status, counts), `push_deliveries` (per-device result). RLS: users manage only their own subscription rows; admins/heads read the message tables; GRANTs for `authenticated` + `service_role`.
- New `notification_settings` row table for the automatic-trigger toggles.
- Sending happens in `createServerFn` handlers (`src/lib/push.functions.ts` + `push.server.ts`) using VAPID web push over `fetch` with a Cloudflare-Worker-compatible web-push implementation (Web Crypto ES256 + aes128gcm) — no Node-only libraries.
- VAPID public/private keys generated once and stored as backend secrets; the public key is exposed to the browser through a small server function.
- Audience resolution reuses the existing `public.user_in_group()` function, so no new grouping concept.
- Scheduled sends are drained by a `/api/public/push-dispatch` route protected by a shared secret header, called on a schedule.
- Expired/`410 Gone` endpoints are deleted automatically after a failed send.
- Permission is only requested from a user gesture (the profile switch or the prompt's "Enable" button), never on page load.

## Notes

- Web push cannot reach a member who never enabled it or who uses iOS Safari without installing the app — for full reach, keep using the on-site announcement bar alongside it.
