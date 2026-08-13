import { createContext, useContext, type ReactNode } from "react";

type Theme = "light" | "dark";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

/**
 * Light-mode only. Dark mode is intentionally disabled site-wide.
 * The hooks remain so existing components keep compiling, but
 * setTheme/toggle are no-ops. No effects, no localStorage reads — the
 * root shell ships clean light HTML, so there is nothing to reconcile.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value: Ctx = {
    theme: "light",
    setTheme: () => {},
    toggle: () => {},
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: "light", setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}
