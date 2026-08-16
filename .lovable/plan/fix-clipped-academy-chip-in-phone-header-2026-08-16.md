# Fix clipped "Academy" chip in phone header

## Problem
On mobile, the wordmark in the header is wrapped in a link constrained to `max-w-[55%] overflow-hidden`. Because the active brand style (e.g., gradient-q-badge or academy-lock) appends an "ACADEMY" chip, the right side of the chip is clipped, leaving only the partial "AC" visible.

## Proposed fix
1. In `src/components/SiteHeader.tsx`, change the brand wrapper's mobile width constraint from a fixed percentage to the remaining space after the right cluster.
   - Replace `max-w-[55%] overflow-hidden sm:max-w-none` with `max-w-[calc(100%-5rem)] overflow-hidden sm:max-w-none`.
   - Keep the right cluster as `shrink-0` with the language and menu buttons so it cannot be pushed off-screen.
2. Verify the brand's `shrink-0` from `skin.brandWrap` does not fight the new width; if needed, remove the `shrink-0` from `brandWrap` in `header-designs.ts` or override it in the brand link so the brand can shrink to fit when the chip is wider.
3. Visually test on mobile viewport (390–430 px) in the live preview to confirm the full "ACADEMY" chip is visible and the menu button remains tappable.

## Out of scope
- No other header layout changes.
- No new components or backend changes.
- No changes to brand styles or the wordmark SVG/text.
