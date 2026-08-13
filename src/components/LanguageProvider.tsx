import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import i18n, { LANG_STORAGE_KEY } from "@/i18n";

export type Lang = "en" | "ar";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Pick up the stored preference after hydration (SSR always renders English).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "ar") setLangState("ar");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", lang);
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    void i18n.changeLanguage(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  // Admin-edited copy is merged in during the root loader (server-rendered),
  // so there is no post-hydration content fetch here any more.
  const value: Ctx = {
    lang,
    setLang: setLangState,
    toggle: () => setLangState((l) => (l === "ar" ? "en" : "ar")),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: "en", setLang: () => {}, toggle: () => {} };
  return ctx;
}
