# Fix Arabic translation for students and stale text between questions

Two separate bugs, both confirmed.

## 1. "Arabic translation is not set up yet" for non-admins

The translation step looks up the site's AI key using the student's own account. That key table is admin-only, so students get back an empty list and see the "ask an admin to add a key" message. Admins see it work because they can read the table.

Fix: read the site key with the server's own privileged access inside the translation step, after the student's access to the question has already been checked. Nothing about who may translate changes — the student still must have access to the question, and the key is never sent to the browser.

## 2. First question's Arabic text sticks on the next questions

When moving to the next question, the card keeps the previously translated text on screen until (and unless) a new translation arrives, because the stored translation is not cleared when the question changes.

Fix: clear the held translation as soon as the question changes, so a question either shows its own Arabic text or falls back to English while loading. The Arabic/English choice stays as the student set it.

## Technical notes

- `src/lib/question-translate.functions.ts`: keep the RLS-scoped `context.supabase` for the cache lookup and the question read; build the Gemini pool from the service-role client (`getGeminiPool(supabaseAdmin)`), loaded inside the handler.
- `src/hooks/useQuestionTranslation.ts`: reset `data`/`error` on `questionId` change (and on cache miss) before fetching; keep the in-memory + in-flight caches.
- No database, schema, grading, or protection changes.

## Verification

Typecheck and build, then confirm in preview: a non-admin account can translate, and moving through questions 1 → 2 → 3 shows each question's own Arabic text.
