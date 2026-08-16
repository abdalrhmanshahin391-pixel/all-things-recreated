# Make the header fit on phone and iPad — and stay fitting as you add buttons

Right now the right-hand cluster (language toggle, avatar, Golden/committee badge, chevron, menu button) is wider than the space left over, so on the phone the menu button is pushed off the edge and can't be tapped, and on iPad the wide red لجنة الطب والجراحة pill sits on top of the Support / Study Hub links. The page-level `overflow-x: hidden` guard hides the sideways scroll, which is why the overflow now looks like clipped/covered buttons instead of a scrollbar.

Keeping zoom-out is not needed — the fix below makes the row genuinely fit, and it keeps fitting when more buttons are added later.

## What changes

- **Menu button always reachable on phone.** The mobile menu trigger is pinned as the last item of the right cluster and can never shrink or be pushed out; everything before it gives up space first.
- **No wide identity pills in the top bar.** The Golden and committee badges show only as small round chips (crown / red shield) beside the avatar at every width. The full "Golden" and "لجنة الطب والجراحة" labels stay where there's room for them: the account dropdown and the profile page. That removes the iPad overlap.
- **Nav can't be overlapped.** The centre nav and the right cluster live in a layout where the nav shrinks (and hides its overflow) before the right cluster does, instead of the two drawing over each other.
- **Room to grow.** The right cluster becomes a capped, single-line row: extra buttons added later collapse to icon-only and then move into the mobile sheet / account menu rather than widening the header.

## Technical notes

- `SiteHeader.tsx`: right cluster gets `min-w-0 max-w-full flex-nowrap`; the menu trigger gets `shrink-0 order-last`. The avatar button's badge slots render `<GoldenBadge dot />` / `<CommitteeBadge dot />` directly instead of the `*Responsive` wrappers, so no pill variant reaches the top bar. Avatar button gets `max-w-[9rem] overflow-hidden`.
- `GoldenBadgeResponsive` / `CommitteeBadgeResponsive` stay exported (used elsewhere) but are no longer used in the header avatar row.
- Nav wrapper keeps `min-w-0` and adds `overflow-hidden` so long link lists clip rather than push.
- Leave `html, body { max-width: 100%; overflow-x: hidden }` in `src/styles.css` as-is.
- Verify with Playwright at 390px, 430px and 820px: `document.documentElement.scrollWidth === clientWidth`, the menu button's bounding box is fully inside the viewport and clickable, and no nav link overlaps the right cluster.
