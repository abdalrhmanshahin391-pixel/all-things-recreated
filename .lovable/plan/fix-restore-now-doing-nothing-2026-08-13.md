# Fix "Restore now" doing nothing

## What I found

Your database is still empty (courses 0, questions 0), so the restore never actually ran.

Looking at the Site Transfer page, the restore button's very first check is:

- if the **Transfer code** box (the one above "Choose website package", not the "Your transfer code" box lower on the page) is empty, it stops immediately and only shows a small toast in the top-right corner. The review dialog stays open, so it looks like nothing happened.

In your screenshot that code box is empty, which matches the symptom exactly. The code is configured on the server (24 characters), so once it's typed in the restore will proceed.

## The fix

1. Show the reason inside the review dialog instead of only a corner toast — an inline red message such as "Enter your transfer code above, then press Restore now."
2. Disable the "Restore now" button while the code box is empty, so it can't look unresponsive.
3. Surface a wrong-code / server error inline in the same place, rather than only as a toast that can be missed.
4. Prefill the restore code box with the site's saved transfer code when an admin already loaded it on that page, so a normal restore is one click.
5. After the fix, walk through the restore once against your package and confirm rows land (spot-check courses, questions, committee tables).

## Technical notes

- File: `src/routes/admin.transfer.tsx` — `runRestore()` guard on `code.trim()`, plus the dialog footer at the bottom of the file. UI-only change; the server functions in `site-transfer.functions.ts` stay as they are.
