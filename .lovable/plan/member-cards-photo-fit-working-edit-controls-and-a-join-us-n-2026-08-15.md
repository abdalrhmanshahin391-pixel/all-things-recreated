# Member cards: photo fit, working edit controls, and a "join us" note

## 1. Photos that don't get cut off

Each member card gets a **Fit / Fill** choice in its editor:

- **Fill** (default for portraits) — the photo fills the square, cropped from the centre, as now.
- **Fit** — the whole picture is shown inside the card, nothing cut off, sitting on a soft tinted panel that matches the card's accent colour. Wide images like the calligraphy one will read properly instead of showing only a slice.

The same setting is used everywhere the card appears: the Staff Team page and the founder cards on About. Cards keep their tidy equal height either way, so a row still lines up.

## 2. Edit and delete you can actually reach

Right now the pencil / bin / arrows only appear on mouse hover, so on iPad and phone they never show — that's why nothing can be edited or deleted.

Fix: when you're signed in with permission, the controls are **always visible** as a small toolbar pinned to the card (photo, edit, delete, reorder), on every device. This applies to:

- Staff Team cards on لجنة الطب والجراحة
- The Abdalrhman and Laith founder cards on About — so their photo and description become editable and each card can be removed

The editor keeps the existing fields (photo, names EN/AR, country, year, role badge, description EN/AR) plus the new Fit/Fill switch and a "Remove photo" option.

## 3. "Join us" note on لجنة الطب والجراحة

In the empty area on the right of the hero (where you circled in red), a small card:

```text
+--------------------------------+
|  ✦  JOIN THE TEAM              |
|  Want to help other students   |
|  with resources? Become part   |
|  of the staff team.            |
|  [ Contact us → ]              |
|  Thank you for every share.    |
+--------------------------------+
```

Bilingual (Arabic when the site is in Arabic), in the site's navy/gold style with a subtle gold edge, linking to the existing support/contact page. On phones it drops below the buttons instead of floating in the corner, and it mirrors correctly in Arabic.

## Technical notes
- Add a `photo_fit` text column (`cover` | `contain`) to `public.committee_members`, default `cover`; render it in `MemberPhoto` via `object-fit` plus a tinted backdrop for `contain`.
- Replace the `sm:opacity-0 sm:group-hover:opacity-100` control strip in `MemberCard.tsx` with an always-visible toolbar for managers.
- Add "Remove photo" and the fit selector to `MemberForm.tsx`.
- New `JoinTeamNote` block rendered in the `committee.index.tsx` hero, absolutely positioned on `lg+`, in flow below on smaller screens; colours from existing tokens only.
