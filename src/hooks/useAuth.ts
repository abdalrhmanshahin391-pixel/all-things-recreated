import { useEffect, useSyncExternalStore } from "react";
import {
  subscribeAdminMode,
  getAdminModeSnapshot,
  getAdminModeServerSnapshot,
  setAdminMode,
  hydrateAdminMode,
} from "@/lib/admin-mode";
import {
  subscribeAuth,
  getAuthSnapshot,
  getAuthServerSnapshot,
  refreshAuthProfile,
  type Profile,
} from "@/lib/auth-store";

export { setAdminMode, refreshAuthProfile };
export type { Profile };

export function useAuth() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);

  const adminMode = useSyncExternalStore(
    subscribeAdminMode,
    getAdminModeSnapshot,
    getAdminModeServerSnapshot,
  );

  useEffect(() => {
    hydrateAdminMode();
  }, []);

  return {
    session: auth.session,
    user: auth.user,
    profile: auth.profile,
    isAdmin: auth.isRealAdmin && adminMode,
    isRealAdmin: auth.isRealAdmin,
    isGolden: auth.isGolden,
    isCommittee: auth.isCommittee,
    isCommitteeEn: auth.isCommitteeEn,
    isCommitteeAr: auth.isCommitteeAr,
    isCommitteeHead: auth.isCommitteeHead,
    adminMode,
    setAdminMode,
    loading: auth.loading,
  };
}
