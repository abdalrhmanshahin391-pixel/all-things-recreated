# "Join us" note on the Staff Team page + a Telegram QR card on the committee home

## 1. Move the join note to the Staff Team page

The small "Join the team" line currently sits on the committee home page. It moves to the Staff Team page (the page listing every member with their country flag), directly under the intro line and above the member grid — its own centered panel, in flow, so nothing overlaps.

Wording (English only, same meaning, rewritten):

> **Open to students everywhere**
> لجنة الطب والجراحة is not only for Jordanian students. If you have resources to share and you carry honesty and a real wish to help other students, you are welcome to join — and your own country's flag will sit on your card beside the rest.
> [Contact us]

- Styling uses theme tokens, so on the red committee theme it reads as a clean accented panel (thin primary border, soft primary tint, primary heading) — no clashing colours, no absolute positioning.
- "Contact us" is a primary button linking to `/support`.
- A small row of flags (Jordan, Palestine, Syria, Iraq, Egypt, +) sits under the text as a hint that every country is welcome.

## 2. Telegram QR card on the committee home page

On the main لجنة الطب والجراحة page (where the year is chosen), a QR card is added as its own tidy section between the header block and the year grid — never floating over the heading.

- Shows the QR image, a short "Join our Telegram channel" label, and an **Open Telegram** button underneath, so people on a phone (who cannot scan their own screen) still get there.
- Clicking the QR itself opens the Telegram link in a new tab.
- A placeholder QR for the current Telegram link is shown until you upload your own.
- Admins / committee managers get small controls on the card: **Upload QR**, **Edit link**, **Remove**. Uploads go to the existing member-photos storage and display through a signed URL, exactly like member photos.

## 3. Layout / organisation pass

- Committee home order: badge → Arabic title → intro line → admin buttons → Staff Team button → Telegram QR card → study plan banner → year grid. All in flow, centered, consistent spacing.
- Staff Team page order: back link → header → Add member (admins) → join panel → member grid.
- Both pages checked at phone, iPad and desktop widths, in the red committee theme and in dark mode, so nothing collapses or overlaps.

## Technical notes

- Migration: add `committee_qr_path text` and `committee_qr_link text` to `site_settings`; seed the link with the existing Telegram support link. Surface both through `useSiteSettings` (select list, type, defaults).
- New `src/components/committee/TelegramQrCard.tsx` — display plus an admin edit dialog (upload to `member-photos` under `qr/`, signed-URL resolve reusing the members helper, replace/remove, link field). Saves with a `site_settings` update, then invalidates the `site-settings` query.
- `JoinTeamNote` moves out of `src/routes/committee.index.tsx` into `src/components/committee/JoinTeamNote.tsx` and is rendered by `src/routes/committee.team.tsx`.
- Final verification with Playwright screenshots at 390 / 820 / 1280 px on both pages.