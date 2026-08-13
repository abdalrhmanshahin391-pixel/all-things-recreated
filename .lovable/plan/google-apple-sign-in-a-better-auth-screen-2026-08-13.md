# Google & Apple sign-in + a better auth screen

Add one-tap sign-in with Google and Apple on both the login and register pages, keep the existing email + password form, and collect the missing details (full name, username, phone) right after the first social sign-in. Telegram is skipped.

## What the user sees

**Login and Register pages**
- Two social buttons sit at the very top of the form area, above everything else, so they are the first thing seen: "continue with Google" and "continue with Apple", side by side on desktop, stacked on mobile.
- A thin "or use your email" divider separates them from the existing email/password form, which stays exactly as it works today.

**After a first Google/Apple sign-in**
- The user lands on a short "finish your account" screen with three fields: full name (prefilled from the provider), username, phone number.
- Username and phone are checked for duplicates with the same rules the email sign-up already uses.
- Nothing else in the app is reachable until this one screen is completed; returning social users skip it entirely.

**Right-hand panel restyle**
- The pale mint/blue panel currently washes out its cream text. It gets rebuilt in the site's own palette: deep navy surface with the geometric medical pattern, gold accent badge, high-contrast headline and readable body text, and the floating medical icon chips re-tinted so they read as accents instead of noise.

## Technical notes

- Providers enabled via `supabase--configure_social_auth` with `providers: ["google", "apple"]` (Lovable-managed credentials), called in the same change as the code.
- Buttons call `lovable.auth.signInWithOAuth("google" | "apple", { redirect_uri: window.location.origin })` from `@/integrations/lovable`; the shared button pair lives in a new `src/components/auth/SocialAuthButtons.tsx` used by both `src/routes/login.tsx` and `src/routes/register.tsx`.
- New public route `src/routes/complete-profile.tsx`: reads the session, prefills `full_name` from user metadata, reuses the existing `identity_taken` RPC for username/phone uniqueness, then upserts the row in `profiles` and refreshes the cached profile via `refreshAuthProfile()`.
- Redirect rule added to the root auth subscriber / route guard: signed-in user whose `profiles` row is missing a `username` is routed to `/complete-profile` (auth routes themselves excluded), preserving any `next` target.
- Panel restyle is confined to `src/components/AuthShell.tsx` and `src/components/home/FloatingMedicalBackdrop.tsx` styling, using existing design tokens — no new hardcoded colors.

## Verify

- Google and Apple buttons complete sign-in on both pages, land on the completion screen once, and go straight to the app on later sign-ins.
- Email/password login and registration still work unchanged.
- Right panel is legible in both light and dark themes.
