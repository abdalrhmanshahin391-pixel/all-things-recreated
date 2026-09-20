# Let QA members find Final Approval

## What's wrong

The Final approval screen exists and QA members are allowed to use it, but there is no door leading to it for them:

- The admin panel (`/admin`, where the "Question approval" tile lives) only opens for admins and committee heads — QA members are redirected away.
- The account menu in the header has no link to the approval screen for QA members.

So a QA member has no way to reach `/admin/aqua-mcq-gen/approval` unless someone hands them the link.

## What will change

### 1. A "Question approval" entry in the QA account menu
- In `src/components/SiteHeader.tsx`, add a menu link "Question approval" (icon `CheckCheck`) pointing to `/admin/aqua-mcq-gen/approval`.
- Shown when the signed-in member is QA (`isQa`) — including QA members who are not admins. Admins keep reaching it through the admin panel as today; the link also shows for admins for convenience only if they aren't already covered (to avoid duplicates, show it for `isQa && !isAdmin`, or simply for all QA — decided by what's cleanest in the existing menu structure, no other menu items touched).

### 2. Nothing else changes
- The approval chooser page and its access rules already allow QA — no change needed there.
- QA still cannot open the admin panel itself, the MCQ generator, solving, or importing.

## Verify

- Typecheck/build, then sign in as a QA member: open the account menu, tap "Question approval", land on the group chooser, open a group's approval screen.
