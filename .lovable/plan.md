# Search Console setup + hide course pages from Google

## 1. Connect Google Search Console
The warning appears because no Search Console connection is linked to this project. I'll open the connect card so you can link your Google account, then:
- verify `https://aquaqbank.com/` as a property (meta-tag verification, added to the site head)
- add the verified site to your property list
- submit `https://aquaqbank.com/sitemap.xml`

After that Lovable's automated indexing checks and sitemap actions work.

## 2. Hide every course page from Google
Today `/courses/chemistry` style pages are indexable (that's why Chemistry showed up). The questions themselves are already login-locked, but the pages will be removed from search:
- add `robots: noindex, nofollow` to the Courses list page and every course sub-page (overview, checkout, run)
- drop `/courses` and all `/courses/{id}` entries from the sitemap
- add `Disallow: /courses` to `robots.txt` for extra safety

Google drops already-indexed pages within a few days to a few weeks after re-crawl; the noindex tag is what removes them, so the robots rule is added in a way that still lets Google re-crawl and see it.

## 3. Help the homepage rank
Ranking "first" isn't something anyone can guarantee, but these are the concrete moves:
- keep the homepage and general pages (Universities, Lectures, Committee, Guides, Study Hub, About) indexed and well-described
- confirm the homepage title/description target the terms students actually search
- make sure the sitemap only lists pages you want found, and submit it through Search Console
- once connected, I can read your real impressions/queries and advise on what content to add

## 4. Icon
Skipping — nothing changed here, as you asked.

## Technical notes
- `robots: noindex` goes in each route's `head()` meta: `src/routes/courses.tsx` subtree (`courses.index.tsx`, `courses.$courseId.index.tsx`, `courses.$courseId.checkout.tsx`, `courses.$courseId.run.tsx`).
- `src/routes/sitemap[.]xml.ts`: remove the `/courses` static entry and the `courses` dynamic block.
- `public/robots.txt`: add `Disallow: /courses` under each user-agent block, keep the sitemap directive.
- Verification meta tag goes in `src/routes/__root.tsx` head links/meta.
