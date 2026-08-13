# Rebuild AquaQbank from your backup

You uploaded exactly the two pieces your own restore guide calls for: the full source-code snapshot (`AquaQbank_1.zip`, 419 files including 32 database migrations) and the data/storage transfer package (`aquaqbank-site-2026-08-13.zip`, 43 table exports plus storage files and the Drive manifest). The rebuild follows that two-step path.

## Step 1 - Restore the code

- Replace the blank starter with the full project: all of `src/` (362 files: routes, components, libs, i18n, themes), `public/` (favicon, web manifest, robots), and config files (`vite.config.ts`, `tsconfig.json`, `components.json`, eslint, prettier, `AGENTS.md`, `README.md`).
- Install the exact dependency set from the snapshot's `package.json` (TanStack Start + Router, Supabase, Radix/shadcn, framer-motion, i18next, pdfjs-dist/unpdf/pdf-lib, katex, recharts, jszip/fflate/pako, Paddle SDK, Lovable email/webhooks).
- Skipped on purpose: `.env` and `bun.lock` (environment-specific, regenerated), `node_modules`, and the old plan history.

## Step 2 - Recreate the backend

- Enable Lovable Cloud on this project (database, auth, storage, server functions).
- Apply the 32 migrations in order, recreating every table, enum, RLS policy, grant, function, trigger, and storage bucket the app expects.
- Re-add the secrets the app needs (Paddle, Gemini/AI keys, transfer unlock code, email). These are deliberately not in the backup - you paste the values, I store them securely.

## Step 3 - Bring back your content

Once the app runs, restore data through the site's own **Admin - Site Transfer - Restore**, using `aquaqbank-site-2026-08-13.zip` and your transfer code. That path was built for this export and handles table order, storage uploads and the Drive manifest correctly.

If you'd rather not do it by hand, I can instead import the JSON tables and storage files directly - say the word and I'll add it to the work.

## What you get back

Public site, courses and question runner, German module, committee tree and study plan, Study Hub, the full admin suite (people, roles, question bank, generators, transfer, theming, marketing) and the themes/site content - plus your rows, images and PDFs after step 3.

## Notes

- Auth accounts live in the auth system, not in the table export; `profiles` and `user_roles` restore, but people may need to sign up or reset passwords again unless the transfer tool recreates accounts.
- The published domain and Search Console verification must be re-attached after publishing.
- Large history tables in the export (committee activity log ~3.5 MB, login events ~300 KB) are restored last so the site is usable sooner.