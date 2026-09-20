# Highlighting, the QA role, and duplicate details

Three fixes for Aqua MCQ Gen Pro plus the missing QA role in the roles screen.

## 1. Highlight on the original page (Final approval)

Add a highlighter to the page viewer on the approval screen:

- A "Highlight" button next to zoom/reset. When on, dragging on the page draws a translucent yellow box instead of panning.
- Boxes stick to the page as you zoom or move, so a marked line stays on the same words.
- "Undo last" and "Clear" buttons.
- Marks are a reading aid only — they live while you review that page and are not saved or shown to students.

## 2. QA role

- QA gets committee-level viewing/editing access **plus** the Final question approval screen.
- QA does **not** get Aqua MCQ Gen Pro (extraction, solve, import). Those stay admin-only. A QA member opening the generator sees a short "admins only" message.
- QA appears in the roles screen (`/admin/users`): a QA filter, a QA count, and a QA toggle on each person's card, alongside Admin / Committee / رئيس اللجنة / Golden.
- Admins keep everything they have today.

## 3. Duplicate details

In the "Repeated questions" tab, each group becomes expandable:

- Shows every copy (kept and repeats) with its page, question number and full question text side by side.
- Matching text is shown plainly; differing wording is marked so you can see exactly why two questions were treated as the same.
- Each copy gets "Open in review" (jumps to that question) and "Delete this one", so you choose which copy survives instead of only deleting the extras.

## Technical notes

- Split the access check: `can_use_amg(uuid)` becomes admin-only (generator, solve, import, page storage); a new `can_review_amg(uuid)` = admin or qa gates approval-stage functions and the `amg_items` / `amg_events` / `amg_pages` read policies used by the approval screen. `src/lib/aqua-mcq-gen.functions.ts` gets a second guard (`ensureReviewer`) used by `amgGetGroup`, `amgPageUrls`, `amgListItems`, `amgUpdateItem`, `amgAddItem`, `amgDeleteItems`, `amgSetStatus`, `amgDuplicates`, `amgCompleteItems`, `amgListEvents`; the rest keep `ensureStaff`.
- Add `qa` to the committee access helpers (`can_access_committee_subject`, `can_manage_committee`) so QA reads/edits committee content like a committee member.
- `src/lib/admin-users.functions.ts`: stop stripping `"qa"` from the returned roles (line 110) and allow `qa` in `adminToggleUserRole`; `src/routes/admin.users.tsx`: add `qa` to `RoleKey`, `Filter`, `ROLE_LABEL`, the filter list, the stat row, and the per-user toggles.
- `amgDuplicates` returns `stem` already; extend the select to include `number_label` and return all copies in one `items` array plus a token-level diff computed in the UI.
- Highlight state in `admin.aqua-mcq-gen.$groupId.approval.tsx` is React state keyed by page number, rendered as absolutely positioned divs inside the same transformed layer as the image.
