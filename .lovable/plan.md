# Why 2 questions were not imported — and reference-book mode for Jarvis v2 iPad

## Part 1 — the 2 missing questions (root cause confirmed)

I checked the actual run in the database. Six questions were solved; two are still sitting at status `solved`:

- p1q2 — "Identify the causative organism responsible for rheumatic fever from the given options."
- p1q3 — "Which of the following statements concerning acute rheumatic fever is true?"

Both of those exact questions **already exist in the same subject**, imported on 13 Aug from an earlier run of the same PDF. The questions table has a duplicate guard (a hash of the question text per subject), and the importer is set to silently ignore duplicates. So they were skipped, not failed — nothing was broken with Gemini or the pictures.

The real problem is that the page tells you nothing: it just shows "4 imported" out of 6 and leaves two chips looking unfinished, with no explanation.

### The fix

1. **Say what happened.** Duplicates get their own state and label: the item is marked `duplicate` and shown as "already in this subject" (with the date it was first imported), separate from real failures.
2. **Summary line** after import: `4 imported · 2 already existed · 0 failed`, instead of only a count.
3. **Import anyway.** For duplicates only, an explicit **Import duplicates anyway** button re-imports them as new questions (the newer picture/explanation included), so you decide instead of the tool deciding silently.
4. **Nothing stays half-finished.** After an import pass every item ends in a final state (`imported`, `duplicate`, or `failed`), so the phase cards stop showing a run as incomplete when it is actually done.
5. **Same treatment in AquaVisionX and Jarvis v2 iPad** importers, which share the identical silent-skip behaviour.

For the run in your screenshot, once this is in, the two chips will read "already in this subject" and you can either leave them or press Import duplicates anyway.

## Part 2 — reference textbook in Jarvis Batch v2 iPad (50%)

Add the same "Use a reference textbook" control that AquaVisionX and Patch iPad ProX now have, to Jarvis Batch v2 iPad — both its text mode and its image mode, since they share one job record.

- The same card: a toggle, a text box for the book (e.g. `Robbins & Cotran Pathologic Basis of Disease`), **Save book**, a green confirmation line, and a **Remove book** button.
- When on, every solve request for that job carries an extra instruction: answer and explain strictly per that book, use its terminology and cut-offs, name it in the Concept section, and prefer the book over the printed key when they disagree.
- When off, the request is byte-identical to today, so current behaviour is untouched.

## Technical notes

- Migration: add nullable `reference_book text` to `jarvis_batch_v2_ipad_jobs`; add a `duplicate` status value handling (text column, no enum change needed) plus nothing else schema-wise.
- Importer changes in `src/lib/patch-ipad-prox.functions.ts`, `src/lib/aquavisionx.functions.ts`, `src/lib/jarvis-batch-v2-ipad.functions.ts`: detect the ignored-duplicate case (upsert returned no row), mark the item `duplicate`, count it separately, and accept an `allowDuplicates` flag that inserts with a disambiguated stem hash path.
- UI: reuse `src/components/admin/ReferenceBookCard.tsx` in `src/routes/admin.jarvis-batch-v2-ipad.tsx`; add duplicate chips + summary to `src/routes/admin.patch-ipad-prox.tsx` and the AquaVisionX page.
- Prompt injection reuses the existing `buildReferenceBlock` pattern, applied next to `subjectsBlock` in the text solver and the image solver (batch and single-repair paths).
- No change to batching, cropping, key rotation, or phase gating.
