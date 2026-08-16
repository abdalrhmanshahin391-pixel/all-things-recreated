# Final pass: close the security gaps + smooth out the site

## 1. Security

A full scan came back with two open warnings, both about database helper functions being callable by people who shouldn't be able to call them. I checked every helper function and confirmed the exact list.

**Callable by signed-out visitors today (should not be):**
- Committee management helpers: `committee_team_add`, `committee_team_remove`, `committee_team_list`, `head_set_committee_role`, `head_search_users`, `head_list_committee_members`, `can_manage_committee_members`, `can_manage_events`
- Internal trigger-only functions that were never meant to be called directly: `on_course_created_grant_golden`, `on_golden_role_change`, `protect_profile_privileged_fields`, `log_committee_change`

**Stays public on purpose** (the sign-in and public pages need them): `identity_taken`, `get_email_by_username`, `university_id_by_slug`, `get_course_real_counts`, `get_subject_question_counts`, `event_visible`.

**Also tightened for signed-in users:** trigger-only functions get execution revoked from everyone; user search (`head_search_users`) and the committee team functions stay signed-in but already re-check the caller's role internally, so a normal student calling them directly gets nothing back.

After the change I re-run the scan and confirm it comes back clean, and re-check that sign-in, the committee team page, and the events page still work.

## 2. Make the site feel smoother

Frontend/presentation only — no behaviour changes:
- Cache the role/permission lookups once per session instead of refetching them on each page, so pages stop flashing a blank state while roles load.
- Longer cache retention on committee and course data plus "keep showing the previous page while the new one loads", so going back and forth between courses/years is instant instead of showing a skeleton each time.
- Prefetch on hover/tap for year, subject and course cards so the data is already there when the page opens.
- Trim work on first paint: lazy-load the heavy admin-only and PDF/canvas modules so regular visitors never download them.

## Technical notes

- Migration: `REVOKE EXECUTE ... FROM anon` (and `FROM anon, authenticated` for trigger-only functions) on the listed `SECURITY DEFINER` functions, with explicit `GRANT EXECUTE ... TO anon` kept for the six genuinely public ones.
- Client: shared `queryOptions` + `queryClient.prefetchQuery` on hover, `staleTime` ~5 min and `placeholderData: keepPreviousData` on committee/course queries, role lookup cached in the auth store.
- Route-level `React.lazy` for admin tools (Jarvis/AquaVisionX/ProX/Ad Studio) and PDF rendering libs.
