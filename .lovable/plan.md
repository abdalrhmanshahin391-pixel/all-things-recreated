# Make account lock status reliable

## Confirmed cause
- The student shown in the screenshot is currently unlocked in the live account record and has only 3 registered devices, below the 30-device limit.
- The `/locked` page fetches the account status but never leaves the page when `locked` is false. It then displays the generic “paused by an administrator” message, creating a false lock screen.
- Device Security reads the current account lock field, so it correctly shows no block while the student can remain stranded on the stale lock page.

## Changes
- Make the locked page redirect an unlocked student back to the site immediately after checking their account.
- Recheck the lock state when the page becomes active again and periodically while it remains open, so an administrator’s unlock takes effect without requiring the student to clear data or sign in again.
- Show the lock interface and reactivation field only when the account is genuinely locked; show a neutral checking state while status is loading.
- Keep one canonical lock status in Device Security and display the lock reason (device limit, content protection, manual block, or suspension) beside every locked student.
- Refresh the Device Security lock list while the page is open so newly locked or newly unlocked students do not remain hidden behind stale admin data.
- Make every unlock/reactivation path clear all related lock fields together, preventing old suspension or message details from surviving after an unlock.

## Verification
- Verify the affected student with 3 of 30 devices opens the site normally and cannot remain on the lock page.
- Test a genuine device-limit lock, content-protection lock, manual lock, and suspension; confirm each appears in Device Security with the correct reason.
- Unlock each type and confirm both the student page and Device Security update promptly.
- Confirm device 1–30 remain allowed and only device 31 triggers the device-limit lock.
- Check phone and desktop layouts, then confirm a clean build.
