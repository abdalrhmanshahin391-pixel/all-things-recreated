# Choose how blocked combination questions get answered

Right now, when AquaVisionX cannot recover the printed A–D sets of a combination question, that
question is marked "needs combinations" and Stage 2 is blocked until you type the sets in by hand.

You will get a second way out: let the AI answer those questions freely, using your saved resource
(PDF, pasted text, link) or the reference textbook when one is set.

## What changes on the page

For every question showing the orange "printed A–D sets not recovered" warning:

- Keep the existing box + **Save printed sets** button (unchanged behaviour).
- Add a second button next to it: **Let AI decide (no printed sets)**. Pressing it clears the block
  for that one question, so it will be answered as an ordinary select-all question — every medically
  correct statement can be marked, guided by your resource/textbook if you saved one.

At the top, next to the warning banner:

- Add **Let AI decide for all** — applies the same release to every still-blocked question at once,
  so Stage 2 can start immediately.
- The banner text is reworded: enter the printed sets, or let the AI answer them.

Once released (individually or in bulk), the warning disappears, the question shows the normal
"multiple" badge, and the **Send for answers (stage 2)** button becomes available.

You can still go back and type printed sets later — saving sets re-applies the strict rule and
resets that question's answer.

## What does not change

- Questions that do have printed sets stay strictly limited to those combinations.
- Ordinary A–D questions are untouched.
- Import still refuses a combination question whose stored sets are present but not respected.

## Technical details

- New server fn `releaseAqvCombinations({ jobId, itemId? })`: admin-gated; sets
  `question_type = 'multiple_select'`, `combo_sets = []`, `status = 'read'` for the given item, or
  for every `needs_combinations` item of the job when no item id is passed.
- Stage 2 blocking (`sendAqvSolve`) and the import check already key off `status` +
  `question_type = 'combination'`, so released items pass through unconstrained with the existing
  resource/reference prompt path — no prompt or grading changes needed.
- `admin.aquavisionx.tsx`: two new buttons wired to the fn with the existing refresh flow.
