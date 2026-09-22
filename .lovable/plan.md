# Correct table explanations and preserve long-running progress

## Change

Update the MCQ Gen explanation instructions so each table row treats its option or statement as a standalone true/false medical question.

- Explain **why the option or statement itself is medically correct or medically incorrect**.
- Do not explain why it was selected, excluded, preferred, or not chosen.
- Do not compare it with another option unless that comparison is medically necessary to establish whether the statement is true.
- Keep the existing Yes/No verdict and the moderately detailed 2–3 sentence explanation.
- Apply the same rule to ordinary options and numbered statements in combination questions.

Example:

```text
| Air-droplet | No | Shigella is an enteric pathogen transmitted primarily by the fecal–oral route. Respiratory droplets are not a recognized route of Shigella transmission. |
```

Not:

```text
| Air-droplet | No | This option is not chosen because food, water, and contact are the correct answers. |
```

## Leave and resume later

Make both long-running processes resumable after leaving or refreshing the page.

### MCQ Gen — Solve & Explain

- Keep every completed question saved immediately, as it is now.
- Remember that solving was active and restore its selected answer source and source preference when the page is reopened.
- Recalculate progress from saved questions, so completed questions are never solved again.
- Show **Continue solving** when approved questions remain unfinished; continuation starts with the next unsolved question.
- Keep **Stop** as an intentional pause. Closing the page must not erase completed work.

### Course — Rewrite explanations

- Save the selected subject, provider, model, rewrite mode, completed count, failures, and active/paused state.
- When the admin returns to that subject, restore the progress panel and show **Continue rewriting**.
- Continue only with explanations not yet converted during that run; never repeat successful work.
- Keep failures visible and retryable without losing completed explanations.
- Distinguish clearly between paused, failed, and completed runs.

## Admin controls on the student question screen

Add an admin-only actions control to each question while an admin is using the normal course question screen. Students will never see it.

- **Edit question:** open the complete question editor for the current question, including its wording, image, answer mode, options, correct answers, and explanation. Save the changes and refresh that question in place without losing the admin's quiz position.
- **Re-solve & explain:** let the admin select an MCQ Gen provider and model, confirm the action, and regenerate only that question's answer and explanation using the agreed explanation structure.
- Re-solving replaces that question's correct answer and explanation only after a valid result is received. A failed AI response leaves the existing answer and explanation unchanged.
- Protect every save and re-solve operation with server-side admin verification, not only a hidden button.

## Scope

The table wording, progress/resume behavior, and admin-only per-question controls are the only functional changes. Sources, ordinary student controls, grading behavior, and other MCQ Gen behavior remain unchanged.

## Technical details

- Use saved question rows as the source of truth for completed solve and rewrite work.
- Store lightweight run metadata to reconstruct each progress panel after navigation or refresh.
- Browser requests will not continue after the page closes; work resumes safely in small batches when the admin returns.
- Reuse the existing full question editor behavior and the same explanation generator, rather than creating conflicting editing or explanation formats.

## Verification

- Generate one ordinary and one combination question; every row must independently explain the item's medical truth without discussing answer-selection strategy.
- Start Solve & Explain, leave after a batch, return, and continue from the next unsolved question with the correct saved count and settings.
- Start Rewrite explanations, leave after a batch, return to the subject, and continue with restored settings, progress, and failures without repeating completed work.
- As an admin, edit and re-solve a question from the student question screen; confirm the screen updates in place and retains its position.
- As a student, confirm the admin control is absent and its protected actions cannot be called.
