# Add pictures to questions

## What you get

On the Add Question page and in the edit box for an existing question:

- An **Add picture** button: choose an image from your device, see a small preview, and remove or replace it before saving.
- The picture is stored privately (same protected place the imported exam images already use), so only people with access to the course can see it.

For students:

- The picture appears at the top of the question card, and the typed question text stays visible under it when you wrote both.
- Today a question that has a picture hides its text completely. That stays true only when there is no text; if a question has both, both are shown — in the study run, the exam run, and the review of wrong answers.

## Not changing

Answer choices, the new multiple-answer switch, explanations, the PDF/AI import flows, and everything that already works for image-only imported questions.

## Technical details

- `src/routes/admin.questions.tsx` (add form) and `src/components/admin/QuestionListEditor.tsx` (edit modal): file input → `compressImage` from `@/lib/image-compress` → upload to the `question-images` bucket under `manual/<timestamp>-<rand>.<ext>` → save the returned path in `questions.image_url`. Removing the picture sets `image_url` to null and deletes the stored object when it lives under `manual/`.
- Preview uses the existing `QuestionImage` component (signed URL, private bucket).
- `src/routes/courses.$courseId.run.tsx`: in the three cards that render `q.image_url`, render the image and, when `q.stem` is non-empty, the stem text underneath.
- No database or storage change needed: `questions.image_url` already exists and admin-only write policies on `question-images` are already in place.
