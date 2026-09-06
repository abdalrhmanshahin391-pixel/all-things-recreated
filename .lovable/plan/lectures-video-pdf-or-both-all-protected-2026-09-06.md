# Lectures: video, PDF, or both — all protected

## What you get

Inside a lecture course, each lesson can now be:

- a **video** lesson (as today),
- a **PDF** lesson (notes, slides, handouts),
- or **both** — one lesson holding a video and its PDF side by side.

Students see the same lesson list; a lesson shows a "Watch" button, an "Open PDF" button, or both. Quizzes stay exactly as they are.

Everything opens inside the site's protected reader — no direct file links, no download button, signed access that expires, and the same screenshot/copy protection and watermark already used across lecture pages. Free/paid marking per lesson keeps working for PDFs too.

## In the admin lecture builder

When adding a lesson you pick what it contains:

- Video: keep the existing choice of an upload or a link.
- PDF: upload a file, or paste a link to one already hosted.
- Both: fill in both fields on the same lesson.

Existing lessons get an "Add PDF" / "Replace PDF" / "Remove PDF" control, so nothing already uploaded has to be redone.

## Technical notes

- `lecture_items`: add `pdf_url text`, `pdf_storage_path text`. `kind` stays `lecture` | `quiz`; a "lecture" is video-only, PDF-only, or both depending on which fields are set. Existing rows are unaffected.
- New private storage bucket `lecture-pdfs`, with RLS on `storage.objects` mirroring `lecture-videos`: admins write; course owners, golden accounts, and `is_free` lessons read. Signed URLs generated at open time (short expiry) via a helper next to `src/lib/lecture-video.ts`.
- Student page (`src/routes/lectures.$courseId.index.tsx`): lesson row renders Watch and/or Open PDF actions; a new `LecturePdfModal` renders the signed URL in a sandboxed viewer with right-click, print, and download suppressed, inside the existing `ProtectedContent` wrapper (context `lectures`), so capture attempts keep logging to the protection dashboard.
- Admin page (`src/routes/admin.lectures.tsx`): lesson-type selector, PDF upload/link inputs, per-item PDF replace/remove, and PDF path included in the item insert/update calls.
- Site transfer/backup (`src/lib/site-transfer.server.ts`) gains `lecture-pdfs` paths so exports keep including lecture files.

## Approximate cost

Around **4–6 credits**: one database change plus storage rules, the protected PDF reader, the student lesson list changes, and the admin builder changes. Simpler than that if you later only want PDF links rather than uploads.
