# Reference-book mode for AquaVisionX and Patch iPad ProX

Add an optional "Answer from a textbook" switch to both tools. Everything that works today keeps working untouched; the switch only adds an extra instruction when questions are sent to Gemini for solving/explaining.

## What you'll see

On both pages, above the solve/answer step:

- A toggle: **Use a reference textbook** (off by default).
- When on: a text box to type the book, e.g. `Robbins & Cotran Pathologic Basis of Disease`, plus a **Save book** button.
- After saving, a green confirmation line: "Answers will follow: Robbins & Cotran Pathologic Basis of Disease" so you know it took effect.
- The book is stored with the job, so it survives refresh and applies to every question of that job (including retries and repair passes).
- Toggling off (or clearing the book) instantly returns to the current behaviour.

## What it changes in the AI request

When the toggle is on and a book is saved, each solving request (image question in ProX, text question in AquaVisionX) gets an extra instruction block:

- Answer and explain strictly according to the named textbook.
- Use that book's terminology, classifications and cut-off values.
- Mention the book by name in the Concept section.
- If the book genuinely disagrees with the printed key, still pick the option the book supports.

Nothing else in the prompts, JSON shape, batching, cutting, or import changes.

## Technical details

- Migration: add nullable `reference_book text` to `aquavision_jobs` and `patch_prox_jobs`. No other schema change.
- New helper `buildReferenceBlock(book)` in each tool's server file; prepended to the existing user text next to `subjectsBlock` (ProX: batch solve, `solveSingleProxImage` repair pass; AquaVisionX: stage-2 solve). Empty/absent book returns an empty string, so current behaviour is byte-identical when off.
- New server fn `setReferenceBook({ jobId, book })` in each `.functions.ts`, admin-gated like the existing functions; saves trimmed text or null.
- UI added to `src/routes/admin.aquavisionx.tsx` and `src/routes/admin.patch-ipad-prox.tsx` only — a switch, an input, a save button, and the saved-state line.
- Jarvis iPad v2 is not touched.
