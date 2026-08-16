# Committee red theme + fix the header overflowing on phone and iPad

Two things: finish the committee identity, and stop the page from being wider than the screen so the header sits fully in view without scrolling sideways.

## 1. Header no longer overflows sideways

On phone and iPad the page is currently wider than the screen: the header's right cluster (avatar + "GOLDEN" badge + chevron) pushes past the edge, so the header is cut off until you scroll or zoom out.

- The badge shows its full pill only where there is room; on narrow screens it collapses to a compact crown/shield chip, so the avatar row always fits.
- The brand, nav and right cluster are allowed to shrink and truncate instead of forcing the page wider.
- A site-wide guard prevents any horizontal page scroll, so zooming out no longer reveals empty space beside the layout.
- Verified at 390px (phone) and 820px (iPad) widths before and after, checking the document is no wider than the viewport.

## 2. Committee theme (red) — remaining work

The badge and theme components are already written; what remains is wiring and styling.

- Red badge reading **لجنة الطب والجراحة** next to the avatar in the header, in the account menu and on the profile identity card.
- Site-wide red accent (buttons, highlights, focus rings) while a committee member is signed in.
- Golden wins when someone holds both roles; the committee badge still shows next to the gold one.
- Same responsive rule as above: full Arabic pill on wider screens, compact red shield on phones.

## Technical notes

- `SiteHeader`: add `min-w-0` to the brand/nav containers and `shrink-0` to the avatar cluster; render badges through the responsive variants so the phone layout uses the dot form. Cap the right cluster so it cannot expand the row.
- `src/styles.css`: add `html, body { max-width: 100%; overflow-x: hidden; }` alongside the existing base rules, and add the `.committee` token scope (deep red re-point of `--primary`, `--primary-soft`, `--primary-deep`, `--accent`, `--ring`, sidebar tokens, `--shadow-brand`, `--gradient-brand`) plus `.committee-chip`, `.committee-card`, `.committee-ring`, mirroring the existing `.golden` block. No hardcoded colours in components.
- `CommitteeBadge.tsx` and `CommitteeTheme.tsx` (already drafted) get mounted: `CommitteeTheme` next to `GoldenTheme` in `src/routes/__root.tsx`, badges in `SiteHeader` and `src/routes/profile.tsx`.
- `useAuth` already exposes `isCommittee` and `isGolden`; no database or query change needed.
- Check with Playwright at 390px and 820px that `document.documentElement.scrollWidth === clientWidth` and the header's right edge is inside the viewport.
