# AquaVisionX: keep numbered statement lists inside the question

## The problem

On some past-paper questions the printed layout is two levels:

```text
19. Which are typical for TB pleurisy?
    1. predominance of lymphocytes
    2. low glucose level
    3. relative density of the fluid 1015 and more
    4. protein level 30 g/l and more
    a) 1.2   b) 1.3.4   c) 1.2.3.4   d) 3.4
```

Right now the reading stage keeps only "Which are typical for TB pleurisy?" as the
question and turns a)–d) into the choices. The numbered statements are dropped, so on
the site the student sees choices "1.2", "3.4" with nothing to match them to — the
question is unsolvable.

## The fix

One change only, in the wording of the instruction sent to the AI when it reads a page.
No change to logic, JSON shape, batching, solving, or import.

Added rules to the page-reading instruction:

- When the lettered choices are combinations of numbered statements (1, 2, 3, 4…), the
  numbered statements are part of the question, not choices. Copy them verbatim into the
  question text, each on its own line, right after the question line.
- The choices then stay exactly as printed (a) 1.2, b) 1.3.4, …).
- Normal questions, where the letters carry the real answer text, are unchanged.

This adds a few words of instruction and no extra requests, so the cost stays the same.
The statement lines move from being dropped to being part of the question text, which is
a small output-token increase only on those questions.

## Verification

Run the same past paper page (the TB pleurisy page in the screenshots) through stage 1
in AquaVisionX and confirm the stored question reads:

```text
Which are typical for TB pleurisy?
1. predominance of lymphocytes
2. low glucose level
3. relative density of the fluid 1015 and more
4. protein level 30 g/l and more
```

with choices a) 1.2, b) 1.3.4, c) 1.2.3.4, d) 3.4, then solve one item and check the
answer/explanation still come back correctly. Also confirm an ordinary question on the
same paper is untouched.

## Technical details

- File: `src/lib/aquavisionx.functions.ts`, constant `READ_SYSTEM` only.
- The existing 70 already-imported questions are not rewritten; the fix applies to new
  jobs. Re-running the affected paper and re-importing is the way to correct them.
