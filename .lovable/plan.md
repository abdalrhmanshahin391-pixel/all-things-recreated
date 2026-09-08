# Protect the wrong-answer review screen

## What's wrong

When a student finishes an exam and taps "Review wrong answers", that screen is the only part of the solving flow with no copy protection and no watermark. The study card and the exam card are both wrapped in protection; the review card is not, and the bilingual protection notice is missing there too.

## What changes

- The wrong-answer review card gets the same protection wrapper used by the exam card, so the watermark overlay, copy/right-click blocking and screenshot deterrence apply while reviewing.
- The bilingual protected-content notice appears at the top of the review screen, matching the course page and the solving screen.
- Nothing else changes: navigation buttons, explanations, images, answer colours and the results screen stay exactly as they are.

## Technical details

- `src/routes/courses.$courseId.run.tsx`, review branch (around lines 420–454): add `<ProtectionNotice className="mb-6" />` under the header row and wrap `<ReviewCard …/>` in `<ProtectedContent context="exam" scope="card">`.
- Both components are already imported in this file; no new files or database work.
