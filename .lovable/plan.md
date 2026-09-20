# Bring removed questions back without re-reading the paper

Today, deleting a group's questions from Question approval erases them for good — the only way back is to run extraction on the pages again. This changes that.

## How it will work

- In Question approval, "Delete" becomes a **remove from approval** action: the questions leave the review screen but are kept aside, attached to their group.
- The confirmation text says clearly that they can be brought back from Aqua MCQ Gen Pro without reading the paper again.
- In Aqua MCQ Gen Pro, a group that has set-aside questions shows a line like "48 questions removed from approval" with two admin-only buttons:
  - **Send back to approval** — returns every set-aside question exactly as it was (text, options, flags, and whether it was already approved), and puts the group back in review.
  - **Delete permanently** — erases them for good, with a confirmation.
- Deleting the whole group in Aqua MCQ Gen Pro still deletes everything, as it does now.
- Both actions are recorded in the group's history log, so you can see who removed and who restored.
- Only admins can remove, restore, or permanently delete. QA members review as before.

## Technical notes

- `amg_items.status` gains an `archived` value; add `prev_status text` to remember whether a question was pending or approved before archiving. Migration adds the column only — no data loss.
- `amgClearGroupItems` stops deleting: it sets `status = 'archived'`, stores the old status in `prev_status`, sets the group to `draft`, and logs `review_cleared` with the count.
- New `amgRestoreGroupItems` (admin-only, `ensureAdmin`): flips archived rows back to `prev_status ?? 'pending'`, sets the group to `review`, logs `review_restored`.
- New `amgPurgeGroupItems` (admin-only): the real hard delete of archived rows, logs `review_purged`.
- `amgListItems`, `amgDuplicates`, solve and import queries must exclude `status = 'archived'` so set-aside questions never appear in review, solving, or import.
- `amgListGroups` returns an `archived` count per group so the index page can show the restore banner.
- UI: `src/routes/admin.aqua-mcq-gen.approval.tsx` (wording only), `src/routes/admin.aqua-mcq-gen.index.tsx` (archived count + restore/purge buttons).
