# Committee theme: red accent + لجنة الطب والجراحة badge

Members with the committee role get a visible identity of their own, mirroring how Golden accounts work today — but in red instead of gold.

## What a committee member sees

- A red badge reading **لجنة الطب والجراحة** next to their avatar in the header and in the account menu, on phone, iPad and desktop.
- Their profile identity card gets the red treatment: red-tinted gradient card, red avatar ring, badge next to the name.
- Site-wide red accent while they are signed in: buttons, highlights, focus rings and header accents shift to the red palette.
- Purely cosmetic — access rules are unchanged.

## Rules when someone has both roles

- Golden wins: a member who is both Golden and committee keeps the gold theme, and both badges show next to the name (gold first, then the committee badge).
- Admins browsing with admin mode off keep their normal look, matching how the committee role already behaves elsewhere.

## Responsive behaviour

- Full Arabic badge on tablet and up; under the small breakpoint it collapses to a compact red shield icon with the same tooltip, so the header never wraps on a phone.

## Technical notes

- The auth store already exposes `isCommittee`; no new query or database change is needed.
- New `CommitteeBadge` component modelled on `GoldenBadge` (sm / md sizes plus a dot variant), rendered with `dir="rtl"` around the Arabic label so it always reads correctly in the English UI.
- New `CommitteeTheme` component next to `GoldenTheme` in `src/routes/__root.tsx` that toggles a `committee` class on `<html>`, skipping it when `isGolden` is true.
- `src/styles.css` gains a `.committee` scope that re-points the same semantic tokens the `.golden` scope uses (`--primary`, `--primary-soft`, `--primary-deep`, `--accent`, `--ring`, sidebar tokens, `--shadow-brand`, `--gradient-brand`) to a deep red palette, plus `.committee-chip`, `.committee-card` and `.committee-ring` helpers. No hardcoded colours in components.
- Badge placements: `SiteHeader` (avatar button + account menu) and the profile identity card in `src/routes/profile.tsx`, reusing the existing Golden slots.
