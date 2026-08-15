# Golden accounts: badge + gold theme

Golden members should feel special the moment they sign in, on phone, iPad and desktop, and their badge should be visible to everyone.

## What the member sees

- A small gold "Golden" badge next to their avatar in the header and in the account menu, on every screen size.
- Their profile page gets the gold treatment: gradient identity card, gold avatar ring, gold section accents, and a short "Golden member — all courses and lectures included" line.
- Site-wide gold accent while they are signed in: header accent, primary buttons, highlights and focus rings shift to the gold palette, applied through a single `golden` class on the document root so nothing else has to change per component.
- Purely cosmetic — no change to access rules, which the role already handles.

## What everyone else sees

- Wherever a Golden member's name appears publicly (staff/committee member cards, and any public name display), a compact gold badge appears next to the name.

## Technical notes

- Auth store (`src/lib/auth-store.ts`) already reads `user_roles`; add `isGolden` to the snapshot alongside `isRealAdmin` / `isCommittee`, and expose it from `useAuth`.
- New `GoldenBadge` component (sm / md sizes) used in `SiteHeader`, the profile identity card, and member cards.
- Theme: add a `.golden` scope in `src/styles.css` that overrides the existing semantic tokens (`--primary`, `--accent`, `--ring`, plus a subtle gold surface tint) — no hardcoded colors in components. A small effect in the root route toggles `document.documentElement.classList` based on `isGolden`, so it survives refresh and works in dark mode.
- Public badges need golden status for other users: add a read path that exposes only "this user id has the golden role" (a narrow view or an RPC returning golden user ids), so member cards can show the badge without exposing the roles table.
- Responsive: badge shrinks to a gold dot with tooltip under ~380px so it never wraps the header.
