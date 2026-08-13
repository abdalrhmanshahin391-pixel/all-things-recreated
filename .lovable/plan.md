# Faster Committee Navigation + Full Security Fix

## 1. Make the Committee section feel instant

What's happening now: each committee page fetches its data only after you land on it, and the year page runs its queries in a chain (year, then subjects/semesters, then modules) — so a click waits on three round trips before anything renders. Cached data also expires quickly (15–30 seconds), so going back into a course you just visited refetches everything again.

Changes:
- Prefetch on hover/tap: when you hover or press a year, semester, module, or subject card, its data starts loading before the page opens.
- Flatten the year query waterfall: fetch year, subjects, semesters and modules together instead of in three sequential steps.
- Longer cache retention for committee data (years, subjects, resources) so moving back and forth reuses what's already loaded instead of refetching.
- Keep previous data visible while new data loads, so switching a course shows content immediately instead of a blank skeleton.
- Cache the committee role lookup once per session instead of per page.

## 2. Security — fix every open finding

A full scan returned five issues; all get fixed:

- **Critical — file storage is wide open.** A single rule lets any signed-in user download paid lecture videos, exam question images, and committee-only files, overriding the stricter ownership rules. Fix: remove that blanket rule and let only the ownership/enrollment rules apply, keeping genuinely public assets (logos, course images, site media) readable.
- **Paid committee materials readable by anyone signed up.** Committee resources are visible to any active account regardless of purchase. Fix: tie resource visibility to committee membership, admin, or an actual purchase/enrolment for the linked course, while leaving free subjects open.
- **Admin hub layout readable by every signed-in user.** Fix: restrict it to admins.
- **Database helper functions callable by the public / by any signed-in user.** Fix: audit each one and revoke execution from anonymous and signed-in users except the small set that genuinely needs to be public (username/phone availability, public counts, university lookup); admin helpers already re-check the caller's role internally and stay admin-only.

After the fixes I re-run the scan to confirm it comes back clean.

## Technical notes

- Storage: drop `storage_read_signed_in`; replace with per-bucket policies — public read for `university-logos`, `course-images`, `site-media`; ownership/entitlement-scoped for `question-images`, `lecture-videos`, `committee-files`, `committee-images`.
- `committee_resources` SELECT policy rewritten around `can_manage_committee()` OR a subject-access/purchase check via `committee_subject_courses` + `user_courses`.
- `admin_hub_layout` SELECT gated by `has_role(auth.uid(),'admin')`.
- `REVOKE EXECUTE ... FROM anon, authenticated` on SECURITY DEFINER functions, then selective `GRANT` back.
- Frontend only for perf: `queryOptions` + `queryClient.prefetchQuery` on hover, single combined query for the year page, `staleTime` ~5 min with `placeholderData: keepPreviousData`.
