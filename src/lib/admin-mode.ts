/* Shared "admin mode" store (presentation only).
   Lets a real admin browse the site as a student. The role in the database is
   untouched — this only hides admin UI. Shared across every hook instance so
   the header toggle updates the whole app at once (header, admin pages,
   courses, committee, study plan …). */

const ADMIN_MODE_KEY = "aqb.adminMode";

let adminModeValue = true;
const listeners = new Set<() => void>();

export function subscribeAdminMode(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getAdminModeSnapshot() {
  return adminModeValue;
}

export function getAdminModeServerSnapshot() {
  return true;
}

export function setAdminMode(next: boolean) {
  adminModeValue = next;
  try {
    localStorage.setItem(ADMIN_MODE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

let hydrated = false;
export function hydrateAdminMode() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(ADMIN_MODE_KEY);
    if (raw === "0" && adminModeValue) {
      adminModeValue = false;
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
}
