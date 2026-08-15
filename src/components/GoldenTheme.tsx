import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Adds the site-wide gold accent for Golden members. Purely cosmetic:
 * the `golden` class on <html> re-points the semantic colour tokens.
 */
export function GoldenTheme() {
  const { isGolden } = useAuth();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("golden", isGolden);
    return () => root.classList.remove("golden");
  }, [isGolden]);
  return null;
}
