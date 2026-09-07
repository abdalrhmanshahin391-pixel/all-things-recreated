# AquaVisionX: preserve every numbered statement in combination questions

## Fix

Change only AquaVisionX’s Stage 1 page-reading instruction so the rule applies to every question on every attached PDF, not just one example.

For each question, Gemini must first distinguish between:

- **Numbered statements**: `1. Lung cancer`, `2. Sarcoidosis`, `3. Metastasis`, etc. These belong inside the question text.
- **Lettered combination answers**: `a) 1,2`, `b) 2,3,4`, `c) 1,3,4`, etc. These remain the selectable A–D options.

The instruction will explicitly require:

1. Copy the main question line and every numbered statement beneath it into `stem`, in order and verbatim.
2. Put only the lettered number combinations in `options`.
3. Apply this to every matching question on the page, including dot-, comma-, plus-, slash-, and space-separated combinations.
4. Before returning JSON, verify that every number referenced by a combination option has its corresponding numbered statement inside the stem.
5. Never return combination-only options when their statement text is visible on the page.

A compact generic example will show the exact required JSON structure so the model cannot interpret the numbered statements as discarded answer choices.

## Scope

- Keep the same two-stage AquaVisionX process.
- Keep the existing JSON shape, batching, solving, importing, and cost-saving behavior.
- Do not change question display or any unrelated feature.
- No additional AI request is added; only the Stage 1 wording changes slightly.

## Verification

Run the uploaded lung-tuberculoma page through the same Stage 1 reading prompt and confirm the result contains:

```text
Lung tuberculoma must be differentiated from:
1. Lung cancer
2. Sarcoidosis
3. Metastasis
4. Benign tumor
```

with A–D remaining number-combination choices. Also test an ordinary question to confirm its normal text options remain unchanged.

The correction applies to newly processed jobs. Already imported incomplete questions must be rerun through AquaVisionX to recover text that was omitted during their original reading.
