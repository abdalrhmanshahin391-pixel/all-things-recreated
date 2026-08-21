# Pick an already-uploaded committee file as a best source

Instead of only typing a source name, you'll be able to choose any file that already exists anywhere in the committee library (PDF, video, folder item or link) and add it directly as a best source.

## What changes in the "Add source" dialog

- Two ways to add, shown as a small switch at the top:
  1. **From the committee** (new, default) — a searchable list of every file already uploaded in the committee, showing its location (e.g. `Year 3 › Physiology › CVS`). Tap one to select it.
  2. **Write it manually** — the current behaviour (type a name, e.g. "Robbins & Cotran").
- When you pick a committee file, the name and the type (Book / Video / Lecture notes …) are filled in for you and can still be edited; you keep the stars, note and "Top pick" options.
- Search filters by file title and by its location, so typing "Physio" or "ECG" narrows the list fast.

## What changes on the card

- A source linked to a committee file shows an **Open file** button that opens it the same way as elsewhere in the subject page (Drive preview link, or the stored file), instead of a plain external link.
- A small line shows where the file lives in the committee, so students know it's an internal resource.
- If the linked file is later deleted from the committee, the source stays but falls back to plain text (no dead button).

## Responsive

The picker list scrolls inside the dialog on phone and iPad, rows are tap-sized, and long titles/paths truncate on one line.

## Technical notes

- No migration needed: `committee_best_sources.resource_id` (FK to `committee_resources`, `ON DELETE SET NULL`) already exists and is currently unused.
- Reuse `useCommitteeLibrary()` from `src/components/committee/ExistingFilePicker.tsx` for the searchable list (it already resolves year › subject › category paths and filters to real stored files).
- `SourceDialog` in `src/components/committee/BestSources.tsx` gains a mode toggle and a `resourceId` state; on save it writes `resource_id`, plus `title`/`kind` copied from the picked file, and leaves `url` null for internal picks.
- The list query selects `resource_id` too and joins against the library cache to resolve `drive_web_link` / `file_path` for the Open button; storage files open through the existing signed-URL helper used by the subject page.
- Backup/export already includes `committee_best_sources`, so `resource_id` is carried along automatically.
