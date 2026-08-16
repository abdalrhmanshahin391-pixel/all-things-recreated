import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Site-wide red accent for لجنة الطب والجراحة members. Purely cosmetic:
 * the `committee` class on <html> re-points the semantic colour tokens.
 * Golden wins when a member holds both roles.
 */
export function CommitteeTheme() {
  const { isCommittee, isGolden } = useAuth();
  const on = isCommittee && !isGolden;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("committee", on);
    return () => root.classList.remove("committee");
  }, [on]);
  return null;
}
