# Staff team cards + founder cards on About

## 1. A "Staff team / لجنة الطب والجراحة" page

A new page at `/committee/team`, reached from one button on the لجنة الطب والجراحة home page. The button carries both names at once: **Staff Team** on top line, **لجنة الطب والجراحة** underneath, in a single pill.

**The cards** — same shape as the reference you sent, a bit smaller:

```text
+---------------------+
|                     |
|   member portrait   |   (square photo, soft rounded corners)
|                     |
+---------------------+
  [flag]  JORDAN            <- small caps, letter-spaced, accent colour
  Full Name                 <- large serif display name
  4th Year         [LEAD]   <- muted line + optional badge chip
```

Three per row on desktop, two on tablet, one on phone. Each card gets its own accent colour cycling through the site palette (gold, navy, teal, coral, plum) — the country line and a thin edge accent take that colour, so no two neighbours look the same, while photos and names stay calm and consistent. Warm neutral page background like the reference, correct in light/dark and the seasonal skins, and mirrored properly in Arabic.

**Managing it (admins / committee members only)**
- "Add member" opens a small form: photo upload, name (EN + AR), country (picked from a list, flag comes automatically), year (e.g. 1st–6th year / Graduate), optional role badge, optional short description.
- Each card gets edit and delete controls when you're signed in with permission; drag-free ordering via up/down arrows like the year cards already use.
- Photos upload to a dedicated images bucket and are shown cropped to a square automatically.

Visitors just see the cards.

## 2. About page: "Made by" founder cards

Replace the long headline "AquaQBank, by Abdalrhman & Laith Shaheen" with a short **Made by** label followed by two founder cards, centred on the page, in the same card style as above:

- Photo (upload-able the same way, placeholder initials until you add one)
- Jordan flag + JORDAN in the accent caps line
- Name, centred
- One editable description line under it

Both cards sit side by side, centred, with the rest of the About page unchanged.

## Technical notes
- New table `public.committee_members` (name_en, name_ar, country_code, year_label, role_label, description_en/ar, photo_url, accent index, sort_order) with GRANTs, RLS: public read, insert/update/delete only for admin or committee via the existing `can_manage_committee` check. New public storage bucket for member photos with the same write restriction.
- New route `src/routes/committee.team.tsx` + a shared `MemberCard` component reused by About; founder entries stored as two rows flagged `is_founder` so the About cards are editable from the same place.
- Country flags rendered from emoji flags derived from the country code — no extra image assets.
- Accent colours come from existing tokens in `src/styles.css`; nothing hardcoded.
