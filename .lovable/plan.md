# Footer everywhere, cleaner home page

## 1. Footer contact block
- Remove the Telegram icon button.
- Remove the mail icon; show the address as plain readable text: **aquaqbank@gmail.com** (still clickable).
- Add the phone number **0798890962** underneath, clickable to call/WhatsApp dial.
- Instagram stays.

## 2. Footer links pruned
Remove **Packages**, **Lectures** and **Study Hub** from the footer columns. What stays:
- Study: Universities, Courses, Study Guides
- Tools: Summaries, My Notes, Committee, My Mentor
- Site: About us, Support, My profile (+ any admin-added footer links)
- Legal: Terms, Privacy, Refund

## 3. Same footer on every page
The footer currently appears only on About, Terms and Support. It moves into the shared app shell so every page gets it — home, courses, universities, packages, lectures, guides, profile, legal pages — with the exception of full-screen working surfaces (admin panels, quiz/study players, the locked screen), where a directory footer would be in the way.

On the home page it sits on a clean background band that reads correctly under the closing call-to-action instead of colliding with it.

## 4. Home page trims
- Delete the FAQ entry **"Is AquaQBank a bank?"** (English and its Arabic equivalent). The FAQ structured data updates with it automatically.
- Remove the **See packages** button from the "Start with a question, not a slide" call-to-action, leaving Browse courses alone.

## 5. The two paintings on the home page
Directly below the "Every subject, sorted" subjects section, the two Golden-Age painting bands from About are added — the bedside painting with "A patient is a person, not a case", and the ward painting with "Effort is repayment. The poor are the test." — image on one side, the idea beside it, alternating. The physician quote cards are **not** brought over; they stay on About only.

## Technical notes
- The band data and `Band` renderer move out of `src/routes/about.tsx` into `src/components/about/EthicsBands.tsx`; About imports it, home renders `<EthicsBands />` inside a padded section after the `feature1` builtin (both the CMS-ordered and fallback render paths).
- `SiteFooter.tsx`: contact block rewritten, three links removed.
- Footer mounted once in `src/routes/__root.tsx` after `<Outlet />`, hidden by pathname prefix for `/admin`, quiz/study player routes and `/locked`; the duplicate `<SiteFooter />` in about/terms/support is removed.
- `HomeFaq.tsx`: one entry removed from each language array.
- No database, schema or business-logic changes.
