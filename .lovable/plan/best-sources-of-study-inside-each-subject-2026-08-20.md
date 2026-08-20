# Best sources of study (inside each subject)

A new, optional panel on every committee subject page listing the resources previous students found most useful, with a rating and a short note.

## What you get

- A section titled **Best sources of study — based on previously passed students** (Arabic subtitle: أفضل مصادر الدراسة حسب الطلاب السابقين) shown at the top of the subject page, above the categories.
- Each entry is a card with:
  - Source name (e.g. "Robbins & Cotran", "Dr. X lectures", "Osmosis")
  - Type chip: Book / Video / Lecture notes / Question bank / Other
  - Stars 1–5 ("recommended by students" level)
  - Optional short note ("best for pathology chapters 1–6")
  - Optional link (opens in a new tab) or a link to an existing file already in that subject
  - Optional "Top pick" highlight on one entry
- Entries can be reordered, edited and deleted.
- Layout is responsive: one column on phone, two on iPad, three on desktop. Titles truncate instead of clipping, star ratings and action buttons stay tap-sized (min 40px) and never overlap the text, and the editor dialog scrolls inside the screen on small devices.

## On / off switch

- Per subject: an **Enable best sources** toggle in the subject edit dialog. Off by default, so nothing changes anywhere until you turn it on.
- When off, the panel is completely hidden for students (and shown to editors only as a greyed hint).

## Who can edit

- لجنة الطب والجراحة (member) — can add / edit / delete / reorder entries and flip the per-subject toggle.
- رئيس اللجنة and admins — same, plus everything else they already have.
- Everyone else — read only.

## Technical notes

- New table `public.committee_best_sources`: `id`, `subject_id` (FK, cascade), `title`, `kind`, `rating` (1–5), `note`, `url`, `resource_id` (optional FK to `committee_resources`), `is_top`, `sort_order`, timestamps. Grants: `select` to `anon`/`authenticated`, full to `authenticated` behind RLS; `all` to `service_role`.
- RLS: public `SELECT`; manage policy `can_manage_committee(auth.uid())`, matching the existing `committee_subjects` policies (this already covers member + head + admin).
- New column `committee_subjects.best_sources_enabled boolean not null default false`.
- New component `src/components/committee/BestSources.tsx` (list + editor dialog reusing `CommitteeDialog`, `Field`, `inputCls`), rendered from `src/routes/committee.$year.$subject.tsx` and gated by `useCommitteeRole().canManage`.
- The subject query is extended to fetch best sources in the same batch, so no extra round-trip; edits invalidate `["committee-subject", subject]` and call `touchCommitteeSnapshot()` so backups/exports stay in sync.
- `committee_best_sources` added to the committee backup/snapshot table list so import/export keeps the data.

## Effort estimate

Roughly **2 to 3 credits** in total: one migration, one new component, small edits to the subject page and the subject dialog, plus a verification pass.
