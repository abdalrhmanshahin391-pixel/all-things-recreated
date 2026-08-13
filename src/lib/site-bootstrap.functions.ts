import { createServerFn } from "@tanstack/react-start";

export type SettingsRow = Record<string, string | number | boolean | null>;

export type BootstrapPayload = {
  settings: SettingsRow | null;
  content: Array<{ key: string; value_en: string | null; value_ar: string | null }>;
  nav: Array<Record<string, any>>;
};

/**
 * Server-side fetch of the global datasets every page needs (theme settings,
 * admin-edited copy, navigation) so the first HTML frame is already correct.
 * The actual query lives in site-bootstrap.server.ts behind a short cache.
 */
export const getSiteBootstrap = createServerFn({ method: "GET" }).handler(
  async (): Promise<BootstrapPayload> => {
    try {
      const { loadSiteBootstrap } = await import("./site-bootstrap.server");
      return (await loadSiteBootstrap()) as BootstrapPayload;
    } catch {
      return { settings: null, content: [], nav: [] };
    }
  },
);
