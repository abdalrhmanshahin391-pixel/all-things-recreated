# Fix AquaVisionX combinations and add resource-based answers

## Confirmed problem

The shown pulmonary-TB question is stored as a multiple-answer question with answer `2,3,4`, but its saved printed combinations are empty (`combo_sets: []`). The source paper only permits `1,2,3,4`, `1,4`, `2,3`, or `1,2`. Because the printed sets were lost during page reading, the solver had nothing to enforce.

## Fix the combination flow permanently

1. **Never silently lose the printed choices**
   - Stage 1 will return both the numbered statements and the original A–D combination choices in required fields.
   - Parse combinations deterministically, including dots, commas, spaces, slashes, plus signs, semicolons, and `&`.
   - Store the allowed sets with the question while continuing to display only numbered statements as the selectable options.

2. **Block invalid questions instead of guessing freely**
   - If AquaVisionX recognizes a combination question but cannot recover at least two printed combinations, mark it as needing repair and do not send it to Stage 2.
   - Show the missing-combinations warning in the AquaVisionX question list, with an editor where the admin can enter the printed sets without changing the numbered student options.
   - Stage 2 and import will reject any combination question whose allowed sets are missing.

3. **Enforce the paper at every boundary**
   - The solving request will list the exact printed combinations and require one—and only one—of them.
   - After the AI replies, validate the selected numbers against those sets. If the reply is not an exact match, choose the best permitted set and rebuild the correct flags from it.
   - Validate again before import, so an unavailable combination can never enter the question bank.
   - Ordinary A–D questions and unconstrained multi-answer questions remain unchanged.

4. **Repair the shown question**
   - Save its printed sets as `1,2,3,4 / 1,4 / 2,3 / 1,2`, reset its incorrect solved result, and solve it again.
   - Check the already imported copy in the same subject and replace its correct flags with the newly constrained result rather than leaving the current `2,3,4` answer live.

## Resource-based answering

Add an optional **Answer from a resource** section beside the existing reference-textbook control:

- **Upload:** attach a PDF resource such as a textbook chapter, notes, or answer key.
- **Paste:** enter source text directly.
- **Link:** enter a public HTTPS webpage or PDF link; the server will fetch it with type, size, and timeout safeguards.
- The saved resource belongs to that AquaVisionX job and can be removed or replaced before Stage 2.
- Stage 2 will answer and explain from the supplied resource. For combination questions, the resource helps choose the answer, but the final answer must still be exactly one combination printed in the question paper.
- The explanation will identify the supplied resource. If the resource does not contain enough evidence, the item will fail clearly instead of inventing an unsupported answer.
- Uploaded files will be private and admin-only. Keep the current “reference textbook by name” option working for jobs that use it.

## Technical details

- Extend AquaVisionX job data with resource type, label/text/link, and private uploaded-file path; add admin-only grants/policies for new data and private storage rules.
- Add raw printed-choice metadata to AquaVisionX items so extraction can be audited and repaired.
- Update the Stage 1 schema/parser, solve submission, result validation, import validation, job detail response, and AquaVisionX admin controls.
- Preserve the original page until its questions pass combination validation, allowing a failed extraction to be retried without uploading the whole paper again; clear it after successful import/delete.
- Cap pasted/fetched content and reject unsafe or unsupported URLs/files with a clear message.

## Verification

- Re-run the uploaded pulmonary-TB example: students still see statements 1–4 as multi-select, and the answer is exactly one of `1,2,3,4`, `1,4`, `2,3`, or `1,2`—never `2,3,4`.
- Test all supported separators and a deliberately incomplete Stage 1 response; the latter must stop with a repair warning rather than solve unconstrained.
- Test an ordinary A–D question to confirm no behavior changes.
- Test resource PDF, pasted text, webpage link, and linked PDF; confirm removal/replacement works and that explanations follow the selected source.
- Verify the repaired imported question, database access rules, type checks, build, and the live admin flow.
