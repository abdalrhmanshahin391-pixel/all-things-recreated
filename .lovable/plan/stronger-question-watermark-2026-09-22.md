# Stronger question watermark

## Changes
- Extend the Content Protection watermark-strength control from its current 40% maximum to 100%.
- Remove the hidden low-opacity cap so the saved strength visibly affects the watermark across its full control range.
- Keep the watermark readable rather than overwhelming by mapping the control smoothly, with the current setting becoming moderately stronger and higher settings available when needed.
- Add a dedicated watermark pass through the upper question-stem area so the question itself is marked, not only the answer choices and lower card area.
- Preserve the existing account identity, trace code, theme-aware colors, fingerprinting, protection switches, and all other question behavior.

## Verification
- Check a protected question in light and dark themes at low, current, and maximum strength.
- Confirm the watermark crosses the question stem and answers without blocking reading or clicks.
- Confirm the selected strength saves and remains after refresh.
- Check phone, iPad, and desktop layouts, then verify the app builds cleanly.

## Technical details
- Update the admin range and watermark opacity normalization together so their values remain consistent.
- Adjust the tiled watermark placement/density to guarantee a visible identity block near the top of each protected question card.
- No database change is required because the existing saved opacity field already accepts the value.
