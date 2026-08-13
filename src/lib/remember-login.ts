const KEY = "aqua-remember-login";

export type RememberedLogin = { email: string; password: string };

export function loadRememberedLogin(): RememberedLogin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json) as RememberedLogin;
    if (!parsed?.email) return null;
    return { email: parsed.email, password: parsed.password ?? "" };
  } catch {
    return null;
  }
}

export function saveRememberedLogin(value: RememberedLogin) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(value);
    window.localStorage.setItem(KEY, btoa(unescape(encodeURIComponent(json))));
  } catch {
    /* storage unavailable */
  }
}

export function clearRememberedLogin() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}