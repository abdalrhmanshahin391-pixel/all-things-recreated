# More choices and multiple correct answers on the Add Question page

## What changes

On the admin **Question and four choices** form (the one in your screenshot):

- The four fixed answer boxes become a flexible list: start with four, **Add choice** up to ten (A–J), remove any choice down to a minimum of two.
- A **More than one answer** switch. When off, "Right" works as today (one choice only). When on, "Right" becomes a tick box on each choice, so any number of them can be marked correct.
- Saving stores the question as single-answer or multiple-answer accordingly, so students see radio buttons or "More than one answer — select all that apply" tick boxes, and multi-answer questions are graded only when the whole set matches.
- Validation updates: at least two filled choices, all texts different, at least one marked correct (and at least two when the multi switch is on).

The existing question editor below the form already lets you add choices; it gains the same **More than one answer** switch and per-choice tick boxes, so older questions can be converted either way.

## Not changing

Course/section/subject pickers, explanation field, image and PDF/AI import flows, and everything students already see for ordinary A–D questions.

## Technical details

- `src/routes/admin.questions.tsx`: replace the fixed `labels` record state with an array of `{ text, is_correct }`, plus an `answerMode` state; write `answer_mode` on the `questions` insert and generate labels A–J by index for `question_options`.
- `src/components/admin/QuestionListEditor.tsx`: load and save `answer_mode`, and make the correct-marker a toggle when the mode is multiple (currently it always forces exactly one).
- No database change needed — `questions.answer_mode` already exists and the student runner already handles `multiple`.
