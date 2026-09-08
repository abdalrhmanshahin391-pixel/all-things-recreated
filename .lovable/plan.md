# Keep case questions in order

Some subjects (like "Case 1") are sets of linked questions that must be shown in their original sequence, never scattered among other questions. Today all selected questions are mixed together, so cases break apart.

## What you get

- A new **Keep in order (case)** switch on each subject in the course question manager, next to the existing access controls.
- When a subject has it on:
  - Its questions always appear together as one block, in the exact order you arranged them.
  - The block keeps its place according to the subject's position in the list.
  - This applies in study, session and exam modes, and also when the subject is combined with other subjects.
- Answer choices keep shuffling as they do today (unchanged).
- Subjects without the switch behave exactly as before.
- Optional small "Case" label on the question card so students know it is a linked set.

## Technical notes

- Migration: add `ordered boolean not null default false` to `public.subjects`. Existing read/write policies already cover it; no new grants needed.
- `src/routes/admin.questions.tsx`: load `ordered`, render a toggle per subject, update the row on change.
- `src/routes/courses.$courseId.run.tsx`: fetch `subjects(id, sort_order, ordered)` for the selected subject ids, then build the final list as subject-grouped blocks ordered by subject `sort_order`, with each ordered subject's questions sorted by question `sort_order`. Non-ordered subjects keep current behaviour. Option shuffling logic untouched.
- Filters (`flagged`, `incorrect`) still apply first; ordering is applied to whatever remains.
