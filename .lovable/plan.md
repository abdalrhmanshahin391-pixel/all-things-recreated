# Stop the intermittent white page, then make AquaQBank fast

## What the evidence shows

- This is an **intermittent availability failure**, not merely animation or visual lag. The iPad screenshot shows the browser still waiting with no HTML rendered.
- Five fresh live-browser tests succeeded, which confirms the failure is intermittent rather than a permanent broken deployment. The first visit still took **1.9 seconds to receive the page**, while warm visits took about 0.9 seconds.
- The published homepage responds successfully, but measured server time to first byte is about **1.0–1.16 seconds** before the browser can begin rendering.
- Every route is blocked by the root bootstrap while it fetches settings, translated content, and navigation from the backend. The cache helps warm instances, but a cold instance or slow backend still delays the entire HTML response.
- The homepage adds another blocking group of four data loads: page layout, courses and counts, packages, and universities. One slow request delays the whole first render.
- The root mounts several global systems at once: authentication, presence, device checks, announcements, themes, footer, and onboarding. Authentication is observed independently by the auth store, root shell, presence tracker, and device tracker, creating duplicate session work and invalidations.
- Presence currently writes immediately on mount/sign-in and every three minutes. Database statistics confirm thousands of session upserts and login-event inserts.
- The hosted backend is currently healthy, has no recent 500 responses in its available request logs, and the relevant tables are small. Increasing backend size is not justified by the present evidence; startup architecture and failure handling are the first fixes.
- The repeated local `ECONNRESET / aborted` SSR messages are client-disconnected requests being converted into noisy 500 reports. They are not evidence of a database crash, but the error wrapper should stop treating request cancellation as a catastrophic application error.
- Every signed-out live visit also makes two unauthorized requests—for announcements and events. They do not block the successful tests, but they are incorrect global startup work and add noise and retry/failure paths.
- The production homepage preloads noncritical chunks including push notification and image-compression code. Those should not be part of a normal visitor’s startup path.

## Implementation

### 1. Eliminate the white-page failure path
- Stop making non-essential site bootstrap data a hard dependency of every route response.
- Put a strict deadline around server startup reads. If settings/content/navigation are slow or unavailable, send a complete usable HTML shell immediately with safe defaults instead of keeping Safari on a blank document.
- Use stale-while-revalidate behavior: serve the last good bootstrap instantly and refresh it in the background rather than making the visitor wait on cache expiry.
- Add route-level pending and error UI that is present in the server response, so navigation and refresh can never present an unbounded blank screen.
- Preserve all admin-editable content and invalidate the cache after edits as it does now.

### 2. Make the homepage progressively render
- Render the header and hero without waiting for the four lower-page datasets; no backend call should stand between the browser and the first meaningful screen.
- Defer courses/counts, packages, universities, and editable lower-page sections so the header and hero render immediately, with stable skeleton space for sections arriving afterward.
- Fetch deferred sections in parallel through the existing query cache, preserving current content, ordering, themes, and controls.
- Ensure one failed optional section cannot blank the entire homepage.

### 3. Remove failed and duplicate global requests
- Do not call the authenticated announcements RPC for signed-out visitors; use an explicitly public read path for public announcements or wait until authentication settles.
- Do not query protected events anonymously. Return no event buttons until an allowed public/authenticated query can run successfully.
- Ensure these optional requests never throw into a global render boundary or trigger retries that can destabilize startup.

### 4. Consolidate global auth and activity work
- Make the shared auth store the single source of session events; remove duplicate root-level session subscriptions and duplicate initial `getSession()` calls.
- Have presence and device tracking subscribe to the shared auth snapshot rather than opening their own auth listeners.
- Record a login once per actual sign-in, not again for repeated session events or remounts.
- Increase the presence heartbeat interval and send it only while the tab is visible, with a focus/visibility refresh after a minimum gap.
- Invalidate only user-scoped query keys after identity changes; do not re-run route loaders or global site bootstrap on routine token events.

### 5. Reduce shared JavaScript and rendering work
- Lazy-load non-critical global UI such as announcements, decorative themes, install prompts, notification prompts, and the footer after the primary route becomes interactive. Ensure push and image-compression chunks are not preloaded on the public homepage.
- Verify that PDF, ZIP, image-processing, Jarvis, AquaVisionX, ProX, and Ad Studio code remains isolated to its own admin route chunks.
- Keep the current visual design and every feature; this is loading-order and bundle-boundary work only.
- Reduce the sitewide font request to the families/weights actually used on the first screen, while retaining Arabic and English typography.

### 6. Fix cancellation handling and resilience
- Recognize request-abort/connection-reset errors in the server wrapper and middleware as normal cancellations: do not turn them into misleading catastrophic 500 logs.
- Keep real SSR failures logged with their original stack and retain the existing branded fallback page.
- Add bounded timeouts/fallbacks around optional startup reads so poor connectivity produces usable cached/default UI instead of an indefinite white page.

### 7. Optimize the confirmed slower committee path
- Inspect the exact filters/order used for committee resource library reads and add only the matching composite index if query analysis confirms it is used.
- Paginate or narrow broad resource-library reads instead of returning all resource columns/rows when only search results or metadata are needed.
- Preserve existing access policies and committee permissions.

## Verification

- Run repeated cold-start and throttled-network tests—not only one successful load—and require zero blank pages. Target a visible shell/hero in under one second and materially lower warm TTFB.
- Simulate stalled/failed bootstrap, announcements, events, and homepage queries: every public page must show useful content or a clear fallback, never an indefinite white screen.
- Test signed-out, returning signed-in, Google sign-in, sign-out, onboarding, device-limit, and browser back/refresh flows.
- Verify on iPhone/iPad-sized and desktop viewports, including Arabic and English.
- Confirm login events are not duplicated and presence writes drop substantially without breaking online-user reporting.
- Inspect route chunks to confirm heavy admin libraries are absent from homepage/shared bundles.
- Run targeted tests and type checks, then validate production-like SSR responses and browser console/network behavior.

## Technical scope

Likely files: root route/shell, homepage route and home sections, site bootstrap server helper, shared auth store/hook, presence and device tracking, server error wrapper/middleware, and the committee resource query/index if its query plan confirms the need. No features, content, routes, or permissions will be removed.
