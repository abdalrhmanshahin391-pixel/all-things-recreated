# Google Drive link, domain, and a new Course Control page

## 1. Connect Google Drive
The committee already has a "Link this site to Google Drive" panel (snapshot + restore), but no Google account is connected yet, so it can't reach Drive. I'll open the Google Drive connect card in chat; you pick or create the connection with your account. Once linked:
- Committee (لجنة الطب والجراحة) uploads and the snapshot/restore panel start working.
- The same connection serves the rest of the site (course/lecture files that go to Drive).

## 2. Custom domain
Domain setup isn't something I can do from code — it's done in the project's Publish settings (Publish > Settings > Domains), where you add your domain and copy the DNS records to your registrar. I'll point you to it after publishing; tell me the domain name and I'll walk through the DNS records.

## 3. New page: Course Control
New admin page at `/admin/course-control` (tile "Course Control" in the admin hub), a clean per-course control desk. The existing courses page stays as-is.

For each course, one row/card with:
- **Publish**: draft or live.
- **Price** + currency.
- **Discount / was-price**: set an original price (e.g. 20 USD) plus the current price or "Free right now". Cards and the course page then show `~~20 USD~~ Free — limited offer`, so nobody thinks it was always free. When the offer ends, it goes back to the original price automatically.
- **Badge**: NEW / HOT / MOST WANTED / LIMITED / FREE / custom text, colour, and an optional expiry.
- **Show on home page**: on/off. Off means the course only appears inside its university's course list.
- **Admin only**: hides the course from everyone except admins, so you can build and adjust it before release.
- Search + filter by university/year, so it stays usable with many courses.

## Technical notes
- Migration on `public.courses`: `compare_at_price numeric`, `discount_active boolean`, `discount_ends_at timestamptz`, `show_on_home boolean default true`, `admin_only boolean default false`. Badge fields already exist.
- RLS: public/user SELECT policies get `AND admin_only = false` (admins keep full read via the existing role check), so hidden courses never leave the backend.
- Reads that feed the home page (`CoursesStrip`, `courses.index`) filter on `show_on_home` / `admin_only`; university course lists only filter `admin_only`.
- `CourseCard` and the course detail page get a price block showing struck-through original price + current price/FREE and a small "offer ends" note when `discount_ends_at` is set; checkout keeps charging the effective price.
- Course Control page is a new route + a small server function for batched updates, reusing existing badge presets from `CourseBadge`.
