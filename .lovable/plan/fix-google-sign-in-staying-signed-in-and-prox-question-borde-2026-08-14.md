# Fix Google sign-in, staying signed in, and ProX question borders

Reviewed against the code — two things in the earlier draft were wrong and are corrected here.

## 1. Google sign-in / register (the error page) — confirmed

The page you saw comes from the auth server itself: `Unsupported provider: missing OAuth secret`. The button and the redirect are correct; the Google provider was never switched on for this project, so the very first hop fails.

- Turn on the Google provider (managed credentials, nothing for you to paste).
- The button stays as it is: your site → Google's own account chooser → back to AquaQBank. No third-party consent screen, no other brand.
- Same button on sign in and register; `/welcome` still asks you to type full name, username and phone yourself.
- Verify the round-trip lands on `/auth/callback` and then on the page you came from.

## 2. Staying signed in — diagnosis first, then fix

Correction to the earlier draft: the app **already** persists the session, auto-refreshes it, and already re-checks it when the tab becomes visible. Nothing in the code signs you out except the sign-out button, the blocked-account check, and the password-reset screen. So "missing refresh on focus" was not the cause, and I will not pretend to know the cause before checking it.

Step one is to check the real reasons, then fix what it turns out to be:
- Whether the device-limit check is bouncing you to `/locked` (that page looks like being signed out).
- The project's session and refresh-token lifetimes — if the refresh token expires or is single-use with a short window, returning after days ends the session; that is a setting, not code.
- Safari on iPhone/iPad deletes browser storage for sites you haven't opened in ~7 days, which logs you out no matter what the app does. If that's what's happening I'll say so plainly instead of shipping a fake fix.

Then: extend the session lifetime to the longest sensible value, refresh the session explicitly on app start, and make sure a failed refresh retries instead of dropping you at the login page.

## 3. Patch iPad ProX — broken pictures, and 0 imported

Your screenshot: 7 pictures cut, 4 solved, 3 with no usable answer, 0 imported. Two separate faults, both confirmed in the code.

**a. The borders.** The cut model returns raw bands with no clean-up, so a band can start mid-question or run into the next one. Fix: sort the bands per column, clamp them inside the page, remove overlaps, snap each band's bottom to the next band's top, drop slivers too short to be a real question, and give each crop a little more breathing room top and bottom so the question number and the last option are always inside the picture.

**b. Nothing could be imported.** This is the bigger one, and the earlier draft missed it: ProX refuses the whole import when *any* question is unsolved — "Phase 2 is not complete" — so three bad pictures blocked all seven. Fix, borrowing what v2 does:
- **Repair pass**: when a batch item comes back empty or malformed, that single picture is re-solved on its own before being written off. v2 has this; ProX has none, which is why three went straight to failed.
- **Import what is good**: the import saves every solved question and reports the ones still failing, instead of refusing everything.
- The retry button keeps working on what remains, and the summary names the page each failed picture came from.

The v2 iPad tool is not touched — only read for reference.

## Technical notes

- `supabase--configure_social_auth` with `google` (managed). `GoogleButton.tsx` keeps `supabase.auth.signInWithOAuth` with `redirectTo = ${origin}/auth/callback`.
- Session: `persistSession`/`autoRefreshToken` are already on in the generated client and `__root.tsx` already pings `getSession()` on `visibilitychange`. Work is: inspect the auth session/refresh-token config, check the `/locked` device-limit path in `__root.tsx`, add an explicit `refreshSession()` on start with a retry, and raise session lifetime settings.
- ProX regions: normalise in `patch-ipad-prox.functions.ts` after parsing the cut batch (group by column, sort by `y_top`, clamp 0..1000, resolve overlaps, `y_bottom = min(y_bottom, next.y_top)`, drop `height < 40`); raise crop padding in `admin.patch-ipad-prox.tsx`.
- ProX solve: in `pollSolveBatchProX`, before marking an item failed, re-solve that single crop with `generateContent` + `IMAGE_SOLVER_SYSTEM` (same shape as the repair pass in `jarvis-image-ipad.functions.ts`).
- ProX import: `importProxJob` drops the hard `incomplete.length` throw and imports solved items, returning counts for skipped/failed.
- No changes to `jarvis-batch-v2-ipad.functions.ts`, `jarvis-image-ipad.functions.ts`, or `admin.jarvis-batch-v2-ipad.tsx`.
