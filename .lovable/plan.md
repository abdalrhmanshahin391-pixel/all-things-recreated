# Fix the unlocked-cards flash on the university page

## What is happening

On `/u/ysmu`, the page draws its three cards (Courses, Lectures, Resources) before the card settings have loaded. While that request is in flight the page falls back to built-in default cards, which are always shown as open and clickable — that is the one-second "everything is unlocked" frame you see on refresh. Once the real settings arrive, the locks snap back on.

The same gap applies to the admin check: for the first moment the page does not yet know whether you are an admin.

Note on security: the flash is a visual one only. The locked sections are still protected by their own page-level access rules and by the database, so a fast click during that frame does not open closed content. It should still not appear, and this fixes it.

## The fix

- Wait for the card settings before drawing any card. While they are loading, the page shows the existing skeleton placeholder instead of the default cards, so no open-looking card is ever painted.
- Make the built-in fallback cards (used only when a university genuinely has no saved card rows) inherit the locked/hidden state that the university record already carries, instead of defaulting to open.
- Hold the grid until the sign-in state has resolved too, so admin-only cards don't flash either way.

## Technical notes

In `src/routes/u.$uniSlug.tsx`:
- Read `isPending` from the `university-tiles` query and include it (plus `loading` from `useAuth`) in the existing loading branch that renders the skeleton.
- Keep the queries enabled/keyed as they are; no data or policy changes.
