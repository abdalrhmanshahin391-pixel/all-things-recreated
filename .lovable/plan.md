# Make every explanation-table row judge the option itself

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

## Scope

Only the wording rules for newly generated and rewritten explanations will change. The agreed structure, answer calculation, sources, questions, options, and all other MCQ Gen behavior will remain unchanged.

## Verification

Generate one ordinary question and one combination question, then confirm every table row independently explains the medical truth of that item and never discusses answer-selection strategy.
