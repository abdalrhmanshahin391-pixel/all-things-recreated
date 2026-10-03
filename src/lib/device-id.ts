const KEY = "ysmu-device-id";

function readCookie(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(id: string) {
  try {
    document.cookie = `${KEY}=${encodeURIComponent(id)}; max-age=${60 * 60 * 24 * 400}; path=/; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch {
    /* cookies blocked */
  }
}

/**
 * A stable id for this browser. It is kept in two places (storage and a cookie) so that clearing one of them,
 * or Safari trimming its storage after a week away, does not turn the same phone into a "new device".
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (!id) id = readCookie();
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  let stored = false;
  try {
    window.localStorage.setItem(KEY, id);
    stored = true;
  } catch {
    /* storage blocked */
  }
  writeCookie(id);
  // Private windows and blocked storage cannot remember anything: say so, the server does not count these as devices.
  return stored || readCookie() ? id : "no-storage";
}