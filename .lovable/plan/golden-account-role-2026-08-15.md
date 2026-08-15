# Golden Account role

A new role, **Golden account**, that unlocks every paid course and lecture for a member — without giving them any admin powers.

## How it works

- Golden is a third role alongside Admin and Committee. It grants nothing in the admin area; it only affects paid content.
- The moment you flip Golden on for someone, they instantly own every current questions course and lecture course (they appear in "My courses" / "My lectures" like a normal purchase, at no cost).
- Any course you create later is automatically added to every Golden member, so the role stays up to date on its own.
- Turning Golden off removes the free grants again, but keeps anything they actually paid for. Grants made by Golden are tagged, so paid ownership and gifted ownership never get mixed up.
- Golden members remain normal users everywhere else: no admin menu, no committee tools.

## Where you manage it

On the Users admin page (`/admin/users`), each person's row gets a third toggle: **Golden**, next to Admin and Committee. The filter chips and the counters at the top gain a Golden option too, so you can see who has it at a glance.

## Technical notes

Two migrations (the enum value must be committed before it can be used):

1. `ALTER TYPE public.app_role ADD VALUE 'golden';`
2. Access plumbing:
   - Add nullable `granted_reason text` to `user_courses` and `user_lecture_courses` (value `'golden'` for role-based grants, `NULL` for purchases/manual grants).
   - `public.sync_golden_user(_user_id uuid)` (security definer): inserts missing rows into both access tables for all courses with `granted_reason='golden'`, on conflict do nothing.
   - `public.revoke_golden_user(_user_id uuid)`: deletes only rows where `granted_reason='golden'`.
   - Trigger on `public.user_roles` (AFTER INSERT/DELETE) calling those two when `role = 'golden'`.
   - Trigger on `public.courses` (AFTER INSERT) enrolling every current golden member into the new course, choosing the access table by `kind`.
   - Backfill nothing initially (no golden members exist yet).
   - RLS: existing per-user policies on the access tables already cover reads; the new functions are security definer and only reachable through the role triggers, so no new client-facing policy is needed.

Frontend:
- `src/routes/admin.users.tsx`: add the Golden toggle, filter chip and counter, reusing the existing `admin_grant_role` / `admin_revoke_role` RPCs (they already accept any `app_role`).
- No change to course-gating code: because Golden works by real ownership rows, every existing check (`user_courses`, `user_lecture_courses`, `user_owns_lecture_course`, checkout, RLS) keeps working unchanged.
