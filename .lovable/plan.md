# Header on phone and iPad: account row below, menu button top-right

On desktop nothing changes. On phone and iPad the top bar becomes two clean parts instead of one squeezed row.

## What changes

1. **Account cluster moves down (arrow 1).**
   On phone and iPad the avatar + Golden / لجنة الطب والجراحة badge + chevron leave the top bar and sit in their own slim strip directly under it, aligned to the start of the row (with the language toggle beside it). Because that strip has the full width, the **Golden badge shows its full pill** — crown + "GOLDEN" — no longer half cut. Same for the red committee badge.
   On desktop (lg and up) the cluster stays exactly where it is today, inside the top bar.

2. **Menu button pinned top-right (arrow 2).**
   The three-line button stays in the top bar, last item on the right, fixed size, always fully inside the screen on phone and iPad. Unchanged on desktop, where nav links show instead.

3. **Both lists open fully visible.**
   - The account dropdown opens anchored under the strip, width capped to the screen, and scrolls inside itself if it is taller than the space left — so Logout is always reachable.
   - The menu sheet opens under the header, full width, scrolls vertically, and shows every nav link plus My Mentor and the sign-in buttons.
   - Both are checked in English (LTR) and Arabic (RTL) so the panels open toward the inside of the screen and never hang off the edge.

## Technical notes

- `SiteHeader.tsx`: split the right cluster. The top-bar cluster keeps the language toggle + menu trigger (`shrink-0`, `order-last`); the avatar/account block renders twice — `hidden lg:flex` inside the top bar, and in a new `lg:hidden` sub-row rendered under the bar inside the same `<header>` (bordered, `px-4 md:px-8`, `h-12`, `justify-between`).
- Badges in the sub-row use the full `<GoldenBadge />` / `<CommitteeBadge />` (no `dot`), so the label is complete; the avatar button drops the `max-w-[9.5rem] overflow-hidden` cap in that context.
- Dropdown panel: `end-0 max-w-[calc(100vw-2rem)] w-64` with existing `max-h`/`overflow-y-auto` retained; verified under `dir="rtl"`.
- `header-designs.ts`: add a `subBar` class per skin for the new strip so each header design keeps its own border/background treatment; `mobileSheet` stays `lg:hidden` with `max-h-[70vh] overflow-y-auto`.
- Verify with Playwright at 390px, 430px and 820px, in both `dir=ltr` and `dir=rtl`: no horizontal overflow, menu button box fully inside the viewport and clickable, golden badge text not clipped, both open panels fully within the viewport.
