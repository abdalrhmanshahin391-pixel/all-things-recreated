# Fix: "Final approval" button does nothing, and no entry in the admin panel

## What's wrong

1. **The button changes the address but the page never appears.** The Aqua MCQ Gen Pro page acts as the parent of its approval and solve sub-pages, but it never makes room for them on screen. So pressing "Final approval" quietly does nothing visible.

2. **There is no approval entry in the admin panel.** Approval only exists as a button inside a selected group, and the admin menu additionally hides anything named "final approval" (a leftover rule from an old deleted tool), so such a tile could never show up.

## What will change

### 1. Make the sub-pages render
- `src/routes/admin.aqua-mcq-gen.tsx` becomes a thin wrapper that renders `<Outlet />`.
- Its current content (keys, group list, upload, extraction) moves unchanged into a new `src/routes/admin.aqua-mcq-gen.index.tsx`, keeping the same route path `/admin/aqua-mcq-gen`, its `head()` metadata, and all existing behaviour.
- Result: "Final approval" and "Solve & import" open properly, and the browser back button returns to the group list.

### 2. Add an approval entry to the admin panel
- New route `src/routes/admin.aqua-mcq-gen.approval.tsx` — a simple chooser that lists the groups (name, status, counts) and opens the approval screen for the one you pick, with an empty-state message when there are no groups yet.
- Add a tile "Question approval" (icon `CheckCheck`) to the Tools group in `src/lib/admin-hub-defaults.ts`, pointing at that route.
- Relax the legacy hide-rule so it only blocks the old removed paths (`/admin/final-approval`, `mcq-generator`, `124`) and no longer hides tiles just because their label contains "final approval". The old routes stay hidden.

### 3. Verify
- Typecheck, build, then open the flow in a browser session: group list → Final approval → back, and the new admin panel tile → chooser → approval screen.

## Technical notes

- TanStack Router nests `/admin/aqua-mcq-gen/$groupId/approval` under the `admin.aqua-mcq-gen.tsx` route, so that parent must render `<Outlet />`; the page body has to move to an `*.index.tsx` leaf.
- `src/routeTree.gen.ts` regenerates automatically; no manual edit.
- No database, server function, or permission changes — QA and admin access rules stay exactly as they are.
