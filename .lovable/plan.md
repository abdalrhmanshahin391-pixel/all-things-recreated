# Give lecture staff their own editing tool

## What you get

When you add someone as staff on a lecture course, they get a small entry in their account menu — **My lecture courses** — that opens only the courses they teach. Inside, they can run the course fully:

- Add, rename, reorder, hide and delete **topics**
- Add and remove **lecture videos** (upload or link)
- Add, replace and remove **PDFs and materials** (topic-level and course-wide)
- Add and remove **resource links and quiz links**
- Create and edit **quizzes and questions**, including show/hide
- Add, edit and remove **live classes** (date, time, meeting link, weekly repeat) and post recordings afterwards

They cannot: create or delete a course, change the course title, price, year, university, published state, or add/remove other staff. Those stay with you.

## Where they find it

- A **My lecture courses** item appears in the account menu for anyone who is staff on at least one course (and stays hidden for everyone else).
- On a lecture course page they teach, a small **Manage this course** button appears next to the title.

## Technical notes

- Access rules in the database already allow staff to write topics, lessons, materials, questions, quizzes and classes for their own course, and block everything else — no migration needed.
- `src/routes/admin.lecture-centre.tsx`: add a **Topics** tab holding the topic/lesson editor (topics list with add/rename/reorder/hide/delete, and per-topic lesson rows for video, PDF upload/link, resource link, quiz link), reusing the existing lecture upload helpers from `admin.lectures.tsx`. The Course tab renders read-only fields for staff (`canManageCourse` already false for non-admins), and the Staff tab becomes view-only for them.
- `src/components/SiteHeader.tsx`: query `lecture_staff` once for the signed-in user (cached) and render the menu link when the user is staff or admin.
- `src/routes/lectures.$courseId.index.tsx`: show a Manage button when the user is admin or staff on that course.
- Keep every media view inside the existing `ProtectedContent` / signed-URL PDF reader path.

## Approximate cost

Around **6–9 credits**: roughly 4–5 for the topics/lessons editor inside the Lecture Centre, 1–2 for the staff-only menu entry and course shortcut, and 1–2 for permission checks and testing.
