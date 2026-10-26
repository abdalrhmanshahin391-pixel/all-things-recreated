import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

/** Seasonal skins whose palette is dark — these also switch the app into
 *  dark mode so hardcoded light utilities are re-mapped by the CSS layer. */
const DARK_THEMES = new Set([
  "ramadan",
  "eid",
  "fireworks",
  "stars",
  "golden-age",
  "desert-night",
  "emerald-library",
]);

/**
 * Applies the admin-selected seasonal theme by setting data-theme on <html>.
 * Caches the last value so the skin is correct immediately on next load.
 */
/** Which redesign is live: "warm" (warm white + teal) or "golden-age" (ink navy + brass). Keep in sync with __root.tsx. */
const DESIGN: "warm" | "golden-age" = "warm";

export function SeasonalTheme() {
  const { theme } = useSiteSettings();

  useEffect(() => {
    const root = document.documentElement;
    // REDESIGN branch: one look for the whole site. Seasonal skins are ignored.
    root.setAttribute("data-theme", DESIGN);
    root.classList.toggle("dark", DESIGN === "golden-age");
    try {
      localStorage.setItem("ysmu-theme", theme || "default");
    } catch {
      /* ignore */
    }
  }, [theme]);

  return null;
}
