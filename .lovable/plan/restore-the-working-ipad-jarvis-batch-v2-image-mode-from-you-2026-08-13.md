# Restore the working iPad Jarvis Batch v2 (image mode) from your backup

## What I found

I unpacked the previous version you sent and compared it file-by-file with what is running now. The iPad Jarvis v2 batch is made of four files, and only three of them really differ:

| File | Difference in the current version |
| --- | --- |
| `src/lib/jarvis-batch-v2-ipad.functions.ts` | Model renamed to `gemini-flash-lite-latest`, batch submits rerouted through a new shared helper |
| `src/lib/jarvis-image-ipad.functions.ts` | Batch submit rerouted through the same shared helper (image mode) |
| `src/lib/gemini-pool.ts` | New batch-submit helper with model-alias rewriting appended |
| `src/routes/admin.jarvis-batch-v2-ipad.tsx` | Only two small edits: the login redirect helper and the "Add key" link pointing at `/admin/gemini-keys` |

The PDF helpers (`pdf-split.ts`, `pdf-page-image.ts`, `pdf-page-render.ts`) are byte-identical, so page splitting and cropping are not the difference.

The backend is in place: the `question-images` bucket exists with its access rules, both iPad v2 tables exist, and one Gemini key is saved. The last real run left a chunk in state `ready` with `img-0 / img-1 / img-2: no usable answer from Gemini` — so pictures upload fine now and the failure is at the answer-solving step, which is exactly the part the current version rewrote.

## What I will do

1. **Restore the backup's version of the iPad v2 batch**, exactly as it was in the working build:
   - `src/lib/jarvis-batch-v2-ipad.functions.ts` — back to the direct model call and direct batch submit.
   - `src/lib/jarvis-image-ipad.functions.ts` — back to the direct batch submit for image mode.
   - `src/lib/gemini-pool.ts` — remove only the batch helper block added for the current version and restore the original model id, leaving the rest of the pool untouched.
   - `src/routes/admin.jarvis-batch-v2-ipad.tsx` — restore the backup's page, keeping the two current-project fixes (login redirect helper, key-page link) so nothing else in the site breaks.
2. **Leave every other page, tool and route alone.** German batch, text batch v2, the other Jarvis tools and the rest of the site are not touched.
3. **Run a real end-to-end test with your `Op.pdf`**: upload it through the page in a real browser session, run image mode, and watch it split pages, crop questions, upload pictures to storage, submit the batch, and import questions.
4. **Fix whatever the test actually surfaces** — for example a model id the batch endpoint rejects, a stale saved key, or a crop upload path issue — instead of guessing.
5. **Verify the imported questions** appear in the question list with their pictures, and confirm the page's progress counters, retry and delete buttons still work.

## Notes

- Restoring the old code means batch submits go straight to the model name written in the file again. If Google rejects that exact name on the batch endpoint for your key, it will show up in step 3 and I will correct just the model id — nothing else.
- If the test shows the saved Gemini key itself is out of quota or invalid, I will report that rather than silently rewriting the pipeline.