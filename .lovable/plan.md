# Five fixes: flagging, iPad page viewer, device locks, committee title, group deletion

## 1. "Skip" becomes "Flag" in Final Approval

- Replace the Skip button with a Flag button that marks the current question as flagged
  (yellow "needs a look" state) and moves to the next one.
- Flagged questions already have a filter in the top bar, so flagged items are easy to find later.
- If a question is already flagged, the button turns into "Unflag".
- Plain navigation is unchanged: Previous / Next stay as they are.

## 2. Page viewer is glitchy on iPad

Rework the picture pane so touch behaves properly:

- Pinch with two fingers to zoom, one finger to drag; the browser's own page scroll and
  pinch are blocked inside the pane so the picture no longer jumps around.
- Movement follows the finger using pointer capture on the pane itself (not the picture),
  and updates are painted per animation frame so dragging stays smooth.
- Double tap to zoom in, double tap again to reset.
- Highlight mode keeps working with one finger, in the same fraction-based way.

## 3. Device limit check

Checked the live data: the site-wide limit is set to **30**, no account has a personal
limit override, and **no account is currently locked**. So the rule itself is working —
someone on 3 platforms is not blocked today. What can still happen is a lock left over
from before the limit was raised to 30 (a lock stays until cleared manually).

Fix: when a locked account's lock reason is the device limit and its device count is now
within the current limit, the lock clears itself on next sign-in instead of staying stuck.
Manual locks set by an admin are never cleared automatically.

## 4. Staff team title in both languages

Under the Arabic heading "لجنة الطب والجراحة" add "Medical and Surgical Committee" as a
secondary line. Both lines always show, in both languages.

## 5. Deleting groups (admins only)

- **MCQ Gen Pro group list**: delete stays admin-only and removes everything — group,
  pages, pictures and questions. It therefore disappears from Question approval too.
- **Question approval group list**: a new admin-only delete that clears only the review
  copy — the extracted questions for that group — while keeping the group and its uploaded
  pages in MCQ Gen Pro, so the pages can be sent for extraction again.
- Both deletes ask for confirmation first and explain exactly what will be removed.
- QA reviewers see no delete buttons anywhere.

## Technical notes

- `src/routes/admin.aqua-mcq-gen.$groupId.approval.tsx`: swap Skip for Flag (calls
  `amgUpdateItem` with `flagged`), then advance index; rewrite the viewer's pointer
  handling (multi-pointer map for pinch, `touch-action: none`, rAF-batched pan/zoom,
  double-tap handler).
- `src/lib/aqua-mcq-gen.functions.ts`: add `amgClearGroupItems` (admin-only via
  `ensureStaff`) deleting `amg_items` for a group plus an `amg_events` entry; keep
  `amgDeleteGroup` as-is.
- `src/routes/admin.aqua-mcq-gen.approval.tsx`: per-group delete button for admins only
  (`useAuth().isRealAdmin`) with an alert dialog, calling `amgClearGroupItems`.
- `src/lib/devices.functions.ts`: in `recordDevice`, before the lock branch, auto-clear
  `locked_at` when `lock_reason = 'device_limit'` and the device count fits the limit.
- `src/routes/committee.team.tsx`: add the English line under the Arabic `h1`.
