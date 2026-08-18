# Fix: Telegram QR card edits don't stick

## What's actually happening

The save does reach the database — the Telegram link in the database is currently `https://t.me/aquaqbankxcasda`, i.e. your test edit was stored. The card never shows it because of how site settings are loaded at page start:

- On every page load the server sends a fixed list of site-settings columns to the app, and that list does **not** include the two new QR fields (`committee_qr_path`, `committee_qr_link`).
- The app seeds its cache with that list before anything renders, and the settings query is set to never refetch on mount (30-minute cache).
- So the card always falls back to the built-in default link and the auto-generated QR, no matter what is saved. On refresh it "goes back to normal" for the same reason.

Two related gaps found while checking:

- The QR image path in the database is still empty, so no uploaded image has ever been stored — uploads to the member-photos storage are allowed for committee managers, but nothing was saved through the card.
- The update rule on the settings table allows **admins only**. A committee head pressing Save gets no error and no change (zero rows updated) — a silent failure.

## The fix

1. Add `committee_qr_path` and `committee_qr_link` to the server-side startup settings list, so the card receives the real saved values on first paint and after every refresh.
2. After saving, update the cached settings immediately (not just invalidate) so the card shows the new link/QR without waiting for a refetch.
3. Report real outcomes in the dialog: if the update affects zero rows (no permission) show an error toast instead of "Saved"; surface upload errors the same way. Do the upload and the settings save as one confirmed step, so the image path is actually persisted.
4. Allow committee heads (not just admins) to update these two QR fields, matching who sees the "Edit QR & link" button — done with a narrow rule so heads cannot change other site settings.
5. Verify end to end in the browser: change the link, save, confirm the card and the generated QR update, refresh, confirm it persists; then upload an image and repeat.

## Technical notes

- `src/lib/site-bootstrap.server.ts`: append the two columns to `SETTINGS_COLUMNS`.
- `src/components/committee/TelegramQrCard.tsx`: `.update(...).eq("id", true).select()` to detect zero-row writes; on success `queryClient.setQueryData(["site-settings"], …)` then invalidate; keep the upload inside the save flow with error handling.
- Migration: replace the settings UPDATE policy path for QR fields with a security-definer function `set_committee_qr(_link text, _path text)` callable by admins and committee heads, so no broad write access is granted.
