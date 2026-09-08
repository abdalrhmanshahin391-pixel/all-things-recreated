# Arabic translation for questions, answers and explanations (using your Gemini keys)

Add an Arabic button on every question card. A student taps it, the translation is generated once with **your own Gemini keys** (the same pool AquaVisionX and the summary tools already use), the Arabic version is saved, and from then on anyone who opens that question sees it instantly with no new AI work.

## What the student sees

- A small "العربية / Arabic" toggle at the top of the question card (study, session and exam review screens).
- First tap: a short "translating…" state, then the question text, all answer choices and the explanation appear in Arabic, right-to-left.
- Tapping again switches back to English; the choice is remembered while they keep studying.
- Already-translated questions open in Arabic immediately.
- Content protection is unchanged: the Arabic text renders inside the same protected block, so the watermark, no-copy / no-screenshot / no-print rules and the bilingual protection notice all still apply.

## What it costs

Because it runs on your own Gemini keys, **it costs no Lovable credits at all** — only your Gemini quota.

- One question (text + choices + explanation) is roughly one small Gemini request, well under a second of quota.
- The existing key pool already paces requests to stay inside the free-tier limits, so busy moments queue instead of failing.
- Each question is translated once and stored forever, so a 500-question course is at most 500 small requests, ever.
- If Gemini quota is exhausted, the student sees a plain "translation is busy, try again in a moment" message — never a broken card.

## Technical notes

- New table `public.question_translations`: `question_id` (FK, cascade), `lang` ('ar'), `stem`, `explanation`, `options` jsonb (option id to Arabic text), `created_at`, unique on `(question_id, lang)`. GRANT SELECT to `authenticated`, GRANT ALL to `service_role`; RLS allows authenticated reads, writes only through the server function.
- New server function `translateQuestion` in `src/lib/question-translate.functions.ts` with `requireSupabaseAuth`:
  1. Return the cached row if it exists.
  2. Otherwise load the question and its options through `context.supabase` so RLS enforces course access.
  3. Translate with `getGeminiPool` + `callGeminiJSON` from `src/lib/gemini-pool.ts` (same keys, pacing, model fallback as AquaVisionX), asking for strict JSON: `stem`, `explanation`, and one Arabic string per option id. Medical terms keep the English term in brackets.
  4. Save with the admin client and return the row.
  - Quota/pool errors are returned as a friendly message, never silently faked.
- `src/routes/courses.$courseId.run.tsx`: add `lang` state plus a small toggle; when Arabic is on, swap the displayed stem, option texts and the string passed to `ExplanationPanel`, and set `dir="rtl"`. Grading, option ids, flags, notes, imports and admin editing all keep using the original English rows — translation is display only.
- No change to AquaVisionX, imports, backups or the admin question editor.

## Verification

Typecheck and build, then translate one real question in the preview: confirm Arabic renders right-to-left inside the protected card, the watermark is still on top, copying is still blocked, and reopening the question loads the saved Arabic instantly.
