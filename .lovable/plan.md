# Add "Answer from the book" to source-based solving

When a source (PDF or pasted text) is attached to an MCQ Gen group, the explanation keeps the exact structure we agreed on. The only change: if the AI actually finds the answer inside the provided source, it adds one short line at the very end.

## Behaviour

- Source attached and the answer is found in it:
  the normal explanation (intro, verdict table, key point, memory aid, Answer line) plus a final line:
  `Answer from the book: <the answer as the source states it>`
- Source attached but the answer is not in it: the explanation looks exactly as it does today, with no extra line.
- No source attached: nothing changes at all.

The extra line is short (one sentence or the source's own wording), never a second explanation.

## Technical details

In `src/lib/aqua-mcq-gen.functions.ts`:

- Extend `SOLVE_SYSTEM` JSON schema with two optional fields:
  `"source_found": true|false` and `"source_answer": "short wording from the source"`.
  Rule text: set `source_found` true only when a REFERENCE SOURCE block was supplied and it clearly supports/states the answer; otherwise false and omit `source_answer`. Never invent it, never quote more than one or two sentences.
- In `buildNewExplanation`, after the existing `**Answer:**` line, append
  `**Answer from the book:** <source_answer>` only when `source_found` is true and `source_answer` is non-empty.
- No changes to the answer labels, combo-set validation, grading, import, or the rest of the prompt rules.

Both call sites (group solve and the single-question re-solve/rewrite path) use the same `SOLVE_SYSTEM` and builder, so they inherit the behaviour automatically.
