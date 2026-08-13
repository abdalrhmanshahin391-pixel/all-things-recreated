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
export function SeasonalTheme() {
  const { theme } = useSiteSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === "default") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", DARK_THEMES.has(theme || "default"));
    try {
      localStorage.setItem("ysmu-theme", theme || "default");
    } catch {
      /* ignore */
    }
  }, [theme]);

  return null;
}
