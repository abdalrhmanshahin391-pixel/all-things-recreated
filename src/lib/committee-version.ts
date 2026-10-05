import { useEffect, useSyncExternalStore } from "react";

/**
 * Which face of the committee page the visitor is looking at:
 *  - "university": the original page, university resources
 *  - "aqua": the AQUA version, only AQUA's own summaries
 * Remembered in the browser and shared by every page that uses it, so the whole committee area follows the switch.
 */
export type CommitteeVersion = "university" | "aqua";

const KEY = "aqb.committeeVersion";

let value: CommitteeVersion = "university";
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => value;
const getServerSnapshot = (): CommitteeVersion => "university";

export function setCommitteeVersion(next: CommitteeVersion) {
  value = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice just lasts until the page is closed */
  }
  listeners.forEach((l) => l());
}

let hydrated = false;
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "aqua" && value !== "aqua") {
      value = "aqua";
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
}

export function useCommitteeVersion() {
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrate();
  }, []);
  return { version, isAqua: version === "aqua", setVersion: setCommitteeVersion };
}