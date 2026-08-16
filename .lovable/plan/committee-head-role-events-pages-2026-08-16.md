# Committee Head role + Events pages

## 1. رئيس لجنة الطب والجراحة (Committee Head)

A new role `committee_head` added next to admin / committee / golden.

What a head can do:
- Everything a committee member can do (all library management on the committee pages).
- Add or remove committee members: a "Committee members" panel where the head searches a user and grants or revokes the `committee` role. Heads cannot grant admin, golden, or head — only admins can.
- See the committee change log (who added / edited / deleted what) — the existing log page opens for heads too, not just admins.

Where it shows: the head gets the same red لجنة الطب والجراحة theme and badge, with the wording "رئيس لجنة الطب والجراحة" on their badge and profile card.

Admins assign the head role from the existing Users page, same place other roles are given.

## 2. Events pages (turn on / off)

A new admin area "Events" where you create any number of event pages.

Per event you control:
- Name in Arabic and English (e.g. "For Zero Course"), plus a URL slug.
- On / off switch — off means the page is completely gone from the site.
- Who can see it: everyone, or signed-in students only.
- Team: pick a head of the event and any number of members (name, country, role, optional photo) — same card style already used for the staff team.
- Sections: add as many sections as you like ("About the university", "About this scholarship", …) each with a title in both languages and rich text/info the students read. Reorder, edit, hide, delete.
- Contact / Join blocks: per event you can add, edit or remove any number of blocks, each with a title, an optional QR image you upload (Telegram or any group), a link, and a button label. Delete or replace the QR any time.
- Entry button: choose how the event appears on the site — a large highlighted button, a normal nav link, or hidden. You also choose the button style (solid accent, gradient, outline) and where it sits (main header / home page).

The public event page renders: hero with the event name, the entry sections, the team cards, then the join/contact cards with QR codes — in the same visual language as the committee pages, Arabic and English.

## Technical notes

- DB: extend the `app_role` enum with `committee_head`; `has_role` and the committee RLS policies treat a head as a committee member. New security-definer function so a head can insert/delete only `committee` rows in `user_roles`, and read `committee_activity_log`. GRANTs added for every new table.
- New tables: `events` (slug, names, enabled, visibility, button style/placement, sort), `event_sections`, `event_members`, `event_contact_blocks` — RLS: public read only when the event is enabled and visibility allows it; write restricted to admin/head.
- Storage: reuse existing public asset bucket for event QR images and member photos.
- Routes: `src/routes/events.$slug.tsx` (public, with per-event head() metadata, noindex when signed-in-only), `src/routes/admin.events.index.tsx` and `admin.events.$eventId.tsx` for management.
- Header/home entry buttons read from the events table via the existing site settings query pattern.
- Auth store gains `isCommitteeHead`, surfaced through `useAuth` / `useCommitteeRole`; committee theme and badge text follow it.
