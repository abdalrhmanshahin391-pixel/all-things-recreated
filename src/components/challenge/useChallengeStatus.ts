import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getChallengeStatusServerFn } from "@/lib/challenge.functions";
import type { ChallengeStatus } from "@/lib/challenge";

/**
 * The signed-in person's challenge state for a course. `status` is null until known, or when there is nothing
 * to show; `loaded` tells apart "still checking" from "nothing to show".
 */
export function useChallengeStatusState(courseId: string): { status: ChallengeStatus | null; loaded: boolean } {
  const { user, loading } = useAuth();
  const statusFn = useServerFn(getChallengeStatusServerFn);
  const [status, setStatus] = useState<ChallengeStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setStatus(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    statusFn({ data: { courseId } })
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [loading, user, courseId, statusFn]);

  return { status, loaded };
}

export function useChallengeStatus(courseId: string): ChallengeStatus | null {
  return useChallengeStatusState(courseId).status;
}

/** Whether the challenge should be visible to this person (it is hidden once they chose to ignore it). */
export function challengeIsVisible(status: ChallengeStatus | null): status is ChallengeStatus {
  return Boolean(status && ["none", "active", "finished", "preview"].includes(status.state));
}
