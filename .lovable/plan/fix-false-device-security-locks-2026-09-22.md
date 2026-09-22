# Fix false device-security locks

## Confirmed diagnosis

- The site-wide device limit is currently **30**, with no personal overrides.
- The rule already allows devices 1–30 and rejects only a new 31st device.
- The screenshot is not a device-limit failure: the affected account has **1 device out of 30** but is locked with the separate reason `content_protection`.
- That protection lock was produced by 141 ordinary `focus_loss` events (switching tabs/apps or hiding the page). The global device checker currently treats any account lock as a device-limit failure and sends the user to the misleading device page.

## Changes

1. **Separate device limits from other account locks**
   - Make the device check enforce only `device_limit` locks.
   - Never show the “too many devices” screen for content-protection or manual account locks.
   - Keep the exact rule: 30 registered devices are allowed; device 31 is blocked.

2. **Stop ordinary tab switching from auto-locking accounts**
   - Continue recording focus changes for visibility, but exclude `focus_loss` alone from automatic account locking.
   - Keep stronger protection signals, such as screenshot, print, developer-tools, and screen-sharing attempts, available for protection enforcement.

3. **Repair the current false lock**
   - Unlock only the currently affected account whose lock was caused solely by accumulated focus-loss events.
   - Do not clear legitimate manual, device-limit, or stronger protection locks.

4. **Make the locked page reason-aware**
   - Device-limit wording and device counts appear only for a real device-limit lock.
   - Other lock reasons receive accurate wording instead of claiming the user exceeded 30 devices.

5. **Verify the boundaries**
   - Test below 30, exactly 30, and the 31st device.
   - Test an old stale device-limit lock after the count drops below 30.
   - Test normal phone/iPad tab switching to confirm it cannot trigger a false device lock.
   - Run the project checks and verify the live locked-page behavior.

## Technical details

- Update the server-side lock decision in the device recorder so `lock_reason` controls the result.
- Adjust protection scoring so passive `focus_loss` telemetry cannot independently cross the auto-lock threshold.
- Preserve admin bypass and existing device reset/reactivation controls.
