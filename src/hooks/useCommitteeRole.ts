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
  const isCommitteeHead = isRealAdmin && !adminMode ? false : auth.isCommitteeHead;
  // A genuine committee role (member or head) survives the admin-mode switch.
  // Admin mode only decides whether an *admin* browses as a student; it must
  // not strip real committee membership, or an admin who is also on the
  // committee loses every edit control inside the years.
  const isRealCommittee = auth.isCommittee;
  const isRealCommitteeHead = auth.isCommitteeHead;

  return {
    isAdmin,
    isRealAdmin,
    isCommittee,
    isCommitteeHead,
    isRealCommittee,
    isRealCommitteeHead,
    canManage: isAdmin || isRealCommittee,
    canManageMembers: isAdmin || isRealCommitteeHead,
    loading: auth.loading,
  };
}
