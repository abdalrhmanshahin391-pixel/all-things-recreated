# Bring removed questions back — as freshly extracted

Today, deleting a group's questions from Question approval erases them for good — the only way back is to run extraction on the pages again. This changes that.

When you bring them back, you get them **as they came out of extraction**, before any approval work: no approvals, no edits made during review, original text, options and flags. A clean restart of the approval stage without reading the paper again.

## How it will work

- In Question approval, "Delete" becomes a **remove from approval** action: the questions leave the review screen but are kept aside with their group.
- The confirmation says clearly that they can be restored from Aqua MCQ Gen Pro as fresh, unreviewed questions — all approval edits will be lost.
- In Aqua MCQ Gen Pro, a group with set-aside questions shows a line like "48 questions removed from approval" with two admin-only buttons:
  - **Start approval again** — brings every question back exactly as extraction produced it: text, statements, options and original flags restored, nothing approved, review work discarded. The group returns to review.
  - **Delete permanently** — erases them for good, with a confirmation.
- Deleting the whole group in Aqua MCQ Gen Pro still removes everything, as it does now.
- Both actions are recorded in the group's history log, so you can see who removed and who restarted.
- Only admins can remove, restore, or permanently delete. QA members review as before.

## Technical notes

- Migration: add `orig jsonb` and `archived boolean not null default false` to `amg_items`. `orig` holds the extraction snapshot (`form`, `stem`, `number_label`, `statements`, `options`, `answer_mode`, `answer_labels`, `flagged`, `flag_reason`). No data loss; existing rows get `orig = null`.
- Extraction insert in `src/lib/aqua-mcq-gen.functions.ts` fills `orig` at creation time. Approval edits never touch `orig`.
- `amgClearGroupItems` stops deleting: sets `archived = true` and the group to `draft`, logs `review_cleared` with the count.
- New admin-only `amgRestoreGroupItems`: for each archived row, restores every field from `orig` (falling back to the current values when `orig` is null, for questions extracted before this change), sets `status = 'pending'`, clears `solved`, `solve_error` and `explanation`, sets `archived = false`, group to `review`, logs `review_restored`.
- New admin-only `amgPurgeGroupItems`: the real hard delete of archived rows, logs `review_purged`.
- `amgListItems`, `amgDuplicates`, and the solve/import queries filter `archived = false`, so set-aside questions never appear in review, solving, or import.
- `amgListGroups` returns an `archived` count per group for the restore banner.
- UI: `src/routes/admin.aqua-mcq-gen.approval.tsx` (wording only), `src/routes/admin.aqua-mcq-gen.index.tsx` (archived count + restart/purge buttons).
