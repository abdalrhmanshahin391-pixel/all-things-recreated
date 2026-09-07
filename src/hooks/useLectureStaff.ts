import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CACHE_KEY = "aq_lecture_staff";

/** True when the signed-in user is staff on at least one lecture course. */
export function useLectureStaff(): boolean {
  const { user, loading } = useAuth();
  const [isStaff, setIsStaff] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(CACHE_KEY) === "1";
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsStaff(false);
      if (typeof window !== "undefined") sessionStorage.removeItem(CACHE_KEY);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from as any)("lecture_staff")
        .select("course_id")
        .eq("user_id", user.id)
        .limit(1);
      if (cancelled) return;
      const staff = ((data ?? []) as unknown[]).length > 0;
      setIsStaff(staff);
      if (typeof window !== "undefined") sessionStorage.setItem(CACHE_KEY, staff ? "1" : "0");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return isStaff;
}
