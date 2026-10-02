# Fix the back buttons in Question approval for QA members

Two small changes so QA members never get sent toward Aqua MCQ Gen Pro or the admin panel.

## 1. Approval screen (second picture): "Back to groups"

File: `src/routes/admin.aqua-mcq-gen.$groupId.approval.tsx` (line 298)

- The "Back to groups" link currently points to `/admin/aqua-mcq-gen` (the MCQ Gen Pro page, which is admin-only).
- Change it to point to `/admin/aqua-mcq-gen/approval` and rename the label to "Back to question approval".

## 2. Group chooser screen: "Back to admin"

File: `src/routes/admin.aqua-mcq-gen.approval.tsx` (line 80)

- The "Back to admin" link currently points to `/admin` (the admin panel, admin-only).
- Change it to point to `/` (the homepage) and rename the label to "Back".

## What stays the same

- QA members keep full use of the approval screen itself (review, approve, flag, delete, highlight — everything already allowed there).
- Aqua MCQ Gen Pro (extraction, solving, importing) and the admin panel stay admin-only; the server-side checks that block QA from them are untouched.
- Admins see the same two buttons with the new labels/destinations — the approval flow works identically for them.

## Verify

- Build passes; then as a QA member: open Question approval, open a group, press "Back to question approval" (lands on the group chooser), press "Back" (lands on the homepage).
