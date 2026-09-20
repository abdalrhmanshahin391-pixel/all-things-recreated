# Aqua MCQ Gen Pro

A brand-new question factory. AquaVisionX and Question Generator stay exactly as they are.

Everything is organised in **groups**. You name a group (e.g. "TB"), upload a PDF into it, and it moves through four stages: Extraction → Final approval → Solve & explain → Import. Several groups can exist at once without mixing. Work is saved as you go, so leaving the page loses nothing. You can pause, resume, or delete a group at any time.

## New role: QA (quality assurance)

Same access as the committee role, plus the Final question approval screen. Admins also have it. Nobody else can see it.

## Stage 1 — Extraction

Before starting a group you choose:

- **The file**: a text PDF, or a PDF made of photographed A4 pages.
- **Provider and model**: Google (Gemini 2.5 Flash-Lite, 2.5 Flash, 2.5 Pro) or OpenAI (GPT-4.1 mini, GPT-4.1, GPT-5.6 Luna).
- **Mode**: Standard, or 50% batch (cheaper, slower).
- **Combination style** for Form B questions: statements inside the question with one correct combination answer, or statements as the options with several correct answers.
- **Custom instructions**: a free-text box for anything specific about that PDF.

How pages are read:

- Every page is sent **on its own**, never the whole PDF at once.
- Photographed pages are enhanced first (upscaled, straightened, contrast cleaned) and sent to the AI **as an image**, not as OCR text.
- The AI is told the two question shapes:
  - **Form A** — numbered stem, then options A–D.
  - **Form B** — numbered stem plus numbered statements 1,2,3,4 all belonging to the question, then options A–D that are combinations ("1,2", "all mentioned", …).
  - If statements 1–4 appear above options A–D, it is Form B.
- Anything incomplete (missing option, missing statement, question cut across the page break) is saved and marked **FLAGGED** in yellow rather than dropped. First and last question of each page get extra attention for split questions.

Keys: this tool has its own key slots, separate from other tools. You can save, change or remove a Google key and an OpenAI key, and pick the default model.

## Stage 2 — Final question approval

You send questions to approval as a whole group. Admins and QA open a split screen:

- **Left** — the exact PDF page the question came from: zoom with the mouse wheel, drag to pan, highlight an area, focus/scope on a region.
- **Right** — the question: edit the text, add or remove options, add a missing question to that page, delete a question, approve, or skip for now.
- Flagged questions: fill the missing parts yourself, ask the AI to complete just that one, or let the AI complete all flagged ones.

Also in this screen:

- **Duplicates** section — finds repeated questions, delete one by one or all at once.
- **Filters** — by page, flagged only, or all.
- **Approved list + log** — see what was approved, by whom and when, and pull any question back into approval.

Approved questions appear in Stage 3 straight away; you can start solving the ready ones or wait for the whole group.

## Stage 3 — Solve & explain

Modes: Standard or 50% batch. Answer source, chosen per group:

1. AI decides.
2. A source PDF you upload (AI fills the gap only when the source has no answer) — with a switch for "always prefer the source answer".
3. A key answer list you paste.

For Form B, the answer must be one of the printed combinations.

Explanation format (same layout as AquaVisionX, nothing else copied):

- Overview of the question
- Correct answer
- Why the correct answer is right
- Why the wrong ones are wrong
- Table of right/wrong with a short note each
- A trick or memory aid when one exists

If the answer is "all of the above", only the reasons each item is correct are shown — no "why wrong" section.

## Stage 4 — Import

Pick the destination course (and subject), review the count, import. Page images for that group are deleted automatically after a successful import.

## Delivery: phase by phase

1. **Phase 1** — groups, keys and models, page-by-page extraction with image enhancement, both modes, both forms, flagging, custom instructions.
2. **Phase 2** — Final approval: split screen, page viewer tools, editing, flag completion, duplicates, filters, approved log and return.
3. **Phase 3** — Solve & explain with the three answer sources and the explanation format.
4. **Phase 4** — Import into a course, plus cleanup of page images, stop/delete group polish.

You test each phase before the next starts.

## Technical notes

- New tables: `amg_groups`, `amg_pages` (page image in a private bucket + enhancement state), `amg_items` (form, stem, statements, options, flags, approval state, answer, explanation, duplicate hash), `amg_events` (approval log). RLS: admin + QA only, with GRANTs; `qa` added to the `app_role` enum and to the roles admin screen.
- Private storage bucket `amg-pages` for rendered page images, deleted on import.
- Page rendering and image enhancement happen in the browser (canvas) before upload, so pages arrive already high-resolution and deskewed; the model receives them as images.
- Server functions in `src/lib/aqua-mcq-gen.functions.ts` call Google/OpenAI directly with the tool's own stored keys; batch mode uses each provider's batch endpoint, standard mode the normal one. Strict JSON schemas per stage.
- New routes: `/admin/aqua-mcq-gen` (groups + extraction), `/admin/aqua-mcq-gen/$groupId/approval`, `/.../solve`, `/.../import`. All state lives in the database, so navigation never resets progress.
