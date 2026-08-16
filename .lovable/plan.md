# Revert header changes, go back to zoom-out mode

You'd rather just pinch/zoom the page yourself than have the header re-arrange itself, so this undoes the recent header work.

## What changes

1. **Header back to how it was**
   - Restore the full-label Golden and لجنة الطب والجراحة badges in the top bar (no small round dot chips).
   - Remove the added shrink/no-wrap constraints on the brand and the right-hand action cluster.
   - Put the three-line menu button back to its original position and `md` breakpoint (nav links return at desktop widths as before).
   - Revert `src/components/header/header-designs.ts` back to the `md` visibility rules so the sheet/nav matches.

2. **Make sure zooming works everywhere**
   - Confirm the page viewport stays `width=device-width, initial-scale=1` with no `maximum-scale` or `user-scalable=no`, so pinch-zoom and zoom-out are fully allowed on phone and iPad.
   - Remove any `touch-action` or overflow rules added during the header fix that could block pinch-zoom.

## Technical notes

Files touched: `src/components/SiteHeader.tsx`, `src/components/header/header-designs.ts`, and a check of `src/routes/__root.tsx` viewport meta plus `src/styles.css` for leftover header-fix rules. No backend or data changes.
