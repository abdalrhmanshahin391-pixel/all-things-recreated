# Tidy the "Join the team" note

## What changes

The note in the لجنة الطب والجراحة hero currently floats over the heading, mixes English and Arabic in one block, and reads as a heavy box. It becomes a clean, English-only strip:

- **English only.** The Arabic paragraph is removed. One short line: "Want to help other students by sharing resources? Join the staff team." — the committee name stays as it is in the page title, not repeated in the note.
- **Quieter styling.** Slimmer card, thin border, no glow circle, smaller heading label ("Join the team") and a compact text link "Contact us →" instead of the solid gold button.
- **Stops disturbing the layout.** No longer absolutely positioned over the hero. It sits as a single-line row under the hero buttons / Staff Team button, centered with them, full width capped so it stays narrow on desktop and wraps neatly on phones.

## Technical notes

- Edit `JoinTeamNote` in `src/routes/committee.index.tsx`: drop the RTL paragraph and the decorative span, replace `lg:absolute …` positioning with in-flow placement inside the hero column, use `border-border/60 bg-card/60` and a `text-primary` inline link to `/support`.
- No other files, data, or logic touched.
