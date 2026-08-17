# Why committee members can't edit inside a year

## What the checks show

Database side is fine. Every table behind a year — semesters, modules, subjects, categories, resources, linked courses, study plan — has a write policy of `can_manage_committee(auth.uid())`, and that function returns true for `admin`, `committee` and `committee_head`. Table grants for signed-in users are complete. So the backend already allows exactly what you asked for.

The blockage is on two other levels:

**1. There is currently only one person with the committee role.**
The whole project has three role rows: two admins and one committee member — and that committee row belongs to Laith, who is also an admin. Nobody else has the committee role at all, and there is no رئيس لجنة (committee head) assigned yet. So for everyone else the edit buttons are correctly hidden: they simply are not in the role.

**2. For a person who is admin *and* committee, "Admin mode: off" also switches off their committee powers.**
The role hook treats an admin who turned admin mode off as a plain student, and that also wipes their genuine committee membership — so all Add/Edit/Delete controls inside years, semesters, subjects and the study plan disappear. Head powers were already exempted from this; committee membership was not.

## What to change

1. **Stop admin mode from erasing a real committee role.** Mirror the existing head behaviour: a genuine `committee` role stays active for committee content editing even while an admin browses with admin mode off. Admin-only surfaces stay tied to admin mode as they are today.

2. **Make the reason visible instead of silent.** On the year page and the subject page, when a signed-in visitor has no committee power, show a small line explaining why ("you are not a member of لجنة الطب والجراحة" / "admin mode is off"), instead of just rendering a read-only page with no buttons. This is what made this hard to diagnose.

3. **Add the actual members to the role.** The people who should be able to edit need the `committee` role. Two paths, both already built:
   - Admin site → Users → grant the committee role, or
   - the رئيس اللجنة team page, once a head is assigned.
   I will confirm with you who should get it, and assign a رئيس لجنة الطب والجراحة if you name one.

4. **Verify end to end** as a committee-only account: open a year, add and rename a semester, add a module, add and edit a subject, add a section and a resource inside a subject, and edit the study plan — confirming each write succeeds and that year creation/deletion and the staff-team panel remain head/admin only, as agreed.

## Technical notes

- `src/hooks/useCommitteeRole.ts`: add `isRealCommittee` and base `canManage` on it (`isAdmin || isRealCommittee`), leaving `canManageMembers` and admin-only gates untouched.
- `src/routes/committee.$year.index.tsx`, `src/routes/committee.$year.$subject.tsx`: add the explanatory notice for signed-in non-managers.
- No migration required — RLS policies and grants on `committee_semesters`, `committee_modules`, `committee_subjects`, `committee_categories`, `committee_resources`, `committee_subject_courses`, `study_plan_stages`, `study_plan_subjects` were verified correct.
