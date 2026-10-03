import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getChallengeStatusServerFn } from "@/lib/challenge.functions";
import type { ChallengeStatus } from "@/lib/challenge";

/** The signed-in person's challenge state for a course (null until known, or when there is nothing to show). */
export function useChallengeStatus(courseId: string): ChallengeStatus | null {
  const { user, loading } = useAuth();
  const statusFn = useServerFn(getChallengeStatusServerFn);
  const [status, setStatus] = useState<ChallengeStatus | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    statusFn({ data: { courseId } })
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null));
    return () => {
      cancelled = true;
    };
  }, [loading, user, courseId, statusFn]);

  return status;
}

/** Whether the challenge should be visible to this person (it is hidden once they chose to ignore it). */
export function challengeIsVisible(status: ChallengeStatus | null): status is ChallengeStatus {
  return Boolean(status && ["none", "active", "finished", "preview"].includes(status.state));
}
