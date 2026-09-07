# AquaVisionX: multi-answer answers must match the printed a/b/c/d combinations

## The problem

For combination questions we now correctly show the numbered statements (1, 2, 3, 4) as
multi-select options — that stays exactly as it is.

But when solving, the AI judges each statement on its own and can end up marking 1, 3 and 4
correct, even though the paper only offers a) 1.2, b) 2.3, c) 1.3, d) 3.4. The answer then
matches no printed choice, which is wrong for a past paper.

## The fix

Keep the printed combinations instead of throwing them away, and force the final answer to be
one of them. This applies to every combination question in every PDF, not just the example.

1. **Remember the printed combinations (reading stage)**
   - The reading step still converts numbered statements into options 1, 2, 3, 4 and still
     hides a/b/c/d from students.
   - It additionally returns the printed combinations (e.g. `[[1,2],[2,3],[1,3],[3,4]]`) and we
     store them with the question. A safety net also reads them straight from the transcribed
     choices when the AI omits the field, so nothing depends on the AI alone.

2. **Solve inside the allowed combinations (solving stage)**
   - The solving request lists the allowed answer sets and instructs: choose the single best
     printed combination and mark exactly those statements correct; the explanation must justify
     that set and explain why each other printed combination is wrong.
   - After the reply comes back, the server checks the marked statements against the stored
     combinations. If they don't match a printed one, it snaps the answer to the closest printed
     combination (most overlap with what the AI judged correct). Questions with no stored
     combinations behave exactly as today.

3. **Nothing else changes**
   - Options, multi-select UI, the "More than one answer" note, exact-set grading, ordinary
     single-answer questions, import, backup and cost behaviour all stay as they are. No extra
     AI request is added.

## Existing questions

Already-imported questions keep their current answers. Re-running the PDF through AquaVisionX
applies the new rule.

## Verification

Re-run the pregnancy-interruption page: the site should still show statements 1–4 as
multi-select, and the correct answer should be one of a) 1.2, b) 2.3, c) 1.3, d) 3.4 — not
1,3,4. Also check an ordinary A–D question is untouched.

## Technical details

- New `combo_sets` (jsonb) column on `aquavision_items`, defaulting to empty.
- `src/lib/aquavisionx.functions.ts`: `READ_SYSTEM` returns `combinations`;
  `normalizeCombinationQuestion` extracts them from the raw lettered choices as a fallback;
  stage-1 insert stores them; `SOLVE_SYSTEM` plus the per-item prompt include the allowed sets;
  `pollAqvAnswers` (and the single-item retry path) snap `answer_letters` to the closest stored
  set before saving.
