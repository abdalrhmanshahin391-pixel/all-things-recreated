# Fix "Rewrite explanations" doing nothing

## What I found

The button first calls a browser confirmation pop-up (`window.confirm`). Inside the Lovable preview frame that pop-up is usually blocked, so it silently returns "no" and the whole action stops — the click looks completely dead. Even outside the preview, the button gives almost no feedback: it runs long batches with a single spinner, and if the AI key or the request fails the only sign is one small toast that disappears.

Checked live: the subject questions exist (588 questions, 575 with an old-format explanation, 13 empty), so there is real work for it to do — the data is not the problem.

## The fix

1. Replace the blocked browser pop-up with an in-app confirmation panel, so pressing the button always does something visible.
2. Show live progress while rewriting: "Rewriting… 12 of 575 done", the current batch, and a Stop button to end it cleanly.
3. Show errors in the panel itself (not only as a toast) — for example a missing AI key message telling you where to add it.
4. When nothing matches the filter, say so plainly ("All explanations already use the new format") instead of finishing silently.
5. After it finishes, refresh the question list and show a clear summary of how many were rewritten, skipped and failed.

## Technical details

- `src/components/admin/QuestionListEditor.tsx`
  - remove `window.confirm` from `rewriteAll`; add local state `confirmOpen`, `progress {done, failed, lastError}`, `stopRequested`.
  - render a confirmation card above the list (reusing existing zinc/amber styles) with Cancel / Start buttons and the provider, model and only-empty summary.
  - loop stays batched via `amgRewriteSubjectExplanations` (`limit: 4`) but breaks on `stopRequested`, updates progress after each batch, and keeps failures in an array shown in the panel.
  - keep a total count query (or count from `rows`) to render "x of y".
- `src/lib/aqua-mcq-gen.functions.ts`
  - `amgRewriteSubjectExplanations`: also return `total` (count of questions in the subject that still need rewriting) so the UI can show progress, and return an explicit `skipped` count when the filter matched nothing.
  - keep the admin-only guard, provider/model handling and the new explanation format untouched.

No database changes.
