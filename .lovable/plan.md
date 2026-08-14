# Polished auth: Google sign-in, profile setup, staying signed in

## 1. Fix the right half of the auth screen

Today the right panel is a mint/sky pastel gradient with rainbow pastel icon chips — it fights the navy + gold identity and looks washed out in dark mode (the headline is nearly invisible in your screenshot).

New treatment:
- Deep navy surface built from theme tokens (no hardcoded pastel hex), with a subtle gold grid/glow so it matches the left half instead of splitting the screen in two.
- Floating medical glyphs restyled to a single restrained palette: gold and muted slate on translucent chips, low opacity, gentle float. No pink/purple/cyan confetti.
- Headline, subtext and the three bullet rows get proper contrast on the dark surface; bullets use gold check chips.
- Works in both light and dark theme, since every colour comes from tokens.

## 2. Sign in with Google (branded as AquaQBank, not Lovable)

- A proper "Continue with Google" button on both sign in and register, above the email form, with a divider ("or continue with email"). Official Google mark, chunky button styling that matches the rest of the page.
- The provider is enabled for the project in the same change so the first click works.
- The consent screen is Google's own; everything before and after it is our page. Nothing in the UI mentions the platform we build on.

## 3. Collect full name, username and phone after Google sign-in

New `/welcome` step, shown only when a signed-in account is missing those fields:
- One clean card in the same auth style: full name, username (availability checked), phone (optional), with inline validation and a friendly "one last step" heading.
- Prefills full name from the Google profile so most people just pick a username and continue.
- Saves to the profile, then sends the user to where they were originally going — not blindly to the home page.

Bug fix for what you saw: after Google login the app dropped you on the home page and only then nagged you. The new flow routes straight from the Google return into `/welcome`, and once saved it returns you to your intended destination. Any signed-in user with an incomplete profile is redirected to `/welcome` from anywhere in the app, so the state can't linger half-finished.

## 4. Stay signed in when you come back

- Sessions persist and auto-refresh, so returning after days keeps you logged in without retyping anything — same as large sites.
- Remove the current "save my info" mechanism that stores your **password** in the browser (base64 only, effectively plain text). It is a real security hole and is not what keeps you signed in. The checkbox becomes "keep me signed in on this device" and controls session persistence only; email can still be remembered, never the password.
- Sign out stays explicit, and clears everything properly.

## Technical notes

- `AuthShell.tsx` right panel + `FloatingMedicalBackdrop` variant recoloured via CSS variables (`--primary`, `--primary-soft`, card/border tokens); add an `auth` density variant instead of hardcoding hex.
- Google via `lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth/callback` })` plus `supabase--configure_social_auth` in the same change. New public `/auth/callback` route waits for the session, then routes to `/welcome` or the saved same-origin `next` path.
- `/welcome` route: reuses the `identity_taken` RPC for username/phone uniqueness, updates `public.profiles` for `auth.uid()` under existing RLS. A small guard in `__root.tsx` (driven by the existing `auth-store` snapshot, no extra queries) redirects incomplete profiles to `/welcome`, excluding auth routes.
- Delete `src/lib/remember-login.ts` password storage and its uses in `login.tsx`; keep an email-only memory key.
