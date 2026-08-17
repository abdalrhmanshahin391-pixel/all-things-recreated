# Committee permissions split + Golden access check

Three role behaviours, tightened so each role edits exactly what it should.

## 1. رئيس لجنة الطب والجراحة (head) — full control of the committee section

The head gets everything an admin can do inside the committee area:

- Add / edit / delete years on the committee home page.
- Import and export the committee backup (the buttons currently shown to admins only).
- Add, edit, reorder and remove Staff Team member cards.
- Edit the study plan.
- Edit everything inside a year (semesters, modules, subjects, sections, files, links, folders).
- Keep the existing team management and change log pages.

## 2. لجنة الطب والجراحة (member) — content only

A regular committee member can edit:

- Everything inside a year: semesters, modules, subjects, sections, PDFs, links, videos, folders, linked courses.
- The study plan.

And can no longer:

- Add, edit or delete years.
- Add, edit or delete Staff Team member cards (they still see the page).
- Export or import the committee backup.
- Add or remove committee members (already head-only).

## 3. Golden account — all courses free

Golden is already wired to grant every paid course and lecture course automatically (on role grant and whenever a new course is created). There are no golden users yet, so this pass verifies it end to end: grant the role to a test account, confirm all courses and lecture courses appear unlocked with no payment prompt, confirm revoking the role removes only the golden-granted access, and fix anything the check turns up (for example a purchase button still showing on an already-free course).

## Technical notes

Database migration:

- Add a helper `can_manage_committee_years(uuid)` = admin or committee_head, and reuse the existing `can_manage_committee_members(uuid)` (admin or head).
- `committee_years`: replace the single ALL policy with read-for-everyone plus write restricted to admin/head.
- `committee_members` (staff team cards): write restricted to admin/head; public read unchanged.
- `committee_semesters`, `committee_modules`, `committee_subjects`, `committee_categories`, `committee_resources`, `committee_subject_courses`, `study_plan_stages`, `study_plan_subjects`: unchanged — `can_manage_committee` already covers member + head + admin.

Server functions:

- `src/lib/committee-snapshot.server.ts`: add an `assertCommitteeAdmin` (admin or committee_head) and use it in the four backup functions in `src/lib/committee-backup.functions.ts` instead of `assertSiteAdmin`.

UI gating (`useCommitteeRole` already exposes `canManageMembers` = admin or real head):

- `src/routes/committee.index.tsx`: show "Add year" and the backup buttons to `canManageMembers` instead of `isAdmin`; gate the per-year edit/delete buttons on `canManageMembers` instead of `canManage`.
- `src/routes/committee.team.tsx`: pass `canManageMembers` to the add button and the member cards.
- `src/routes/committee.study-plan.tsx`, `committee.$year.index.tsx`, `committee.$year.$subject.tsx`: keep `canManage` (member + head + admin).
