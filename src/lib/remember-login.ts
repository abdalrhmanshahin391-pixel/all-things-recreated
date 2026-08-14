// Only the email address is ever remembered. Passwords are never stored:
// staying signed in is handled by the auth session itself, which persists
// and auto-refreshes.
const KEY = "aqua-remember-email";
const LEGACY_KEY = "aqua-remember-login";

export type RememberedLogin = { email: string };

export function loadRememberedLogin(): RememberedLogin | null {
  if (typeof window === "undefined") return null;
  try {
    // Wipe the old base64 email+password blob if it is still around.
    window.localStorage.removeItem(LEGACY_KEY);
    const email = window.localStorage.getItem(KEY);
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

export function saveRememberedLogin(value: RememberedLogin) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, value.email);
  } catch {
    /* storage unavailable */
  }
}

export function clearRememberedLogin() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
}