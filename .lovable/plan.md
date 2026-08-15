# Ad Studio v2 — simpler to use, far more powerful

Rebuild the Ad Studio around the poster styles in your examples (bold split-colour headlines, two-plan comparison cards, feature tick lists, big JOD price with "was", device mockups of the site, milestone/stat posters), while making the editor much easier: a short guided flow instead of one long wall of controls.

## What changes for you

**1. Guided flow, not a control dump**
- Step 1 — *What is this ad?* (Course offer, Package / two-plan deal, New feature, Milestone / stats, Announcement, Reminder, Free-form).
- Step 2 — *Pick a look* from a visual gallery of real layouts (previews, not names).
- Step 3 — *Fill the content* in a short form: headline, sub, price/was, bullet ticks, CTA, link.
- Step 4 — *Style & export*: colours, background, size, download.
- An **Advanced** toggle reveals the fine-grain controls (per-element size/weight/spacing/shadow) so nothing is lost.

**2. New layouts matching your images**
- **Split headline** — huge stacked words where one line takes an accent colour ("4TH YEAR / **MINORS** / FINAL SOON!"), underline rule, sub-line with a coloured phrase.
- **Two-plan comparison** — two rounded cards side by side, each with icon, plan name, "1 user / 3 persons", price + struck-out old price + SAVE % badge, tick list, "Courses included" list, and a linking chip between them.
- **Single deal card** — image tile + Subscribe button on one side, price block + ticks on the other (your Anesthesia layout).
- **Feature launch** — dark navy/gold, product name in two-tone, three icon+label columns, device mockup below, closing three-word line.
- **Milestone / stats** — two big stat blocks with icons and captions, accent underline scribble, CTA pill.
- **Diagonal split** — orange/navy diagonal background like your package poster.

**3. Device mockups & screenshots of your own site**
- Insert a **device frame**: iPad (portrait/landscape), MacBook, iPhone, browser window, or plain rounded screen.
- Fill it with: an uploaded screenshot, an image already on the site, or a **live capture of any page of your own website** (home, a course, a university page) — you choose the page and it renders a full-screen shot into the frame.
- Position, scale, rotate, shadow and glow per frame; up to two frames per ad (like the Capture Notes poster).

**4. Per-element alignment and free placement**
- Every text block gets its own alignment (left / center / right) and its own optional two-tone accent word — so you can centre just the headline while the body stays left.
- Free-drag mode: drag any block on the canvas, with snap guides and a "reset to layout" button.

**5. Download bug — background image missing**
- Fixed: images are inlined (fetched and embedded) before export, and fonts are pre-loaded, so the exported PNG matches the canvas exactly. Export gets a retry pass and a warning if any image can't be embedded.

**6. More formats and extras**
- Sizes: 1:1 (1080), 4:5 (1080×1350), 9:16 story, 16:9 — layouts reflow.
- Tick-list editor (add/remove/reorder lines, choose the tick icon), badge/ribbon editor, "SAVE %" auto-calculated from price vs old price.
- Curated colour themes (navy/gold, navy/orange, light sand, black/orange, diagonal split) applied in one click; brand logo/wordmark toggle.
- Duplicate an ad into a variant set, save your own layouts as templates, and export a set of sizes at once.
- Ready-to-paste Telegram caption stays, now built from the tick list and price too.

## Technical notes

- `src/lib/ad-studio.ts` gains a richer `AdDesign` (per-block `align`, `accentWord`, `bullets[]`, `plans[]`, `devices[]`, `size`) plus new template definitions; a migration function upgrades designs saved with the old shape.
- Canvas split into small renderers under `src/components/admin/adstudio/` (`SplitHeadline`, `PlanCards`, `DealCard`, `FeatureLaunch`, `StatsPoster`, `DeviceFrame`, `TickList`), all driven by the same design object.
- Export fix: pre-pass converts every `<img>` src (signed storage URLs, AI images, uploads) to a data URL and awaits `document.fonts.ready` before `toPng`, with `pixelRatio` set for the chosen size.
- Site screenshots: an admin-only server function renders the requested route to an image and stores it in the existing `ad-media` bucket; the canvas uses the stored path (avoids cross-origin issues on export).
- Editor state moves to a reducer with undo/redo; the wizard and Advanced panel are separate components so the route file stays small.
- Saved ads keep using `ad_creatives`; new fields live inside the existing JSON `design` column, so no schema change beyond an optional `size` column.
