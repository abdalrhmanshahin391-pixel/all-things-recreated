# University cards restyle + 2 security fixes

## 1. Make the cards look like the reference

The reference shows tall, chunky, fully-rounded cards with a colored wash; the rebuilt page currently renders short, flat, wide cards on a plain dark surface, and the "Coming soon" pill crashes into the title.

Changes to the tile components on the university page:

- **Shape**: taller cards with a shared minimum height so all three match, larger corner radius, softer thick border and a deeper drop shadow — the rounder profile the Resources card already has.
- **Color**: each card gets a tinted wash instead of the flat surface — the amber/gold family for Courses, a cool navy/slate family for Lectures, and the existing gold gradient for the highlighted Resources card. The tint follows the tile's configured accent/lock color, so admins keep control from the card editor.
- **Layout inside the card**: icon chip top-left in a soft rounded square, lock (or arrow) button top-right in a circle, then title, subtitle and the count pill pushed to the bottom, so the centered "Coming soon" badge no longer overlaps the heading.
- **Details**: "Locked for users" caption sits under the count pill; the FREE badge and arrow keep their position on the highlighted card.

All colors go through theme tokens (new ones added to the global stylesheet where needed) rather than one-off hardcoded colors, so both themes stay correct.

## 2. Security issues

Two warnings are open in the scan:

- **Coupon redemptions can be faked.** Any signed-in user can currently write a redemption row for any coupon with any amount, because the rule only checks the row belongs to them. Fix: remove direct write access and let redemptions be created only by the existing coupon-apply routine, which validates the coupon and computes the amounts on the server.
- **Paid subject listings visible to everyone.** Subject names for paid tiers are readable by anonymous visitors whenever the course is published. Fix: tighten the read rules so free/public subjects stay visible while paid subjects are listed only for users who own the course; admins and committee managers keep full access.

Both are database migrations; afterwards I re-run the scan to confirm it comes back clean.

## Technical notes

- Restyle is confined to `HubTile` / `ResourcesTile` / `LockBadge` in `src/routes/u.$uniSlug.tsx` plus any new tokens in `src/styles.css`.
- Migration 1: drop the permissive `INSERT` policy on `coupon_redemptions` (`apply_coupon` is `SECURITY DEFINER`, so redemption keeps working).
- Migration 2: replace the anon/authenticated `SELECT` policies on `subjects` with versions that also check `access_level` (`free_public` for anon, `free_public`/`free_logged_in` for signed-in) or ownership via `user_courses`.