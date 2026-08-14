# Google sign-in without the Lovable screen, and no auto-filled details

## 1. Remove the Lovable permission screen

Right now the Google button goes through Lovable's managed broker, which is why you see the
"Grant permission to AquaQbankPro" card with the Lovable logo before Google.

Change: the button will start the Google flow directly from our own backend auth, so the only
screen the user ever sees is Google's own account chooser, then straight back to AquaQBank.
Nothing in the journey mentions or shows Lovable.

Flow after the change: our page -> Google account chooser -> back to `/auth/callback` on our
domain -> `/welcome` (new accounts) or the page they came from.

## 2. Stop pre-filling name and username

The `/welcome` step currently guesses the full name from the Google profile and suggests a
username. That goes away:

- full name: empty, placeholder only, the user types it
- username: empty, placeholder only, the user chooses it (availability still checked)
- phone: unchanged, user types it
- email stays shown as read-only "signed in as", since it comes from the Google account

Validation and the taken-username check stay exactly as they are.

## Technical notes

- `src/components/auth/GoogleButton.tsx`: swap `lovable.auth.signInWithOAuth("google", ...)`
  for `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo:
  `${window.location.origin}/auth/callback` } })`. Same `next` handling in sessionStorage.
- `src/routes/welcome.tsx`: drop the `user_metadata` / profile prefill for `full_name` and
  `username`; initialise both to empty strings, keep the loaded email and the ready state.
- No database, RLS, or onboarding-guard changes.

Note: the Google consent page itself is Google's and will show the project's OAuth app name.
If that name should read "AquaQBank", that is a separate provider-credentials change we can do
after this.
