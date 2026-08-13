# AquaVisionX — two-stage 50% batch machine

A new admin page that turns a past-paper PDF into fully solved, explained questions using Gemini **batch mode only** (50% price), in two strictly separated stages, with buttons locked until each stage is 100% complete.

## How it works

**Stage 1 — Read the paper (cheap, page by page)**
- The PDF is split page by page. Each page is sent as **one** batch request (never the whole PDF), asking Gemini to return strict JSON: every question on that page with its options (a, b, c, d…), plus its number. No answers requested here — that keeps the output tokens tiny.
- All page requests go into Gemini's batch queue (50% discount), then the page waits and polls. Nothing else is clickable while this runs.
- When every page comes back, the questions are stored as rows and shown in a review list with a counter (e.g. "48 questions read from 6 pages").

**Stage 2 — Solve + explain (pure text, one question per request)**
- The "Send for answers" button stays disabled until Stage 1 is complete for every page (no page failed, no page pending).
- Each question is then sent alone as **plain text** (question + its options — no image, no PDF) in batch mode, asking for: correct answer, the concept, why the correct one is correct, why each wrong one is wrong.
- Again all requests are queued in batch, polled, and results saved per question.

**Stage 3 — Import**
- The "Import" button stays disabled until every single question has both an answer and a full explanation stored. Any failed item shows a per-item "Retry" so gaps can be closed before import.
- Import writes to the chosen course / group / subject like the other Jarvis tools do (questions + question_options + explanation).

**Reliability**
- Nothing is lost on refresh: job, pages and questions live in the database, so the page can be closed and reopened; it resumes polling.
- Per-page and per-question status pills (queued → in batch → ready → failed) with retry, plus a live counter bar for each stage.
- Missing-question protection: the page numbers and per-page question counts are checked, and a warning is shown if a page returned zero questions so it can be retried instead of silently skipped.

## Where it lives

- New route `/admin/aquavisionx`, titled **AquaVisionX**.
- Added to the admin menu under Tools, next to the other Jarvis batch tools.

## Technical details

- New tables `aquavision_jobs`, `aquavision_pages`, `aquavision_items` (RLS: admin-only, with GRANTs), holding batch ids, status, raw JSON and imported flags.
- New `src/lib/aquavisionx.functions.ts` server functions: `createJob`, `submitPageBatch`, `pollPages`, `submitAnswerBatch`, `pollAnswers`, `importJob`, `listJobs`, `getJob`, `retryPage`, `retryItem`, `deleteJob`. Batch submission reuses the existing `submitGeminiBatch` helper and the Gemini key pool in `src/lib/gemini-pool.ts`, so the 50% batch endpoint and key rotation behave exactly like the working iPad tool.
- Page images are rendered client-side (same approach as the working iPad batch page) so large PDFs never hit server limits; only one page image per request is uploaded.
- Strict JSON schemas both stages, with a repair retry on malformed JSON so accuracy stays high.
- Gating is enforced server-side too: `submitAnswerBatch` refuses to run unless all pages are `ready`, and `importJob` refuses unless every item has an answer and explanation — so the buttons can't be bypassed.
- Testing: run your PDF end-to-end through both stages on a temporary hidden course and verify counts, answers and explanations before you use it for real.
