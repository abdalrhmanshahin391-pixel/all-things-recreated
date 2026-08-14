# Fix the Question Generator + add "check your spam folder"

## 1. Question Generator (/admin/question-generator)

Symptom: Gemini appears to run, the log fills up, but no questions ever appear.

What the code shows today:
- The saved Gemini key exists (one key, slot 1) but has **no preferred model**, so this tool falls back to the alias `gemini-flash-lite-latest`.
- Every other AI tool on the site (AquaVisionX, Jarvis batch, Patch iPad ProX) uses concrete model IDs (`gemini-2.5-flash-lite`, `gemini-2.5-flash`). Only this tool uses the alias — the most likely reason it silently produces nothing after the transfer. This is the leading suspect, not yet proven, so step 1 of the work is to confirm it before changing behaviour.
- When Gemini returns an empty reply, the page treats it as "cut off", splits the batch and retries forever — so the real reason never reaches the screen. That masking is a confirmed bug in the run loop regardless of the model question.

Planned work:
1. Confirm the cause first: run one real call with the stored key against both the alias and the concrete model IDs and read the exact API response (status, `finishReason`, empty-text case).
2. Point Gemini at a known-good model with a fallback chain (`gemini-2.5-flash-lite` -> `gemini-2.5-flash`), and keep the admin's saved preferred model when they set one explicitly.
3. Stop the silent loop: when a reply comes back empty or blocked, show the real cause in the run log (HTTP status, `finishReason`, safety block, quota) instead of an endless "splitting and retrying".
4. Cap the retry/split loop so a run always ends with a clear result instead of grinding.
5. Make the "Test" button report which model actually answered, so a broken model is visible in one click.
6. Re-check the OpenAI path is intact (key status, structured-output fallback) and that the page's key panel reflects reality.
7. Verify end to end in the preview: paste text, run in each mode, confirm questions come back and save to a subject.

## 2. "Check your spam folder" wording

- Add the spam-folder line to the **signup verification email** itself and keep the tone consistent across the other auth emails where it fits.
- Add it to the **sign-in error** shown when an account isn't verified yet (currently only says the email isn't verified).
- Keep/emphasise the existing spam note on the post-registration "Check your inbox" screen so the wording matches everywhere, in both English and Arabic.

## Technical notes

- Files: `src/lib/question-generator.server.ts` (model IDs, fallback, error surfacing), `src/lib/question-generator.functions.ts` (model choice), `src/routes/admin.question-generator.tsx` (retry cap, log clarity, test output), `src/lib/email-templates/signup.tsx`, `src/routes/login.tsx`, `src/routes/register.tsx`, `src/i18n/locales/en.json` and `ar.json`.
- No database or schema changes; the existing `admin_ai_keys` row is reused.
