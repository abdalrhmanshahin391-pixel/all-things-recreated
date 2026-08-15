# Ad Studio — a poster maker for your Telegram channel

A new admin page, **Ad Studio** (`/admin/ad-studio`), added as a tile in the admin home panel. It makes square (1:1) promo images you download and post to Telegram, in the AquaQBank navy + gold identity.

## How it works

1. **Pick what you're advertising.** A source picker pulls real data straight from the site — a course (title, price, discount, badge, image), a package, a coupon code, a university, or a free-form announcement/reminder. Everything it fills in stays editable.
2. **Pick a template.** A gallery of navy/gold square layouts: big-price offer, course spotlight, countdown/deadline, coupon code, "new lectures added", quote/tip card, university announcement, plain bold statement. Each is a real layout, not a filter.
3. **Edit everything.** A live canvas with a side panel: headline, subheadline, body, badge/ribbon text, price + old price, CTA text, Arabic/English (with proper RTL), font size and weight, alignment, text color, shadow/outline, per-element drag to move, show/hide any element, logo on/off and its corner, watermark, corner radius, padding, overlay darkness.
4. **Backgrounds, your way.** Choose from: brand gradients, solid colors, pattern library (medical icons, grids, dots, rays, noise), upload your own image, reuse a course/university image already on the site, **use a snapshot of your own home page** as the backdrop, or **generate a background with AI** from a text prompt (see below).
5. **AI help.** Two buttons: *Write the copy* (AI drafts headline / subheadline / CTA in Arabic + English from the selected course or your brief, several variants to click through) and *Generate background* (AI makes a square background image from your prompt, brand-tinted). AI never draws the text — text stays crisp and editable.
6. **Export & reuse.** Download PNG (1080×1080, high-DPI), copy to clipboard, and copy a ready Telegram caption with the link. Every ad is saved to a gallery so you can reopen, duplicate and re-edit it later, and you can save your own templates.

Nothing is public — the page is admin-only and the ads are just images you download.

## Suggested build order

- **Phase 1 (core):** page + admin tile, template gallery, live square canvas, full text/colour/layout editing, background presets + upload + site images, PNG export, saved-ads gallery.
- **Phase 2 (data + AI):** auto-fill from courses/packages/coupons/universities/announcements, AI copywriting, AI background generation, Telegram caption generator.
- **Phase 3 (polish):** home-page snapshot backgrounds, drag-to-position elements, custom saved templates, duplicate/variant generation, extra decorative packs.

## Technical notes

- Route `src/routes/admin.ad-studio.tsx`, admin-guarded like other admin pages, plus a tile in `src/lib/admin-hub-defaults.ts` (Content group).
- Canvas rendered as real DOM (styled with existing design tokens) and exported via `html-to-image` at 2× scale to 1080×1080 PNG — keeps text sharp and editable, no canvas drawing code.
- New table `public.ad_creatives` (id, owner, title, template key, JSON `design`, preview path, timestamps) with RLS restricted to admins, plus GRANTs. Uploaded/generated backgrounds and previews go to a new `ad-media` storage bucket (admin-write, signed reads).
- AI copy: `createServerFn` in `src/lib/ad-studio.functions.ts` calling Lovable AI (`google/gemini-3.6-flash`) with a strict JSON schema for headline/subheadline/CTA variants in both languages.
- AI backgrounds: server function posting to the AI Gateway image endpoint (`google/gemini-3.1-flash-image`), square output, stored to `ad-media` and referenced by path. No client-side keys.
- Home-page snapshot backgrounds are captured client-side from the rendered page, not by a headless browser.
- Arabic support reuses the existing i18n/RTL conventions and site fonts.
