# Fix Google sign-in, longer sessions, and ProX question borders

## 1. Google sign-in / register (the error page)

The page you saw comes from the auth server: `Unsupported provider: missing OAuth secret`. The button and the redirect are fine — the Google provider itself was never switched on for this project, so the very first hop fails.

Fix:
- Turn on the Google provider for the project (managed credentials, nothing for you to paste).
- Keep the button as it is: your site → Google's own account chooser → back to `aquaqbank`. No third-party consent screen, no other brand anywhere in the flow.
- Same button on both sign in and register, and the `/welcome` step after it stays as it is (you type full name, username, phone yourself).
- Verify afterwards that the round-trip lands on `/auth/callback` and then on the page you came from.

## 2. Staying signed in

- Sessions already persist, but nothing refreshes them while a tab sits idle or when you come back days later. Add a refresh on tab focus / app start so a returning visit renews the session silently instead of dropping you at the login page.
- Sign-out stays the only thing that ends a session; nothing else clears it.

## 3. Patch iPad ProX — broken question pictures

What your screenshot shows: 7 pictures were cut, 4 solved, 3 came back with no usable answer. The cutting is where it goes wrong — a band can start mid-question or swallow half of the next one, so Gemini gets an unreadable picture and returns nothing.

The v2 iPad tool stays untouched. Only ProX changes, borrowing the pieces that make v2 reliable:

- **Clean up the borders before cutting.** Sort the bands top-to-bottom per column, drop overlaps, snap each band's bottom to the next band's top so nothing is cut in half, drop slivers that are too short to be a real question, and clamp everything inside the page.
- **A little more breathing room** at the top and bottom of each crop, so the question number and the last option are always inside the picture.
- **Repair pass for unusable answers**, exactly like v2: when a batch item comes back empty or malformed, that single picture is re-solved on its own instead of being written off. Only what still fails after that is reported.
- **Retry button keeps working** on whatever survives, and the run summary tells you which page a failed picture came from.

## Technical notes

- `supabase--configure_social_auth` with `google` (managed). `GoogleButton.tsx` keeps `supabase.auth.signInWithOAuth` with `redirectTo = ${origin}/auth/callback`; no code change expected beyond verification.
- Session: `persistSession`/`autoRefreshToken` are already on in the generated client; add a small app-level `visibilitychange` + mount `supabase.auth.getSession()` refresh in `__root.tsx` (no new listeners competing with the existing `onAuthStateChange`).
- ProX regions: normalise in `patch-ipad-prox.functions.ts` after parsing the cut batch (sort by column then `y_top`, clamp 0..1000, resolve overlaps, `y_bottom = min(y_bottom, next.y_top)`, drop `height < 40`), and raise crop padding in `admin.patch-ipad-prox.tsx`.
- ProX import: port the single-item repair call from `jarvis-image-ipad.functions.ts` (`generateContent` on the one crop with `IMAGE_SOLVER_SYSTEM`) into the ProX import handler before counting a question as failed.
- No changes to `jarvis-batch-v2-ipad.functions.ts` / `jarvis-image-ipad.functions.ts` or their route.
