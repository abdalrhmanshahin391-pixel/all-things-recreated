# Patch iPad ProX — make it actually usable (multi-PDF, no dead ends)

## What is broken today

Confirmed by reading the code and the database:

- Phase 1 renders each page in your browser and keeps the page picture **only in browser memory** (`miniByPage.current` in `src/routes/admin.patch-ipad-prox.tsx`). Nothing about the page image is stored — `patch_prox_pages` has no image column.
- Gemini's borders come back minutes later. By then the tab has usually been reloaded, so memory is empty and the app shows **"Select the same PDF to finish cutting"**. That message is dead: the button itself is not a file picker (it is disabled until a file is chosen in the box further up), so the run can never be finished. This is exactly the state your `Op.pdf` run is stuck in.
- One job = one PDF, and the whole run is driven by a single "busy" loop, so several PDFs cannot be queued.

## The fix, same logic, different plumbing

Keep the two-phase 50%-off batch logic exactly as it is. Change **where the page pictures live**: upload them once at the start, so no step ever depends on the browser still holding the PDF.

### 1. Store page images (new small migration)
Add `page_image_path` (text) to `patch_prox_pages`. During phase 1 the browser renders each page, uploads the JPEG to the existing `question-images` bucket, and saves the path with the page row. The same JPEG bytes still go to the Gemini border batch.

Result: cutting can happen any time, on any device, after any reload — the app downloads the stored page image and crops from it. The "select the same PDF" state disappears completely.

### 2. Automatic cutting
When the border batch finishes, cutting runs by itself from the stored page images and uploads the question pictures. No user action between phase 1 and phase 2 unless something failed.

### 3. Multiple PDFs
Choose several PDFs in one go. Each PDF becomes its own job (its own row in Recent runs), and they are processed one after another: split → render → upload → submit borders. After that all jobs poll independently in the background, so several exams can be in flight at the same time without interfering. Course/group/subject selection applies to the whole selection.

### 4. One clear control per run
Replace the current guessing-game button with a fixed, readable state machine per job:

```text
Ready to start   -> [Start]
Reading pages    -> Gemini is working (auto-checking, nothing to click)
Cutting pictures -> automatic
Ready to solve   -> [Solve N questions]
Solving          -> Gemini is working (auto-checking)
Ready to import  -> [Import N questions]
Something failed -> [Retry only what failed]
```

Every state either has a working button or clearly says "nothing to do". No state can require a file that is gone.

### 5. Recovery for the stuck Op.pdf run
The old run has borders but no stored page images, so it cannot be rescued without the PDF. The run list gets a plain "Re-run this PDF" action that starts a fresh job with the same course/group/subject from a re-picked file, plus a delete. Simplest path for `Op-2.pdf`: delete the stuck run and start fresh — the new flow will carry it to import without stopping.

## Verification before I hand it back

I will run the new flow end to end with the `Op-2.pdf` you attached: start the job, confirm pages upload, confirm borders return, confirm question pictures are cut and stored, confirm phase 2 answers come back, and confirm import writes the questions into the chosen subject. I will report the counts at each step.

## Technical notes

- Files touched: `src/routes/admin.patch-ipad-prox.tsx` (multi-file queue, per-job state machine, crop-from-storage), `src/lib/patch-ipad-prox.functions.ts` (save/read `page_image_path`, crop step no longer client-PDF bound), one migration adding the column.
- Jarvis Batch v2 iPad and AquaVisionX are not touched.
- Batch slicing (8 pages / 10 questions per batch) and the answer-letter reconciliation logic stay as they are.
