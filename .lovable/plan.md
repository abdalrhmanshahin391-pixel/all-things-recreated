# Own-branded Google sign-in + faster Drive downloads

## 1. No more "Lovable" on the sign-in screen

Right now Google sign-in goes through the platform's shared OAuth app, so the extra
consent page says "Lovable / Grant permission to AquaQbankPro". The only way to remove
that page is to use **your own Google OAuth client** — then the only screen users see is
Google's own, showing *aquaqbank.com*, with your name and logo. Nothing mentions the
builder.

What you do (5 minutes, one time):
1. Open Google Cloud Console → APIs & Services → OAuth consent screen. App name:
   **AquaQBank**, support email: aquaqbank@gmail.com, logo: your gold A mark.
   Authorized domain: `aquaqbank.com`.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Paste the callback URL I give you into "Authorized redirect URIs".
4. Send me the Client ID and Client Secret through the secure form I'll open.

What I do:
- Give you the exact callback URL to paste.
- Store the client ID/secret and switch the project's Google provider from the shared
  app to yours, so the intermediate permission page disappears entirely.
- Keep the sign-in button, `/auth/callback`, and the `/welcome` profile step exactly as
  they are — only the provider credentials change.
- Also turn off the small "Edited with Lovable" badge on the published site.

Until the credentials exist the current (working) sign-in stays live, so nothing breaks
in between.

## 2. Faster downloads in لجنة الطب والجراحة

Files stay exactly where they are on your Drive — only the way the browser fetches them
changes.

Today "Save" opens a new tab pointing at Drive's download URL without the confirmation
token. For anything sizeable Google first serves a "can't scan this file for viruses"
HTML page, so the user waits, sees a strange Google page, and has to click again. That
is most of the perceived slowness.

Changes:
- Add Google's confirmation token to the download URL so the file starts streaming
  immediately, with no interstitial page and no second click.
- Download in place (hidden anchor) instead of opening a new tab, so people stay on the
  subject page.
- Preload the Drive host connection when the subject page renders (`preconnect` /
  `dns-prefetch` to `drive.usercontent.google.com`), which removes the DNS + TLS delay
  before the first byte.
- Same treatment for the in-site PDF viewer: preconnect to the Drive preview host so the
  reader opens noticeably quicker.

Direct downloads from Google's own servers are the fastest possible path — proxying the
bytes through the site would make them slower, so I'm keeping them direct.

## Technical notes

- Provider swap is a Cloud auth-settings change (Google client ID + secret), no code
  change to `GoogleButton.tsx`.
- `drive_download_link` is built in `driveMakePublic` (`committee-drive.server.ts`) as
  `drive.usercontent.google.com/download?id=…&export=download`; add `&confirm=t`, and
  normalise existing rows at read time in `committee.$year.$subject.tsx` so old
  resources benefit without a data migration.
- Replace the `<a target="_blank">` Save button for Drive PDFs with a click handler
  using a hidden `download` anchor.
- Add `<link rel="preconnect">` for `drive.usercontent.google.com` and
  `drive.google.com` in the root head.
