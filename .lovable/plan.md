# Make AquaQBank load reliably and feel fast

## What the evidence shows

- The published homepage responds successfully, but measured server time to first byte is about **1.0–1.16 seconds** before the browser can begin rendering.
- Every route is blocked by the root bootstrap while it fetches settings, translated content, and navigation from the backend. The cache helps warm instances, but a cold instance or slow backend still delays the entire HTML response.
- The homepage adds another blocking group of four data loads: page layout, courses and counts, packages, and universities. One slow request delays the whole first render.
- The root mounts several global systems at once: authentication, presence, device checks, announcements, themes, footer, and onboarding. Authentication is observed independently by the auth store, root shell, presence tracker, and device tracker, creating duplicate session work and invalidations.
- Presence currently writes immediately on mount/sign-in and every three minutes. Database statistics confirm thousands of session upserts and login-event inserts.
- The backend is healthy and the relevant tables are small. This points to startup architecture and request volume—not database size—as the primary problem.
- The repeated local `ECONNRESET / aborted` SSR messages are client-disconnected requests being converted into noisy 500 reports. They are not evidence of a database crash, but the error wrapper should stop treating request cancellation as a catastrophic application error.

## Implementation

### 1. Guarantee a fast first frame
- Stop making non-essential site bootstrap data a hard dependency of every route response.
- Keep the theme/settings needed for the first paint, but apply a strict timeout and return cached/default content immediately when the backend is slow.
- Use stale-while-revalidate behavior: serve the last good bootstrap instantly and refresh it in the background rather than making the visitor wait on cache expiry.
- Preserve all admin-editable content and invalidate the cache after edits as it does now.

### 2. Remove the homepage data barrier
- Keep only above-the-fold data in the initial homepage loader.
- Defer courses/counts, packages, universities, and editable lower-page sections so the header and hero render immediately, with stable skeleton space for sections arriving afterward.
- Fetch deferred sections in parallel through the existing query cache, preserving current content, ordering, themes, and controls.
- Ensure one failed optional section cannot blank the entire homepage.

### 3. Consolidate global auth and activity work
- Make the shared auth store the single source of session events; remove duplicate root-level session subscriptions and duplicate initial `getSession()` calls.
- Have presence and device tracking subscribe to the shared auth snapshot rather than opening their own auth listeners.
- Record a login once per actual sign-in, not again for repeated session events or remounts.
- Increase the presence heartbeat interval and send it only while the tab is visible, with a focus/visibility refresh after a minimum gap.
- Invalidate only user-scoped query keys after identity changes; do not re-run route loaders or global site bootstrap on routine token events.

### 4. Reduce shared JavaScript and rendering work
- Lazy-load non-critical global UI such as announcements, decorative themes, install prompts, notification prompts, and the footer after the primary route becomes interactive.
- Verify that PDF, ZIP, image-processing, Jarvis, AquaVisionX, ProX, and Ad Studio code remains isolated to its own admin route chunks.
- Keep the current visual design and every feature; this is loading-order and bundle-boundary work only.
- Reduce the sitewide font request to the families/weights actually used on the first screen, while retaining Arabic and English typography.

### 5. Fix cancellation handling and resilience
- Recognize request-abort/connection-reset errors in the server wrapper and middleware as normal cancellations: do not turn them into misleading catastrophic 500 logs.
- Keep real SSR failures logged with their original stack and retain the existing branded fallback page.
- Add bounded timeouts/fallbacks around optional startup reads so poor connectivity produces usable cached/default UI instead of an indefinite white page.

### 6. Optimize the confirmed slower committee path
- Inspect the exact filters/order used for committee resource library reads and add only the matching composite index if query analysis confirms it is used.
- Paginate or narrow broad resource-library reads instead of returning all resource columns/rows when only search results or metadata are needed.
- Preserve existing access policies and committee permissions.

## Verification

- Measure cold and warm homepage TTFB before and after; target a visible shell/hero in under one second on a throttled mobile connection and materially lower warm TTFB.
- Test slow/offline backend conditions: every public page must show useful content or a clear fallback, never an indefinite white screen.
- Test signed-out, returning signed-in, Google sign-in, sign-out, onboarding, device-limit, and browser back/refresh flows.
- Verify on iPhone/iPad-sized and desktop viewports, including Arabic and English.
- Confirm login events are not duplicated and presence writes drop substantially without breaking online-user reporting.
- Inspect route chunks to confirm heavy admin libraries are absent from homepage/shared bundles.
- Run targeted tests and type checks, then validate production-like SSR responses and browser console/network behavior.

## Technical scope

Likely files: root route/shell, homepage route and home sections, site bootstrap server helper, shared auth store/hook, presence and device tracking, server error wrapper/middleware, and the committee resource query/index if its query plan confirms the need. No features, content, routes, or permissions will be removed.
