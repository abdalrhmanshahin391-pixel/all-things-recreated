# Lecture Centre: courses, topics, staff, live classes, protection

## 1. Fix the error you are seeing

Adding a subject fails because the subject is saved without the university it belongs to. The new builder always saves the course's university with each subject, so "Add" works again. Existing courses and subjects are untouched.

## 2. New Lecture Centre in the admin panel

A single page replacing the current cramped lectures admin:

- **Create a lecture course** — title, year, university, price, published/hidden.
- **Course cover** — an intro **image** or an intro **video** (upload or link); you choose which one shows on the course hero.
- **Course material** — files/links that belong to the whole course, not one topic.
- **Topics** — each topic can hold any mix of:
  - a lecture video (upload or link),
  - PDFs / materials,
  - questions (see below),
  - resource links,
  - quiz links.
  Topics can be reordered, renamed, hidden and marked free.

## 3. Lecture staff (per course)

- On each course you add staff by searching a username or email.
- Staff see only their courses, and can edit topic contents: videos, materials, questions, resource links and quiz links.
- They cannot create/delete courses, change price, or manage other staff — that stays with you.

## 4. Questions dashboard

- Topics can **link an existing question-bank quiz** and also hold **their own questions** written by staff.
- A questions dashboard per course lists every question with a **show/hide** switch, so staff can publish or pull a question without deleting it. Hidden questions never reach students.

## 5. Live classes

- Mark a course as **live**: add scheduled classes (title, date/time, meeting link for Google Meet/Zoom), including a weekly repeat such as "every Wednesday".
- Students in the course see an **Upcoming class** card with a Join button when it is time.
- Students get a **phone notification** before the class starts (uses the push system already in the site).
- After the class, staff post the recording and the class materials onto that class entry.

## 6. Protection

- New admin controls to switch protection on for **Lectures** and for the **Question bank** independently: block printing, block copying, and a watermark carrying the student's name, email and "Aqua QBank" across the content.
- Device security: content only opens on registered devices, using the device rules already in the site.
- On entering Lectures or the Question bank, students see a bilingual notice:
  - "This content is protected, and publishing it may expose you to legal liability."
  - "هذا المحتوى محمي، ونشره قد يعرضك للمساءلة القانونية."

## Technical notes

- Fix: include `university_id` (from the selected course) in every `lecture_subjects` insert in the lectures admin.
- Migration (with GRANTs + RLS on each new table):
  - `courses`: add `intro_image_url`, `is_live`.
  - `lecture_subjects` (topics): add `hidden boolean default false`.
  - `lecture_items`: add `link_url`, `resource_kind` for resource/quiz links.
  - New `lecture_course_materials` (course-wide files/links).
  - New `lecture_staff (course_id, user_id)` + security-definer `is_lecture_staff(_course_id, _user_id)` used by RLS on lecture tables so staff can write within their course only.
  - New `lecture_questions` (topic-owned questions) with `visible boolean`, plus `quiz_id` link column on items for bank quizzes.
  - New `lecture_classes` (course_id, title, starts_at, meeting_url, repeat_weekday, recording_url, materials, notified_at) with student-read policies gated on course ownership.
- Reminders: a scheduled server route under `src/routes/api/public/` sends push through the existing `push.functions`/`web-push.server` path for classes starting soon; `notified_at` prevents duplicates.
- Admin UI: new `src/routes/admin.lecture-centre.tsx` with tabs (Course, Topics, Materials, Questions, Live classes, Staff); linked from the admin hub and CoursesHub. Existing `admin.lectures.tsx` kept working during the switch, then retired.
- Student UI: `lectures.$courseId.index.tsx` gains the topic layout, course materials, upcoming/past classes; every view stays inside `ProtectedContent` with the new bilingual notice banner; PDFs keep the signed-URL `LecturePdfModal` reader.
- Protection toggles stored as new `site_settings` columns (`protect_lectures`, `protect_qbank`), surfaced in the content-protection admin page.

## Approximate cost

Around **14–20 credits** in total: roughly 3–4 for the database and permissions, 5–6 for the new admin centre, 3–4 for the student lecture experience, 2–3 for live classes plus reminders, and 1–2 for the protection controls and bilingual notice.
