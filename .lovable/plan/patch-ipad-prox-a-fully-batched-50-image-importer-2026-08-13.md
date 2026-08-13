# Patch iPad ProX — a fully batched (50%) image importer

A brand new admin page. Jarvis Batch v2 iPad (image mode) stays exactly as it is — nothing in it is touched.

## What is different from Jarvis v2 iPad


| Step                               | Jarvis v2 iPad (today)                    | Patch iPad ProX (new)                                                            |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Finding question borders on a page | live Gemini call per page (full price)    | one Gemini **batch** job for all pages (50% off)                                 |
| Solving each question picture      | batch (50% off)                           | batch (50% off)                                                                  |
| Buttons                            | run everything in one go                  | Phase 1 → Phase 2 → Import, each locked until the one before is 100% done        |
| Correct answer                     | letter Gemini reports in `correct_letter` | letter taken from the explanation line ("Option **A** (arthralgia) is correct.") |


Everything else — key rotation, page rendering, cropping, uploading crops to storage, subject picking, dedupe, retry and delete — keeps the same logic as Jarvis v2 iPad.

Note make sure that a small or A like small letter or big letter and other things that can cause confuse to be fixed 

## The flow on the page

1. **Set up** — pick course, group, subject, upload the PDF. Pages are rendered in the browser, exactly like now.
2. **Phase 1 — Read the pages (batch, 50%)**
  - Every page image is sent as one request inside a single Gemini batch job that returns the question borders.
  - The page polls until the batch finishes, then crops each question out of the page and uploads the pictures to storage.
  - Phase 1 shows: pages sent, batch state, pages cut, question pictures uploaded.
  - Phase 2 stays disabled until every page is cut and every picture is uploaded.
3. **Phase 2 — Solve the questions (batch, 50%)**
  - All uploaded question pictures go into a second Gemini batch job (answer + concept + why right + why wrong).
  - Polls until finished; any picture that comes back unusable is retried once.
  - Import stays disabled until every picture has a usable answer.
4. **Import** — writes the questions, the picture as the stem, the options and the explanation into the chosen subject.

A job survives a refresh: reopening the page shows the job at the phase it stopped at.

## The wrong-answer fix

In the pictures you sent, the card marks D while the explanation argues for A. The explanation is the reliable one, because Gemini writes the answer it actually reasoned about there. So on this page the correct option is decided in this order:

1. the letter in the explanation sentence `Option **X** (…) is correct.`
2. if that sentence is missing, the letter left over after the "why the other options are wrong" list
3. only if both are missing, the `correct_letter` field

The solver prompt is also tightened so that sentence is always written in that exact shape. This rule is used only on this new page's image mode.

## Technical notes

- New route `src/routes/admin.patch-ipad-prox.tsx`, added to the admin hub tools list.
- New server functions `src/lib/patch-ipad-prox.functions.ts`, modelled on `jarvis-image-ipad.functions.ts`, with a batched cutter (`batchGenerateContent` with one request per page, `metadata.key = page-N`) instead of the live `generateContent` cut call.
- New tables `patch_prox_jobs` and `patch_prox_pages` (admin-only RLS + grants) holding: phase, cut batch id, solve batch id, per-page regions, crop paths, per-question parsed answer. This keeps the v2 iPad tables untouched.
- Crops keep going to the existing `question-images` bucket.
- Phase gating is enforced both in the UI (disabled buttons) and in the server functions (a phase-2 call is rejected while phase 1 is incomplete).

## Verification

After building, I run your PDF through the page end to end in a real browser session: phase 1 batch, cropping and upload, phase 2 batch, then import — and I check in the question list that the imported questions show their picture and that the marked option matches the letter named in the explanation.