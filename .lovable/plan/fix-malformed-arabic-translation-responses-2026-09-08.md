# Fix malformed Arabic translation responses

The translation request reaches Gemini, but Gemini occasionally returns malformed JSON. The current fallback parser then throws the raw `Unexpected token … is not valid JSON` message shown beside the language button.

## Changes

- Change the requested translation shape to a simpler, strict structure: translated stem, explanation, and an array of `{ id, text }` option entries.
- Add Gemini response-schema guidance where supported so quotes and Arabic text are encoded as valid JSON.
- Harden parsing so every parse attempt is contained; raw JSON or provider syntax errors will never appear in the question interface.
- Validate the returned fields and option IDs before caching or displaying them, while retaining the original English text for any missing option.
- If the first response is malformed, make one bounded recovery attempt; if that also fails, show a short friendly message and let the student retry from the same question.

## Scope preserved

- Continue using the website’s configured Gemini key pool and permanent shared translation cache.
- Keep Arabic translation available to students with course access.
- Do not change answers, grading, question content, course permissions, or content protection.

## Verification

- Check valid object and array option responses, malformed/truncated JSON, Arabic punctuation and quotation marks, and missing fields.
- Confirm a malformed response no longer exposes `Unexpected token` in the interface.
- Run the project checks and verify translation still switches cleanly between consecutive questions.