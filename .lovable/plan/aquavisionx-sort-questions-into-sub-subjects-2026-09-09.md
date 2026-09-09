# AquaVisionX — sort questions into sub-subjects

Add an optional step that splits one paper into several sub-subjects (e.g. Arrhythmias, Valvular disease) instead of dumping every question into one subject. Everything else in the tool stays exactly as it is.

## How it will work

**1. Choose the sorting mode (before Stage 2)**

A new small panel next to the solve button with four choices:

- **No sorting** — the current behaviour, all questions go into the one chosen subject. This stays the default so nothing changes unless you ask for it.
- **From a PDF** — upload a contents/syllabus PDF; its topic list becomes the allowed sub-subjects.
- **From text** — paste a list of topics, one per line.
- **Let AI decide** — the AI groups the questions itself into a sensible set of topics.

**2. Sorting happens inside Stage 2**

Each question already gets one solve request; that same request also returns its topic. No extra requests, no extra cost beyond a few tokens.

- With a PDF/text list, the AI must pick one topic from your list (or `Other` if nothing fits).
- With AI mode, it proposes a short topic name; near-identical names are merged automatically afterwards.

**3. Review before import**

The question list shows each question's topic with a dropdown to change it, plus a "rename topic everywhere" control and a counter per topic ("Arrhythmias — 12 questions"). Nothing is written until you press Import.

**4. Import**

Import creates one subject per topic inside the chosen group, named after the topic, and files each question into its subject in order. If sorting is off, import behaves exactly as today (single chosen subject). Solved-only import and the failed/needs-repair rules stay unchanged.

## Cost

Roughly **0.5–1 credit** of build work is not how this is billed — the running cost per paper is what matters:

- Sorting adds ~20–40 output tokens per question to a request that already exists, so the Gemini batch cost rises by well under 5% per paper.
- A contents PDF is read once per job (one cheap request), not per question.
- Practically: a 60-question paper costs about the same as today — the added spend is a fraction of a cent.

## Technical details

- New job columns: `sort_mode` (`none | pdf | text | ai`), `sort_topics` (list), plus reuse of the existing private resource-upload path for the contents PDF; admin-only grants/policies as with the other AquaVisionX tables.
- New item column `topic` (nullable text) with an index on `(job_id, topic)`.
- `submitAnswerBatch`: extend `SOLVE_SYSTEM` and the response schema with a required `topic` field only when sorting is on; combination/printed-set validation is untouched.
- New server functions: `setAqvSortMode` (accepts pdf/text/ai and extracts topics from a contents PDF via one Gemini call), `setAqvItemTopic`, `renameAqvTopic`.
- `importJob`: when `sort_mode !== 'none'`, look up or create a subject per topic inside `job.group_id`, then insert questions with that `subject_id`; ordering, dedupe (`subject_id,stem_hash`) and imported flags work as they do now.
- UI changes confined to `src/routes/admin.aquavisionx.tsx`: sorting panel, topic dropdown per item, topic summary bar.
- Verify with the uploaded Cardiology PDF end-to-end in all four modes, plus a typecheck and build.
