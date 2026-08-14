# Close a university ("coming soon") + free-form tags

## What you get

Two new independent controls per university in Admin → Universities:

1. **Closed / coming soon** — a switch that locks the university. When it's on:
   - Its card everywhere (home strip, universities page) shows a "Coming soon" overlay, is dimmed, and is not clickable.
   - Opening `/u/<slug>` directly shows a clean "Coming soon" screen instead of the Courses / Lectures / Resources cards, so nobody can reach the sections through the URL.
   - Admins still get through (with a small "closed for users" note), so you can prepare content.
   - Optional short note (English + Arabic), e.g. "Opening September 2026", shown under the Coming soon title.

2. **Tags** — add any number of small labels to a university without closing it: type the text (e.g. `NEW`, `2026 intake`), pick a color from a small palette, reorder or remove. Tags appear on the university cards on the home strip and universities page, and in the header of the university page. Tags are purely decorative — they never affect access.

Existing single "home badge" dropdown stays as-is; tags are the flexible replacement you can grow.

## Technical notes

- Migration on `public.universities`: add `is_closed boolean not null default false`, `closed_note_en text`, `closed_note_ar text`, and `tags jsonb not null default '[]'` (array of `{ label_en, label_ar, color }`). Read access follows the existing public SELECT policy; writes stay admin-only.
- Admin UI: extend the per-university row in `src/routes/admin.universities.tsx` with the closed toggle, note fields, and a small tag editor.
- Public reads: add the new columns to `src/hooks/useHomeUniversities.ts` and the query in `src/routes/universities.tsx`; render a shared tag chip + "Coming soon" overlay component.
- Gating: in `src/routes/u.$uniSlug.tsx`, after the university row loads (and after auth resolves, so no flash), render the closed screen unless the viewer is an admin; the tiles query is skipped in that case.
- All colors go through existing theme tokens.
