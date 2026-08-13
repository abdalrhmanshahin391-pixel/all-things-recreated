# Restore the previous card design + fix the golden card chips

## What changes

### 1. University hub cards go back to how they were
Revert the recent card redesign on the university page (`/u/:slug`) to the earlier layout:
- Normal (non-gold) cards: plain card surface with a thin border, `rounded-xl`, `p-7` padding, natural height (no forced tall 290px box), icon chip on the left, small arrow on the right, title/subtitle/count flowing under the icon row.
- Golden Resources card: `rounded-2xl`, `p-7`, natural height, same amber gradient with the solid drop shadow underneath.
- The tinted colour washes added for the non-gold cards are removed, so they look exactly like before.

### 2. Golden cards: the three circled spots become white again
In the uploaded screenshot the icon chip, the top-right "Free"/arrow badge, and the bottom "7 years available" pill all render dark. Cause: a global dark-mode rule in the stylesheet rewrites every `bg-white` / `bg-white/95` element to the dark card colour, which also hits these chips inside the gold card.

Fix: give the golden card's chips their own explicit white background that the dark-mode remap cannot override, so on gold:
- icon chip: white circle/square with amber icon
- "Free" badge and arrow chip: white pill with amber text/icon
- count pill ("7 years available"): white pill with amber text

The global dark-mode remap stays in place for the rest of the site — only the gold card opts out.

## Technical notes
- `src/routes/u.$uniSlug.tsx`: restore the pre-change `HubTile` and `ResourcesTile` class strings (from the earlier revision), keeping current lock/hidden/admin behaviour intact.
- `src/lib/university-tiles.ts`: drop the `TILE_WASHES` map and `tileWash()` helper added for the redesign, and its import in the route.
- `src/styles.css`: add a scoped exception (e.g. a `.tile-gold` utility class on the golden card) so chips inside it keep a real white background and amber foreground under `.dark`.
