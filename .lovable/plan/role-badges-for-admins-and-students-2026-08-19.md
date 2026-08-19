# Role badges for Admins and Students

Match the existing red committee badge and gold Golden badge with two more:

- **Admin** — a distinctive "special" badge: deep navy-to-violet gradient with a subtle sheen and a shield-with-check icon, label `ADMIN`. Visually the most premium of the set so it clearly outranks the others.
- **Student** — a calm neutral badge for signed-in members with no role: muted surface, soft border, graduation-cap icon, label `Student`.

## Where they appear

- Header account button and account menu, next to the name — the same slots the other badges already use.
- Profile page identity card (medium size).
- Priority when several apply: Admin > Golden > Committee. Student shows only when the user has none of the others.
- Responsive: full pill on tablet and up, icon-only round chip on phones, so the header never wraps.

## Technical notes

- New `src/components/RoleBadge.tsx` exporting `AdminBadge` and `StudentBadge`, mirroring the `CommitteeBadge` API (`size`, `dot`, `className`).
- Two new chip classes in `src/styles.css` (`.admin-chip`, `.student-chip`) built the same way as the existing chip classes — no hardcoded color utilities in components.
- Rendered from `useAuth()`: admin badge on `isRealAdmin` (visible regardless of the admin-mode toggle, like the committee badge), student badge when signed in with no admin/golden/committee role.
- No database, role, or permission changes — purely cosmetic.