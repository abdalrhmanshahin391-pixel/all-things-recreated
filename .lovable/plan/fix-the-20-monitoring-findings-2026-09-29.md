# Fix the 20 monitoring findings

I checked the code: the problems are real (the Forge cleanup, the open NotebookLM export, package over-granting, the coupon price overwrite, the JSON parser change and the missing package labels are all still there). Your database is paused right now, so the database fixes can only run after you resume it.

## Part A — code-only fixes (can be done now)

1. **MCQ Forge overwriting live questions** — remove the automatic "cleanup" sweeps that run on page open and on import. Forge will only ever write to questions it created itself.
2. **NotebookLM export open to everyone** — show the button only to admins, and make the export refuse anyone who is not an admin.
3. **"Pick any N" packages** — the payment confirmation will grant only the courses the student picked, and put lecture courses in the lecture list (same as the webhook already does).
4. **Coupon lowering the price for everyone** — a coupon checkout will use a one-off discounted price and never save it as the course's normal price. Add a repair step that resets any course whose saved price no longer matches its listed price.
5. **Clinical context removed from questions** — stop running the "preamble remover" on what students see; only obvious filler like "According to the text," is removed, and never clauses mentioning patients, children, conditions, etc.
7. **Fake correct answer from Extract** — detected-but-unsolved questions are marked "needs answer" and cannot be saved to a course until solved.
14. **AI JSON parsing** — restore the repair that turns raw line breaks inside answers into proper escaped line breaks (keeps multi-line statements working).
15. **Counts past 1,000 questions** — read question counts and restores in pages of 1,000 and restore in one bulk update.
16. **Package card labels** — add the missing "Total investment", "View package" and per-student price texts in English and Arabic.
17. **Coupon used twice** — redeem a 100%-off coupon only once when clicking pay.
18. **AquaVisionX sorting box** — reset the topic list and PDF whenever a different job is opened.
19. **Question pictures** — only delete the old picture after the question is actually saved.
20. **Stale Arabic translations** — clear a question's saved translation whenever it is edited.

## Part B — needs the database resumed first

6. **English Committee role** — let the database's committee permission checks also accept the English committee members.
8, 9. **Missing columns** (semester, About headline, package original price, committee team visibility) — apply the pending changes.
10, 11, 12. **Lecture files** — create the lecture PDF storage, let enrolled students open course-material PDFs, let lecture staff upload/remove files for their courses, and add a PDF field to the admin lecture form.
13. **"Permission denied" on role/announcement checks** — re-grant access to those database helpers.

## Technical notes
- Files: `aqua-mcq-forge.functions.ts`, `course-export.functions.ts`, `courses.$courseId.index.tsx`, `payments.functions.ts`, `checkout.success.tsx`, `courses.$courseId.checkout.tsx`, `question-format.ts`, `question-generator.*`, `admin.question-generator.tsx`, `aqua-mcq-gen.functions.ts`, `PackagesStrip.tsx`, `site-content-catalog.ts`, `admin.aquavisionx.tsx`, `QuestionImagePicker.tsx`, `QuestionListEditor.tsx`, `admin.questions.tsx`, `admin.lectures.tsx`.
- Part B is one migration: `can_manage_committee*` also checks `site_content.committee_en_user_ids`; pending ADD COLUMN IF NOT EXISTS; `GRANT EXECUTE` on `has_role`, `my_announcements`, `can_manage_committee` to authenticated; storage policies for `lecture-pdfs`/`lecture-videos` via `can_edit_lecture_course` and course-material reads; bucket created with the storage tool.
