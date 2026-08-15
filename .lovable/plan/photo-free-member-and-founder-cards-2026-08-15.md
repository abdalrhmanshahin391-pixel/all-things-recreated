# Photo-free member and founder cards

Right now every member and founder card must show a square photo (or initials placeholder). This adds a third framing option so a card can be created with no picture at all, and still look intentional.

## What changes

- The member editor (used for both Staff Team members and About-page founders) gets a third framing choice next to Fill and Fit: **No photo**.
- When "No photo" is selected, the photo upload row is hidden and any stored photo is ignored for display.
- The card then renders a compact, photo-less layout: a slim coloured band in the member's accent colour at the top, then the country flag, name, year, badge and description — centered on the About founder cards, start-aligned on the team grid, matching the existing typography.
- Photo-less cards sit in the same grid without leaving an empty square, so mixed grids (some with photos, some without) stay tidy.

## Technical notes

- No database migration needed: the existing `photo_fit` column carries a new value `"none"`.
- `src/lib/members.ts`: add a small helper (`hasPhoto(member)`) used by both card and form.
- `src/components/members/MemberCard.tsx`: skip `MemberPhoto` when `photo_fit === "none"`, render the accent band variant instead.
- `src/components/members/MemberForm.tsx`: add the third framing button and conditionally hide the upload/remove photo field.
