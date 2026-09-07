# Universal combination-question support in AquaVisionX

## Goal
Whenever a PDF question contains numbered statements followed by lettered combinations, AquaVisionX will convert it into a true multi-answer question for students.

Example conversion:

```text
PDF:
1. Predominance of lymphocytes
2. Low glucose level
3. Relative density 1015 or more
4. Protein 30 g/L or more
A) 1,2
B) 1,3,4
C) 1,2,3,4
D) 3,4

Website:
More than one answer — select all that apply
1) Predominance of lymphocytes
2) Low glucose level
3) Relative density 1015 or more
4) Protein 30 g/L or more
```

Ordinary A/B/C/D questions will remain single-answer questions.

## Implementation

1. **Recognize and convert every combination question**
   - Update AquaVisionX reading instructions to classify each question as `single` or `multiple`.
   - Recognize number combinations separated by commas, dots, spaces, slashes, or plus signs.
   - For a combination question, extract every numbered statement and use those statements as options `1, 2, 3, 4...`; discard the displayed A/B/C/D combination choices.
   - Add a deterministic server-side validator/converter after the AI response so a missed conversion is repaired before the question is saved. This does not add another AI request or materially increase input cost.

2. **Solve multiple statements correctly**
   - Send the converted numbered statements to the existing answer stage.
   - For `multiple` questions, allow every medically correct statement to be marked correct instead of forcing exactly one answer.
   - Keep the current exactly-one-correct-answer rule for ordinary questions.
   - Validate the returned result before allowing import.

3. **Store the question type explicitly**
   - Add an answer-mode field to AquaVisionX work items and imported questions, defaulting existing questions to `single`.
   - Preserve this field through Question Bank export/import and course backup paths so multi-answer questions remain multi-answer after transfers.

4. **Let students select multiple answers**
   - Show a clear **“More than one answer — select all that apply”** note on converted questions.
   - Use multi-select controls for numbered-statement questions and the current single-select controls for ordinary A/B/C/D questions.
   - Grade a multi-answer response as correct only when the selected set exactly matches all correct statements, with no missing or extra choices.
   - Update study mode, session mode, exam mode, question map, results, wrong-answer review, and saved attempts to handle multiple selections.
   - Keep existing single-answer behavior unchanged.

5. **Keep admin corrections safe**
   - For multi-answer questions, let an admin toggle each numbered statement correct or incorrect without clearing the other correct statements.
   - Keep the current single “Set correct” behavior for ordinary questions.

## Verification

- Test the uploaded TB pleurisy example and confirm the website shows statements `1–4`, not the A–D combinations, with multi-selection enabled.
- Test different separators such as `1.2`, `1, 2`, `1 + 2`, `1/2`, and `1 2`.
- Test an ordinary A/B/C/D question to confirm it stays single-answer.
- Verify exact-set grading for correct, incomplete, and extra selections in study, session, and exam modes.
- Verify export/import preserves the multi-answer type and run the project checks.

## Existing questions

Previously imported incomplete questions cannot reliably recover missing statement wording. Re-running those PDFs through AquaVisionX will apply the new conversion; all new PDFs and all matching questions on every page will use it automatically.
