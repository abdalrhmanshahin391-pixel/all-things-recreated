import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  subscribeAdminMode,
  getAdminModeSnapshot,
  getAdminModeServerSnapshot,
  hydrateAdminMode,
} from "@/lib/admin-mode";

export function useCommitteeRole() {
  const [isRealAdmin, setIsRealAdmin] = useState(false);
  const [isCommittee, setIsCommittee] = useState(false);
  const [loading, setLoading] = useState(true);

  const adminMode = useSyncExternalStore(
    subscribeAdminMode,
    getAdminModeSnapshot,
    getAdminModeServerSnapshot,
  );

  useEffect(() => {
    hydrateAdminMode();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load(uid: string | undefined) {
      if (!uid) {
        if (mounted) {
          setIsRealAdmin(false);
          setIsCommittee(false);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!mounted) return;
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      setIsRealAdmin(roles.includes("admin"));
      setIsCommittee(roles.includes("committee"));
      setLoading(false);
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      load(data.session?.user?.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      load(s?.user?.id);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // When an admin turns "admin mode" off they browse as a student everywhere,
  // including the committee/course management tools.
  const isAdmin = isRealAdmin && adminMode;
  const committee = isRealAdmin && !adminMode ? false : isCommittee;

  return {
    isAdmin,
    isRealAdmin,
    isCommittee: committee,
    canManage: isAdmin || committee,
    loading,
  };
}
