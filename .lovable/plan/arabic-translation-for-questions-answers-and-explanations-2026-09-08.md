# Arabic translation for questions, answers and explanations

Add an Arabic button on every question card. A student taps it, the AI translates that question once, the Arabic version is saved, and from then on anyone who opens that question sees the Arabic instantly with no new AI work and no extra cost.

## What the student sees

- A small "العربية / Arabic" toggle at the top of the question card (study, session and exam review screens).
- First tap: a short "translating…" state, then the question text, all answer choices and the explanation appear in Arabic, right-to-left.
- Tapping again switches back to English. The choice is remembered while they keep studying.
- Already-translated questions open in Arabic immediately.
- Nothing about content protection changes: the Arabic text renders inside the same protected block, so the watermark, the no-copy / no-screenshot / no-print rules and the bilingual protection notice all apply exactly as they do now.

## What it costs

Translation happens once per question, then it is stored forever, so cost stops after the first read.

- A typical question (stem + choices + explanation) is a small AI request. Expect roughly **0.02–0.05 credits per question**, i.e. **around 1–3 credits per 100 questions**, once.
- A 500-question course therefore costs roughly **10–15 credits in total**, spread over time as students actually open questions — never repeated.
- These are estimates; long explanations cost slightly more, short ones less. I can add a monthly cap later if you want a hard ceiling.

## Technical notes

- New table `public.question_translations`: `question_id` (FK, cascade), `lang` ('ar'), `stem`, `explanation`, `options` jsonb (map of option id to Arabic text), `created_at`, unique on `(question_id, lang)`. GRANT SELECT to `authenticated`, GRANT ALL to `service_role`; RLS allows authenticated SELECT, writes only through the server function.
- New server function `translateQuestion` in `src/lib/question-translate.functions.ts`, with `requireSupabaseAuth`:
  1. Return the cached row if it exists.
  2. Otherwise load the question and its options as the signed-in user (RLS enforces course access — no access, no translation).
  3. Call Lovable AI (`openai/gpt-6-astra` via the Responses API, streamed and consumed server-side, low reasoning) with a strict JSON schema: translated stem, explanation, and one string per option id. Medical terms keep their English term in brackets.
  4. Write the row with the admin client and return it.
  - Gateway errors are surfaced plainly (out of credits / rate limited), never as a fake translation.
- `src/routes/courses.$courseId.run.tsx`: add `lang` state plus a `QuestionLanguageToggle`; when Arabic is active, swap the displayed stem, option texts and the string passed to `ExplanationPanel`, and set `dir="rtl"`. Grading, answer ids, flags, notes, imports and admin editing keep using the original English rows — translation is display only.
- No change to AquaVisionX, imports, backups or the admin question editor.

## Verification

Typecheck and build, then translate one real question in the preview and confirm the Arabic renders right-to-left inside the protected card, the watermark is still on top, copying is still blocked, and a second open loads instantly from the saved copy.
