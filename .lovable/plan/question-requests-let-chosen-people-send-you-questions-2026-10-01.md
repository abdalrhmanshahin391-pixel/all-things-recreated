# Question Requests: let chosen people send you questions

## What you get

**For you (Admin panel → new "Questions Request" tool)**
- A "Contributors" list: search a user by name/username and give or remove permission to send questions.
- See every group from every contributor: group name, who made it, number of questions, status (Completed / Not completed).
- Open any group: add, edit, delete questions (same editor as courses — stem, explanation, unlimited options, one or several correct answers, picture).
- Rename or delete any group.
- "Add to course": pick course → section, choose a subject name, and the questions are copied into a new subject (same way the Question Bank already does it). Only you can do this.

**For contributors (new "Questions" item in the account menu, under Packages)**
- Only visible to people you assigned.
- "Create group" with a name.
- Inside a group: add/edit/delete questions with the same editor (options, multiple correct answers, explanation, picture).
- Mark the group Completed / Not completed.
- Rename or delete only groups they made. They never see other people's groups and cannot add anything to a course.

## Technical details
- New role value `contributor` in the existing roles table (granted/revoked from the admin tool via existing `admin_grant_role`/`admin_revoke_role`).
- New tables: `request_groups` (name, owner, status, timestamps), `request_questions` (group, stem, explanation, answer_mode, image_path, sort_order), `request_question_options` (label, text, is_correct, sort_order). GRANTs + RLS: owner (with contributor role) manages own rows; admin manages all.
- Pictures reuse the `question-images` bucket under a `requests/` folder, with a storage policy for contributors.
- Editor: adapt the existing question editor so it can save into either course questions or request questions.
- "Add to course" is an admin-checked server function reusing the existing pour-into-course logic.
- New pages: `/questions` (contributor), `/questions/$groupId`, `/admin/question-requests`, plus an Admin hub tile and the account-menu link.

## Cost
Build credits are usage-based, so an exact number can't be given. This is a medium-sized feature (database change + 3 pages + editor reuse); typically it takes one main build message plus a follow-up or two for fixes.
