# About us, redesigned — plus a living footer

## 1. About page rebuilt for reading, not for effort

Same ideas, far less text, and a layout that gives the eye something to hold onto. Order top to bottom:

**1. Who we are (short)**
One headline, two founder names — Abdalrhman Shaheen and Laith Shaheen — and two or three sentences on what AquaQBank is. The "study smart, questions over slides" idea is compressed to a single short line plus three tiny stat/idea chips, not a paragraph.

**2. The two paintings, alternating with the ethics**
Right after that intro, the images arrive — this is where the reading actually starts:
- Painting 1 on the right, its ethics text on the left.
- Painting 2 below, on the left, its text on the right.
Each pair carries one clear idea (the physician at the bedside → medicine is a person, not a case; the teaching ward → hard work, treating the poor, seriousness of the job). Large images, rounded frames, generous space.

**3. Physician quote cards**
The five Golden Age physicians (Al-Razi, Ibn Sina, Al-Zahrawi, Ibn al-Nafis, Al-Ruhawi) become quote cards, two beside each other, each one visually distinct — different accent colour from the theme palette, different corner/pattern treatment, big quote mark, name and dates. Two or three tight lines each instead of long paragraphs.

**4. Closing line**
"They taught us that science without compassion is incomplete. They didn't just study diseases; they studied humans." — as a full-width statement band, then a CTA into courses and question banks.

**Look and feel**
Not flat and not monochrome: cards use the different accent colours already in the theme (amber/gold, teal, navy, coral) as tints, soft gradients, subtle geometric/pattern shapes in the background — closer to the reference cards you sent, where the shape and colour do the explaining. Everything stays in the existing token palette, works in light/dark and in the seasonal skins, and reads correctly in Arabic RTL (the right/left alternation mirrors).

## 2. Footer, alive instead of dead

Rebuild the site footer in the Khan Academy shape but with only what we actually have:
- Multi-column link groups (Study / Site / Legal) with clear column headings
- Brand block on the side: wordmark, one-line mission, contact
- Language switcher and social/app links row where relevant
- Thin bottom bar: copyright, terms, privacy, refund, signature
Admin-controlled footer links keep working — they slot into the "Site" column.

## 3. My Mentor
Remove the whole يومياتي section (نيّة اليوم and محاسبة المساء cards) from `/mentor`. Everything else — الأدعية, الواجبات الدينية, الكنز — stays as is.

## Technical notes
- `/about` stays a hand-authored bilingual route; content moves into small data arrays with an `AlternatingBand` and a `QuoteCard` component so it stays short and consistent.
- New accent tint tokens (or `color-mix` on existing ones) added in `src/styles.css` — no hardcoded hex in components.
- Existing paintings reused from the current asset pointers.
- `SiteFooter.tsx` restructured to a column grid; nav data still from the "Footer links" placement.
- Head metadata for `/about` kept and updated to the shorter description.
- No database or schema changes.
