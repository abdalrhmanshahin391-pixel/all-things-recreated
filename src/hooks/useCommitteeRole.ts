import { useEffect, useSyncExternalStore } from "react";
import {
  subscribeAdminMode,
  getAdminModeSnapshot,
  getAdminModeServerSnapshot,
  hydrateAdminMode,
} from "@/lib/admin-mode";
import { subscribeAuth, getAuthSnapshot, getAuthServerSnapshot } from "@/lib/auth-store";

/**
 * Reads roles from the single shared auth store instead of running its own
 * `user_roles` query on every page — that duplicate request was a large part of
 * the delay when moving between committee pages.
 */
export function useCommitteeRole() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);
  const adminMode = useSyncExternalStore(
    subscribeAdminMode,
    getAdminModeSnapshot,
    getAdminModeServerSnapshot,
  );

  useEffect(() => {
    hydrateAdminMode();
  }, []);

  const isRealAdmin = auth.isRealAdmin;
  // When an admin turns "admin mode" off they browse as a student everywhere,
  // including the committee/course management tools.
  const isAdmin = isRealAdmin && adminMode;
  const isCommittee = isRealAdmin && !adminMode ? false : auth.isCommittee;

  return {
    isAdmin,
    isRealAdmin,
    isCommittee,
    canManage: isAdmin || isCommittee,
    loading: auth.loading,
  };
}
