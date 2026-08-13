# Fix Patch iPad ProX and simplify its controls

The current `Op.pdf` run is not still waiting on Gemini. Phase 1’s batch completed and returned **8 detected questions** (6 on page 1 and 2 on page 2), but the tool stopped before creating the question pictures. The page images used for cropping exist only in browser memory; after a refresh or reopening the run, **Resume** polls the already-finished batch but cannot recover those page images. That is why the page shows `cut_ready`, `p1 · 0`, and `p2 · 0` indefinitely. Phase 2 never received anything because no question pictures were created.

## What will change

### 1. Recover the existing run
- Make selecting the same PDF rebuild the temporary page files for the selected run instead of creating another run.
- When Phase 1 already has Gemini borders, continue directly from those saved borders: crop the 8 questions, upload their images, and create the Phase 2 items.
- Keep all Gemini results already received; do not resend Phase 1 or spend money twice.

### 2. Replace confusing buttons with one state-aware action
- Remove the competing **Start**, **Resume**, and **Check** controls.
- Show one primary action that changes according to the real state:
  - `Choose PDF and start`
  - `Waiting for Gemini — checking automatically`
  - `Select the same PDF to finish cutting`
  - `Start solving 8 questions`
  - `Waiting for answers — checking automatically`
  - `Import 8 questions`
- A finished or waiting step cannot be started again accidentally.

### 3. Make batch status unmistakable
- Display a single prominent status banner with plain-language states: **Uploading**, **Submitted to Gemini**, **Waiting in batch queue**, **Gemini finished**, **Cutting pictures**, **Solving**, **Ready to import**, or **Failed**.
- Show the last successful check time and the exact counts returned, cut, solved, and failed.
- Translate internal values such as `cut_ready` into readable labels; page chips will say `6 borders found · needs cutting` instead of `p1 · 0`.
- Surface polling and response errors instead of silently swallowing them.

### 4. Make both phases reliable
- Auto-poll while a selected run is waiting, including after reopening the page.
- Stop polling only on success or a visible terminal failure; do not present failed/cancelled/expired batches as completed.
- Validate that each submitted page/question has a matching response key and show exactly which ones are missing.
- Add retry actions only for the failed pages or questions, without rerunning successful work.
- Keep server-side phase gates so Phase 2 cannot start before every page is cropped and Import cannot start while any answer is missing.

### 5. Verify end to end
- Recover the existing `Op.pdf` job from its saved 8 borders.
- Confirm 8 question images are produced before Phase 2 unlocks.
- Submit Phase 2, observe real Gemini batch states, and confirm every returned answer/explanation is saved and displayed.
- Verify refresh/reopen recovery at the waiting and ready points, then confirm Import unlocks only when all usable questions are complete.

## Technical details

- Update the ProX route’s state machine and PDF rehydration flow; persist enough local run context to reconnect a reselected PDF to the existing job.
- Harden cut/solve polling so terminal failures set explicit failed states and response-mapping failures cannot masquerade as success.
- Add targeted retry server functions for failed page and item records while preserving existing successful batch output.
- Keep Jarvis Batch v2 iPad and AquaVisionX untouched.
