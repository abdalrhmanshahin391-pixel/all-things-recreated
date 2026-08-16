# Committee head: cleaner admin hub + a real member search

## 1. Show only what the head needs
On the admin hub, a committee head currently sees four tiles: Committee Hub, Committee Log, Committee Team, Events.
Reduce that to **Committee Team** and **Committee Log** only (Committee Hub and Events are removed from the head's allowed tiles). Admins keep seeing everything.

## 2. No more bouncing to the home page
The Committee Team page sends the visitor home whenever it decides they can't manage members. That decision can fire before the account's roles have finished loading, and an admin browsing with "admin mode" switched off is also treated as having no access — both land on the home page even though the page itself is fine and even when the team list is simply empty.

Fix:
- Only run the access check once roles are fully known; until then show the page skeleton instead of redirecting.
- Treat a real committee head as always allowed on this page, regardless of the admin-mode toggle.
- An empty team is a normal state: show "No committee members yet" instead of anything that could trigger a redirect, and surface any load error as a message on the page.

## 3. Easy, live user search when adding a member
Replace the blind "Username of the student" text box with a search field that lists matching users as you type (username, full name, email), the same pattern already used elsewhere in the app:
- Type 2+ characters -> a dropdown of matching users appears (username, full name, email).
- Click a user -> they're added to the committee directly by their account, so no typo can silently fail.
- Clear success/error feedback: "Added", "Already a member", or the actual reason it failed.
- The list refreshes immediately after adding or removing.

## Technical notes
- `src/routes/admin.index.tsx`: shrink the non-admin allowed tile set to `/admin/committee-log` and `/committee/manage-team`.
- `src/hooks/useCommitteeRole.ts` (or the page): keep `canManageMembers` true for a genuine `committee_head` even when admin mode is off; keep the guard gated on `loading`.
- `src/routes/committee.manage-team.tsx`: guard only after roles resolve; render empty/error states; swap the input for a debounced picker backed by the existing `head_search_users` RPC, and add the selected user via `head_set_committee_role(_user_id, true)` (falling back to `committee_team_add` by username if needed). Both RPCs already authorize admins and committee heads.
- No database or policy changes needed.
