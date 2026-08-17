# Why no notification arrived, and how to fix it

## What I found

Your test message was sent successfully, but it reached **0 devices** — the database has **zero registered devices** (`push_subscriptions` is empty), so there was nothing to deliver to. Delivery count for that message: sent 0, failed 0.

Signing in on iPad/phone/PC does **not** subscribe a device. Each device must explicitly grant notification permission once, through the switch that currently lives at the bottom of the **Profile** page. Nobody (including you) has completed that step yet on any device — or the switch failed silently on the devices you tried.

Two things need to happen: make enabling obvious and reliable, and make the admin side tell the truth about reach.

## What I will build

**1. Bring the notification switch out of hiding**
- Add a one-time prompt card after sign-in (and on the home page) inviting the user to turn on notifications, dismissible and remembered per device.
- Add "Notifications" to the account menu in the header, linking straight to the switch.

**2. Make the switch trustworthy**
- Show the exact reason when it fails instead of a generic error: permission blocked, service worker registration failed, not installed on iOS, keys missing, database rejection.
- Show live status on the page: "This device is registered" / "Not registered", plus the count of your own registered devices.
- Add a "Send a test to this device" button right next to the switch, so it can be verified in one tap without going through the admin page.

**3. iPhone/iPad specifics**
- iOS only allows web push when the site is opened from the Home Screen icon (not from Safari). Detect that state and show a step-by-step Share → Add to Home Screen guide, then instruct to reopen from the icon and enable there.
- Verify the app manifest advertises standalone display so the installed app qualifies for push.

**4. Admin honesty about reach**
- On the Notifications admin page, show the real number of registered devices before sending, and warn clearly when it is 0 instead of reporting "sent".
- Show per-message delivery results (delivered / failed) in the history list.

**5. End-to-end verification**
- Run a real browser against the preview, enable notifications on a desktop profile, confirm a row appears in the device table, send a test, and confirm delivery is recorded. Report the result.

## Technical notes

- Push keys are configured on the server and the service worker (`public/push-sw.js`) is in place; the gap is purely subscription registration, not encryption or dispatch.
- Work touches `src/components/PushToggle.tsx`, `src/lib/push-client.ts` (error reasons), `src/routes/profile.tsx`, `src/components/SiteHeader.tsx`, a new prompt component, and `src/routes/admin.notifications.tsx`. No schema change is expected.
- After the fix, every device still has to be enabled once per device — that is a browser rule, not something the app can bypass.
