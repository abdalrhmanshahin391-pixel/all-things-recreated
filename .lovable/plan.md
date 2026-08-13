# Fix-up pass: themes, uploads, navigation, speed, security

## 1. White/grey bars in some themes (pic 1 and 3)

Confirmed cause: the dark-theme rescue layer in `src/styles.css` remaps hardcoded light utilities (`bg-white`, `bg-slate-50`, `bg-slate-100`…) but does **not** cover opacity variants such as `bg-slate-50/60`, `bg-slate-50/40`, `bg-slate-100/50`. The admin university row uses `bg-slate-50/60` for the "Home-page card" strip — that is the grey band in your screenshots, and its labels stay dark-on-dark.

Fix:
- Extend the dark remap in `src/styles.css` to the opacity variants actually used in the codebase (`/40`, `/50`, `/60`, `/70`, `/80`) for white and slate backgrounds and borders.
- Convert the admin universities page (the one in the screenshots) off hardcoded slate/white classes onto semantic tokens (`bg-card`, `bg-muted`, `text-foreground`, `border-border`) so it is correct in every theme instead of relying on the rescue layer.

## 2. University card image upload shows nothing

Confirmed cause: the backend has **zero storage buckets**. The restore recreated tables but not storage, so every upload and preview path fails.

Fix:
- Create the buckets the app expects: `university-logos`, `course-images`, `question-images`, `committee-files`, `committee-images`, `site-media`, `lecture-videos`.
- Add storage access policies: admins can upload, signed-in users can read what they're allowed to (same shape as the original migrations).
- Re-test upload → preview on the universities page once the buckets exist.

## 3. Refresh / back sends you to the home page

Every admin page runs `navigate({ to: "/" })` when the admin role isn't loaded yet (about 30 files). On a hard refresh the session and role arrive asynchronously, so a timing gap bounces you home, and the same guard throws away where you were.

Fix:
- Replace the ad-hoc per-page redirect with one shared guard that waits for both session and roles before deciding, and sends you to `/login?redirect=<current path>` instead of `/`, returning you to the page afterwards.
- Verify by refreshing several deep pages while signed in, and by using the browser Back button from deep pages.

Not yet reproduced: the "back goes home" case on non-admin pages. If it happens there too, the first step is to instrument that navigation and fix it in the same pass.

## 4. Laggy question text editing

The question editor holds the whole question list plus each field in shared state, so every keystroke re-renders the full list.

Fix:
- Isolate each question row into its own memoised component so typing only re-renders that row.
- Keep text inputs local and debounce the save so there is no request per keystroke.

## 5. General speed and weight

- Lazy-load heavy, rarely used admin tooling (PDF/AI importers, video tools) so student-facing pages stop shipping it.
- Remove duplicate per-page fetching where a shared query already exists; cache signed storage URLs.
- Correct image loading attributes on the remaining pages.
Goal: a measurable drop in initial load for the home, universities and course pages.

## 6. Security pass

The database checker currently reports 48 findings, mostly privileged functions that anonymous visitors can call.

Fix:
- Review each one; block anonymous execution where it isn't meant to be public, or downgrade its privilege.
- Re-check row-level access rules and grants on every table, plus the new storage policies.
- Run the dependency and security scans, fix what is real, and record the rest in security memory.

## Technical notes

- Buckets are created with the storage tool; policies via a migration on `storage.objects`.
- The shared route guard lives in a hook consumed by the admin routes; database role logic is unchanged.
- No redesign is included — only color correctness in themed modes.