import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import { DEFAULT_AR, DEFAULT_EN, toResourceBundle } from "@/lib/site-content-catalog";

export const LANG_STORAGE_KEY = "ysmu-lang";

function readInitialLang(): "en" | "ar" {
  if (typeof window === "undefined") return "en";
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return v === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: { ...en, ...toResourceBundle(DEFAULT_EN) } },
      ar: { translation: { ...ar, ...toResourceBundle(DEFAULT_AR) } },
    },
    lng: readInitialLang(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

/**
 * Merge admin-edited copy (stored in the database) over the built-in
 * defaults, then nudge i18next so mounted components re-render.
 */
export function applySiteContentOverrides(
  rows: Array<{ key: string; value_en: string | null; value_ar: string | null }>,
  options: { notify?: boolean } = {},
) {
  const en: Record<string, string> = {};
  const ar: Record<string, string> = {};
  for (const r of rows) {
    if (r.value_en) en[r.key] = r.value_en;
    if (r.value_ar) ar[r.key] = r.value_ar;
  }
  i18n.addResourceBundle("en", "translation", toResourceBundle(en), true, true);
  i18n.addResourceBundle("ar", "translation", toResourceBundle(ar), true, true);
  if (options.notify !== false) void i18n.changeLanguage(i18n.language);
}

export default i18n;
