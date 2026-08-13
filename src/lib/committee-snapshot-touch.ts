import { writeDriveSnapshot } from "@/lib/committee-sync.functions";

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Keeps the Google Drive snapshot fresh after committee edits.
 * Debounced and silent: it must never slow down or break a save.
 */
export function touchCommitteeSnapshot(delayMs = 6000) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void (writeDriveSnapshot as any)({ data: {} }).catch(() => {});
  }, delayMs);
}
