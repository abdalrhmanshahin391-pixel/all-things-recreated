# Show the protection notice on course pages

Add the same bilingual protection notice (English + Arabic, red shield) that already appears on lecture course pages to two more places:

1. **Course home page** — the page showing the course title, subject list and "Start a session" panel.
2. **Question solving page** — the study/session/exam screen, shown at the top above the question card.

## Details

- Reuse the existing `ProtectionNotice` component; no new wording, styling or logic.
- `src/routes/courses.$courseId.index.tsx`: render it just under the course header block, before the subjects/session grid.
- `src/routes/courses.$courseId.run.tsx`: render it directly under the top progress bar so it is visible in study, session and exam modes.
- Keep it compact and responsive on phones; no other page behaviour changes.

## Verification

Typecheck and build, then check both pages render the notice without layout overflow on mobile width.
