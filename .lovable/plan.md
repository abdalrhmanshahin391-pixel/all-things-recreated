# MCQ Gen: new explanation style, re-explaining old questions, PDF sources, and quiz position fix

Five pieces of work, delivered in four stages so you can test each one.

## Stage 1 — The new explanation structure

Today's explanation is written as "why the correct answer is right / why the other options are wrong". That is replaced everywhere in MCQ Gen by the structure below. Nothing else about MCQ Gen changes.

Every explanation will have exactly these parts:

```text
Shigellosis — routes of transmission            <- short title line
Shigellosis is an intestinal infection caused by  <- 4-5 sentence intro: what the
bacteria of the genus Shigella. Its main mode of     topic is, the underlying
transmission is the fecal-oral route. Its very low   mechanism, the important
infectious dose makes person-to-person spread        clinical context, and the rule
especially important. Food and water can also ...   that decides the question

| Option            | Correct? | Explanation                                  |
|-------------------|----------|----------------------------------------------|
| Food              | Yes      | Food can be contaminated by an infected food |
|                   |          | handler or fecally contaminated water.       |
| Contact           | Yes      | Direct fecal-oral transfer is important      |
|                   |          | because only a small inoculum causes disease.|
| Water             | Yes      | Drinking or using fecally contaminated water |
|                   |          | can carry Shigella to the gastrointestinal   |
|                   |          | tract and produce infection.                 |
| Air-droplet       | No       | Shigella is an enteric, not respiratory,     |
|                   |          | pathogen and is not normally transmitted by  |
|                   |          | coughing, sneezing, or respiratory droplets. |

Why contact transmission is so important       <- one short "key point" block,
Shigella has a very low infectious dose, so ...    only when the question has a
- Day-care centres                                  detail worth expanding
- Schools

Easy way to remember
Shigellosis -> fecal-oral -> food + water + contact, not air-droplet

Answer: Food, contact, and water
```

Rules the model must follow:

- **One row per item.** For a normal A-D question, one row per option. For a combination question (numbered statements with printed A-D combinations), one row per **statement** — not per combination.
- The table displays only each option's or statement's wording. It never displays A/B/C/D or 1/2/3/4 prefixes.
- Each row says Yes or No and gives a professional, moderately detailed reason (usually 2-3 focused sentences with mechanism or clinical context where useful).
- **No "why the correct answer is right" and no "why the others are wrong" sections** — the table carries that.
- The key-point block is optional and short; the memory aid is one line.
- Ends with the final answer wording only. It never displays the A/B/C/D letter. For combination questions it names the correct statements rather than showing only their numbers.
- Professional and detailed without becoming long — roughly 220-320 words plus the table.

The explanation panel students see is updated to render this shape: title, intro, verdict table with green ✓ / red ✗ per row, key point, memory aid, answer line. Older explanations written in the previous format keep rendering exactly as they do now.

## Stage 2 — Rebuild explanations for questions already in a course

A new admin tool inside the course (Question Bank area): **Rewrite explanations**.

- Pick a subject (or the whole course), see how many questions it holds.
- Pick the provider and model — the same list MCQ Gen offers — plus optional custom instructions.
- Choose: rewrite all, or only questions that have no explanation.
- Press start: it works in small batches with a live counter, can be stopped, and can be resumed later.
- Each question's old explanation is **replaced** by a new one in the Stage 1 structure. Questions, options and correct answers are never touched.
- A short log shows anything that failed so you can retry just those.

## Stage 3 — Pull course questions back into MCQ Gen

Inside an MCQ Gen group (after the group exists), a new **Import from a course** action:

- Choose course → section → subject, see the question count.
- The questions are copied into the group as already-approved items (stem, options, correct answers, single/multi kept).
- They then go through Solve & explain exactly like extracted questions, so you can re-answer and re-explain them with any model.
- Re-importing them into the same subject updates those questions instead of creating duplicates.

## Stage 4 — PDF answer source, and the quiz position fix

**PDF source for solving.** On the Solve screen, "Answer from my source" gains a PDF upload next to the pasted text:

- Upload one or more PDFs (kept privately for that group only).
- The whole document is read and stored as searchable text; for each question the most relevant parts of the source are sent with the question, so the model answers from the source rather than guessing, even on long books.
- The existing switch "always prefer my source" keeps working, and the pasted-text and answer-key options are unchanged.
- Source files are deleted with the group.

**Losing your place in a quiz.** Right now, leaving the tab and coming back re-runs the access check, which reloads the questions and sends you to question 1. Fix:

- Your position, answers, submitted state and remaining time are saved continuously for that session and restored when you return.
- The reload is no longer triggered by simply refocusing the tab, so returning keeps you on question 15 exactly as you left it.
- Finishing a session or starting a new one clears the saved position.

## Technical notes

- `SOLVE_SYSTEM` in `src/lib/aqua-mcq-gen.functions.ts` is rewritten to emit `{title, intro, rows:[{item, correct, reason}], key_point, memory_aid, answer_line}`; the stored markdown is assembled server-side so `ExplanationPanel` and the import path stay markdown-based. `ExplanationPanel.tsx` gains parsing for the new headings while keeping the current parser as fallback.
- Stage 2 adds `amgRewriteExplanations` (admin-only server fn, batched over `questions` + `question_options`) plus a modal in the course admin question area.
- Stage 3 adds `amgImportFromCourse`, writing `amg_items` with `status: 'approved'`, `source_kind: 'course'` and the origin `question_id` so re-import upserts rather than duplicates.
- Stage 4 stores PDFs in a private `amg-sources` bucket, extracts text with the existing `unpdf` dynamic-import path used by extraction, saves chunks in a new `amg_sources` table, and selects relevant chunks per question by keyword overlap. Quiz state persists to `sessionStorage` keyed by course/mode/subject set, and the access/questions effects key off `user.id` instead of the changing user object.
