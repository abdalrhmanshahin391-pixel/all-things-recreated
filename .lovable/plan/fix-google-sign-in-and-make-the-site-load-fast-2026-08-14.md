# Fix Google sign-in and make the site load fast

## 1. Google sign-in (the 400 error)

The error `Unsupported provider: missing OAuth secret` comes from the backend, not the page: Google sign-in was never switched on for this project's auth, so the button sends people to a provider that has no credentials.

Fix, in one pass:

- Turn on managed Google sign-in for the backend (no keys for you to create or paste).
- Switch the "Continue with Google" button to the managed sign-in helper, which opens Google in a popup, hands the session straight back, and works inside the editor preview as well as the live site. No Lovable-branded permission screen — the person goes from our button to Google's account chooser.
- Keep the intended destination (for example a course page) saved separately and only navigate after the session actually exists, so people never land on the home page by accident.
- Keep the `/welcome` step exactly as it is: fields stay blank and the person types their own full name, username and phone.
- Error states: if Google is closed or refused, show a plain message on the sign-in card instead of a blank screen.

## 2. Speed

No features are being removed. All eight import tools stay.

The site is slow mainly because everything is treated as equally important at load time. Changes:

- **Split the heavy admin pages out of the first download.** The biggest pages (question editor, the Jarvis/Vision/ProX tools, committee subject view, course runner) load on demand when opened, instead of being part of what every visitor downloads.
- **Move PDF and image libraries to load on demand.** The PDF engine is large and is only needed inside the import tools; it should not be fetched by someone opening the home page.
- **Stop duplicate data fetching.** Shared lookups (profile, roles, site settings, announcements) get one cached source with a sensible freshness window, so moving between pages does not re-query the backend each time.
- **Cache list queries** for courses, subjects and committee content so back-and-forth navigation is instant instead of re-loading.
- **Trim render work** on the long lists (questions, resources, people) that currently re-render whole pages on each keystroke or toggle.
- **Preload the page a user is about to open** on link hover, so navigation feels immediate.
- **Ship images and fonts lighter**: correct sizes, lazy loading below the fold, and a single font load path.

## 3. Verification

- Confirm Google sign-in end to end: new account, popup, `/welcome`, then landing on the intended page.
- Confirm a signed-in visitor stays signed in after closing and reopening the browser.
- Measure the home page and a course page before and after, and report the actual numbers rather than claiming it feels faster.

## Technical notes

- `supabase--configure_social_auth` with `google`; `GoogleButton` moves from `supabase.auth.signInWithOAuth` to `lovable.auth.signInWithOAuth` with `redirect_uri` of `${window.location.origin}/auth/callback`, handling both the `redirected` and popup-token paths.
- Route-level code splitting via lazy component boundaries on the largest route files; `pdfjs`/`pdf-lib` imported inside handlers only.
- One `onAuthStateChange` subscriber in `__root.tsx`, filtered to `SIGNED_IN`/`SIGNED_OUT`/`USER_UPDATED`; shared reads move to `queryOptions` with `staleTime`.
- No database schema changes.