import { getAuthSnapshot } from "@/lib/auth-store";

type NavigateFn = (opts: {
  to: string;
  search?: Record<string, unknown>;
  replace?: boolean;
}) => unknown;

/**
 * Redirect used by page-level access guards.
 *
 * Signed-out visitors are sent to the sign-in page carrying the page they were
 * trying to reach, so refreshing (or opening a deep link) returns them to that
 * page after login instead of dumping them on the home page. Signed-in users
 * who genuinely lack access still go home.
 */
export function guardRedirect(navigate: NavigateFn) {
  const { user } = getAuthSnapshot();
  if (!user && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    navigate({ to: "/login", search: { next }, replace: true });
    return;
  }
  navigate({ to: "/", replace: true });
}
