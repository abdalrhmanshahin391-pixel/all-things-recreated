# Faster sign-in and a lighter, snappier site

## What's slow today (confirmed in the code)

**Google sign-in**
- After Google returns, `/auth/callback` polls the session in a loop (up to 25 tries, 200 ms apart) and only then runs a second database read for the profile — so the "Signing you in…" spinner can sit for seconds even when the session is ready instantly.
- Every hop after sign-in is a **full page reload** (`window.location.replace`) — callback to `/welcome`, `/welcome` to the destination, and the onboarding gate in the app shell. Each reload re-downloads and re-boots the whole app instead of navigating inside it.
- On every cold start the app boots, and when there is no stored session it still runs a refresh attempt plus an **800 ms sleep and a retry** before deciding the visitor is signed out — that delay is paid by every signed-out visitor on the landing page.
- The popup path from the Google button also forces a hard reload into `/auth/callback` even though the session is already set in memory.

**General site feel**
- The onboarding gate and the device check both live in the root shell; the onboarding gate does a hard reload rather than a router navigation.
- 120 route files, several tools built over many iterations, and leftover helpers from earlier versions add weight to the shared bundle.

## The plan

### 1. Make Google sign-in near-instant
- Replace the polling loop in `/auth/callback` with an event-driven wait: listen for the auth state change and resolve the moment the session lands, with a short timeout as a fallback instead of a fixed 200 ms cadence.
- Fetch the profile in parallel with the session settle, not after it, and reuse the profile already cached by the shared auth store so the callback usually needs **zero** extra database reads.
- Replace every post-login `window.location.replace/href` with in-app router navigation (`/auth/callback` to `/welcome` or destination, `/welcome` to destination, onboarding gate). No more full app reboots mid-flow.
- Popup flow: when tokens come back in-page, go straight to the destination instead of hard-reloading `/auth/callback`.
- Keep the Lovable-managed Google provider as-is (it is the working one) — only the app-side handling changes.

### 2. Remove the startup delay for everyone
- Drop the 800 ms sleep + retry on boot. Only attempt a refresh when a stored session actually exists; otherwise resolve "signed out" immediately so the first paint is not blocked.
- Keep the renew-on-boot behaviour for returning users so "stay signed in" keeps working exactly as it does now.

### 3. Lighten the app shell
- Make the onboarding gate navigate instead of reload, and skip its work entirely while auth is still loading.
- Audit the root shell so nothing heavy runs on the first frame; defer non-critical trackers until after the page is interactive.
- Confirm heavy admin/AI tooling (Jarvis, ProX, AquaVisionX, PDF and image libraries) is loaded only on its own routes and never pulled into the shared bundle.

### 4. Clean up leftovers (nothing working gets deleted)
- Scan for genuinely unreferenced files, helpers and imports left over from earlier versions, plus dead imports and duplicate utilities, and remove only what nothing references.
- Fix any type or lint errors surfaced along the way.
- No feature, page, route or tool is removed. Jarvis v2 iPad stays untouched.

## Verification
- Run a signed-in browser pass through the Google flow and time it: callback should hand off without a visible reload.
- Confirm returning users stay signed in after closing and reopening the site.
- Typecheck and build clean.

## Technical notes
- Files in scope: `src/routes/auth.callback.tsx`, `src/routes/welcome.tsx`, `src/components/auth/GoogleButton.tsx`, `src/lib/auth-store.ts`, `src/routes/__root.tsx`, plus dead-code removals wherever the scan points.
- No database migrations, no auth provider reconfiguration, no changes to business logic.
