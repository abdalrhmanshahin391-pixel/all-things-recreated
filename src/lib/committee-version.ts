import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

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

/**
 * Switches the page with a ripple: the new version grows out of the point that was clicked (View Transitions).
 * Browsers without the feature, and people who asked for less motion, just get an instant switch.
 */
export function switchCommitteeVersion(next: CommitteeVersion, origin?: { x: number; y: number }) {
  if (next === value) return;
  const doc = typeof document !== "undefined" ? (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } }) : null;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduced) {
    setCommitteeVersion(next);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight * 0.4;
  const root = document.documentElement;
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-r", `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`);
  root.dataset.committeeVt = next;
  let applied = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    flushSync(() => setCommitteeVersion(next));
  };
  const transition = doc.startViewTransition(apply);
  // Safety net: if the browser never gets to run the transition (hidden tab, no frames), the switch still happens.
  window.setTimeout(apply, 700);
  const done = () => {
    delete root.dataset.committeeVt;
  };
  (transition as { ready?: Promise<unknown> }).ready?.catch(() => undefined);
  transition.finished.then(done, done);
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
  return { version, isAqua: version === "aqua", setVersion: setCommitteeVersion, switchVersion: switchCommitteeVersion };
}