import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The "this material is watermarked" agreement is asked once, not once per card. A page with many protected
 * cards (an exam paper) shares one answer per user and scope: one lookup, and accepting in any card opens them
 * all at once.
 */
type ConsentEntry = { value: boolean | null; loading: boolean; listeners: Set<() => void> };
const consentStore = new Map<string, ConsentEntry>();

function consentEntry(key: string): ConsentEntry {
  let entry = consentStore.get(key);
  if (!entry) {
    entry = { value: null, loading: false, listeners: new Set() };
    consentStore.set(key, entry);
  }
  return entry;
}

export function useSharedConsent(userId: string | null, scope: string, needed: boolean) {
  const key = `${userId ?? ""}:${scope}`;
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!needed || !userId) return;
    const entry = consentEntry(key);
    const listener = () => rerender((n) => n + 1);
    entry.listeners.add(listener);
    if (entry.value === null && !entry.loading) {
      entry.loading = true;
      void (async () => {
        let agreed = false;
        try {
          // Agreeing once for everything ("global") also counts, so people who already agreed are not asked again.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase.from as any)("content_consents")
            .select("user_id")
            .eq("user_id", userId)
            .in("scope", ["global", scope])
            .limit(1);
          agreed = Boolean(data?.length);
        } catch {
          agreed = false;
        }
        entry.value = agreed;
        entry.loading = false;
        entry.listeners.forEach((l) => l());
      })();
    }
    return () => {
      entry.listeners.delete(listener);
    };
  }, [key, needed, userId, scope]);

  const markAgreed = useCallback(() => {
    const entry = consentEntry(key);
    entry.value = true;
    entry.listeners.forEach((l) => l());
  }, [key]);

  if (!needed || !userId) return { value: true as boolean | null, markAgreed };
  return { value: consentEntry(key).value, markAgreed };
}
