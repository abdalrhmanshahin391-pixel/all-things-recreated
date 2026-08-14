# CoursesHub — one page for everything about courses

## What you get
A new admin page **CoursesHub** at `/admin/courses-hub`, with a tile in the admin hub. Both existing pages (Courses Control and Course Control) stay exactly as they are — CoursesHub is a third page that contains all of their features together and actually applies them across the site.

Layout: one header, then three tabs.

1. **Courses** — everything from Courses Control: add a new course (questions or lectures), university, title, category/year/exam type, price, payment price ID, cover upload, edit and delete, search + university/kind filters, and the "Manage dropdown options" panel.
2. **Control** — everything from Course Control, per course: published, shows on home page, admin only, price + currency, "Free", discount running with a was-price and an optional end date, badge presets/custom text/colour/expiry, live "Students see ~~20 USD~~ 10 USD" preview, Save per course.
3. **Access** — the user-access panel from Courses Control: search users, see how many courses each owns, grant or revoke course access.

Everything is on one screen with the same dark AquaQBank styling, so you never have to move between two pages again.

## Why the control page "does nothing" today
Saving works — the values do land in the database. The problem is the rest of the site never reads them:

- The course cards on **/courses**, **the university page**, **My Courses**, **Lectures** and the **course detail/checkout page** don't load the discount fields at all, so a was-price or a "free right now" window never shows up.
- Only the home-page strip filters on "shows on home page" / "admin only"; the other listings ignore them, so hiding a course only hides it from the home page.

So the fix isn't only a new page — the reads have to be updated too.

## Making the settings actually apply
- Every course listing selects the discount and visibility fields and renders the same price block (struck-through was-price + current price or FREE, plus an "offer ends" note).
- All public listings filter out `admin_only` courses (admins still see them, marked), and the home page keeps filtering on `show_on_home`.
- Checkout keeps charging the current price; the was-price is display only.
- When a discount's end date passes, the card falls back to the original price automatically.

## Technical notes
- New route `src/routes/admin.courses-hub.tsx` plus small extracted components (`CourseControlRow`, `CourseFormPanel`, `UserAccessPanel`) so the three tabs share logic instead of duplicating the two existing files. The two old routes stay untouched.
- Add the CoursesHub tile to `src/lib/admin-hub-defaults.ts`.
- Update the `courses` selects in `courses.index.tsx`, `u.$uniSlug.tsx`, `my.courses.tsx`, `lectures.index.tsx`, `courses.$courseId.index.tsx` to include `compare_at_price, discount_active, discount_ends_at, show_on_home, admin_only`, and add the `admin_only` filter for non-admins.
- No database changes needed — all columns and admin RLS policies already exist.
