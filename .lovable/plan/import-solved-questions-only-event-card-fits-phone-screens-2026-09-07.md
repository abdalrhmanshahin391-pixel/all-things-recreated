# Import solved questions only + event card fits phone screens

## 1. AquaVisionX — import what is solved, skip the failed ones

Today the Import button stays locked whenever any question failed in stage 2, so one bad question blocks the whole paper.

Change:
- When some questions failed, show a second button next to Import: **Import solved only (N)**, with the count of ready questions.
- It imports every solved question and simply skips the failed ones; the result line reports imported / skipped duplicates / left out unsolved.
- Failed questions stay in the list with their Retry button, so they can be solved later and imported in a second pass (already-imported ones are skipped, so nothing is duplicated).
- The normal Import button keeps its current behaviour: enabled only when everything is solved.
- The same rule is enforced on the server, so partial import only happens when it is explicitly requested.

## 2. Event card on phones

On a phone the home page can be scrolled sideways: the decorative background pattern and the wide event card extend past the screen edge.

Change:
- Keep the page content inside the screen width so there is no sideways scrolling.
- Let the event card use the full phone width with the title and subtitle wrapping onto a second line instead of being cut off, keeping the current desktop look unchanged.

## Technical details

- `src/lib/aquavisionx.functions.ts`: add optional `allowPartial` to `importAqvJob`; when true, filter to `solved` items instead of throwing on unsolved, and return the count left out.
- `src/routes/admin.aquavisionx.tsx`: add the partial-import button (visible only when `solvedCount > 0 && !allSolved`), pass `allowPartial: true`, and report the skipped count in the status line.
- Phone overflow: clamp the decorative layer (`ThemeDecor`) horizontally and adjust `src/components/events/EventButtons.tsx` card typography/wrapping for small screens.
