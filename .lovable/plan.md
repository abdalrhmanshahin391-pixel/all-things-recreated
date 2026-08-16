# Make the header fully visible and tappable on phone and iPad

Right now the top bar tries to fit too much on one line: brand + nav links + My Mentor + language + avatar + Golden/committee pill + chevron + menu button. On a phone the right end runs off the screen, and on iPad the wide red لجنة الطب والجراحة pill lands on top of the nav links. Rotating gives more width, which is why it only looks right in landscape.

The fix is to stop the top bar from ever needing more width than the screen, and to move everything that doesn't fit into a menu that is always reachable.

## What changes

1. **A fixed, always-visible menu button**
   - The three-line button becomes the last item on the right and can never shrink, wrap or be pushed off the edge.
   - It shows on phone *and* iPad (up to desktop widths), so any nav link that doesn't fit is always one tap away.

2. **Only small round chips in the top bar**
   - Golden and committee identity show as a small crown / red shield circle next to the avatar at phone and tablet widths.
   - The full "Golden" and "لجنة الطب والجراحة" labels stay where there is room: the account dropdown, the profile page, and member cards. This removes the iPad overlap.

3. **The row is built so it cannot overflow**
   - Brand, nav and the right cluster each get proper shrink rules; the nav clips instead of pushing the buttons off-screen.
   - Extras like "My Mentor" and the language toggle collapse to icon-only, then move into the menu on the narrowest screens.

4. **A proper mobile/tablet menu**
   - The opened sheet lists every nav link plus My Mentor, sign-in/register, and is scrollable so nothing is cut off on short screens.
   - Same list on iPad as on phone.

5. **Zoom still works**
   - No `maximum-scale` / `user-scalable=no` is added, so pinch-zoom stays available — you just won't need it.

## Verification

Screenshot and measure with a real browser at 390px (phone portrait), 430px, 768px and 820px (iPad portrait):
- `document.documentElement.scrollWidth === clientWidth` (no sideways overflow)
- the menu button's box is fully inside the viewport and actually clickable
- no nav link overlaps the avatar cluster
- the opened menu shows every link

## Technical notes

- `src/components/SiteHeader.tsx`: right cluster gets `min-w-0 flex-nowrap shrink-0`; menu trigger gets `order-last shrink-0` and `lg:hidden`; avatar button renders `<GoldenBadge dot />` / `<CommitteeBadge dot />` below `lg` and the full badge from `lg` up; avatar button capped with `max-w-[9rem] overflow-hidden`.
- `src/components/header/header-designs.ts`: `navWrap` moves from `hidden md:flex` to `hidden lg:flex` and gains `min-w-0 overflow-hidden`; `mobileSheet` moves from `md:hidden` to `lg:hidden` and gets `max-h-[70vh] overflow-y-auto`.
- Brand wrap keeps `shrink-0` but the wordmark scales down one step below `sm`.
- No backend, data or business-logic changes.
