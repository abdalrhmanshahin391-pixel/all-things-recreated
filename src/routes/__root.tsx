import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getSiteBootstrap, type BootstrapPayload } from "@/lib/site-bootstrap.functions";
import { applySiteContentOverrides } from "@/i18n";
import { normalizeSettings } from "@/hooks/useSiteSettings";
import { usePresence } from "@/hooks/usePresence";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SeasonalTheme } from "@/components/SeasonalTheme";
import { GoldenTheme } from "@/components/GoldenTheme";
import { ThemeDecor } from "@/components/ThemeDecor";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/hooks/useAuth";
import { needsOnboarding } from "@/lib/onboarding";
import "@/i18n";
import { Toaster } from "@/components/ui/sonner";

// Language only — the seasonal theme comes from the server-rendered head script
// so it can never flash a stale value from localStorage.
const themeBootScript = `(function(){try{document.documentElement.classList.remove('dark');var l='en';try{l=localStorage.getItem('ysmu-lang')==='ar'?'ar':'en';}catch(_){}document.documentElement.setAttribute('lang',l);document.documentElement.setAttribute('dir',l==='ar'?'rtl':'ltr');}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async (): Promise<BootstrapPayload> => {
    const boot = await getSiteBootstrap();
    // Merge admin copy before the first render so SSR HTML is already correct.
    if (boot.content.length > 0) applySiteContentOverrides(boot.content, { notify: false });
    return boot;
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AquaQBank Academy — Medical Question Bank & Study Materials" },
      { name: "description", content: "AquaQBank Academy is the online medical study academy: question banks, past exam questions, video lectures and committee notes, organized by year and course." },
      { name: "author", content: "AquaQBank Academy" },
      { name: "google-site-verification", content: "U9UIGln2ZVhjR6-rfab8T6y0XwmD0zLbLQqcwmBL1Lg" },
      { name: "application-name", content: "AquaQBank Academy" },
      { name: "theme-color", content: "#0e7490" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "AquaQBank" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },

      { property: "og:title", content: "AquaQBank Academy — Medical Question Bank & Study Materials" },
      { property: "og:description", content: "AquaQBank Academy is the online medical study academy: question banks, past exam questions, video lectures and committee notes, organized by year and course." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "AquaQBank Academy" },
      { name: "twitter:title", content: "AquaQBank Academy — Medical Question Bank & Study Materials" },
      { name: "twitter:description", content: "AquaQBank Academy is the online medical study academy: question banks, video lectures and committee notes, organized by year and course." },



    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://drive.usercontent.google.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://drive.usercontent.google.com" },
      { rel: "preconnect", href: "https://drive.google.com" },
      { rel: "dns-prefetch", href: "https://drive.google.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Manrope:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800;900&family=Reem+Kufi:wght@500;600;700&family=Aref+Ruqaa:wght@400;700&family=Cinzel+Decorative:wght@700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [
      {
        // Runs once per page load only. Re-injections after a router
        // invalidate can carry a stale (cached) theme and would otherwise
        // snap the skin back to the previous one.
        children: `(function(){try{if(window.__themeBooted)return;window.__themeBooted=1;var d=['ramadan','eid','fireworks','stars','golden-age','desert-night','emerald-library'];var t=${JSON.stringify(
          (loaderData?.settings?.["theme"] as string) ?? "default",
        )};if(t&&t!=='default'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.removeAttribute('data-theme');}document.documentElement.classList.toggle('dark',d.indexOf(t)>=0);try{localStorage.setItem('ysmu-theme',t);}catch(_){}}catch(e){}})();`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "EducationalOrganization",
              "@id": "https://aquaqbank.com/#organization",
              name: "AquaQBank Academy",
              alternateName: [
                "AquaQBank",
                "Aqua Q Bank",
                "AquaQ Bank",
                "AquaQBank medical",
                "AquaQBank Platform",
                "AquaQBank Academy medical",
              ],
              url: "https://aquaqbank.com/",
              logo: "https://aquaqbank.com/favicon.png",
              email: "aquaqbank@gmail.com",
              description:
                "AquaQBank Academy is an online medical study academy with question banks, video lectures, committee notes and study guides.",
            },
            {
              "@type": "WebSite",
              "@id": "https://aquaqbank.com/#website",
              name: "AquaQBank Academy",
              alternateName: ["AquaQBank", "AquaQBank Academy", "AquaQBank Platform"],
              url: "https://aquaqbank.com/",
              publisher: { "@id": "https://aquaqbank.com/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://aquaqbank.com/courses?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            },

          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const boot = Route.useLoaderData();
  const router = useRouter();

  // Seed the caches synchronously (before the first paint) so no component
  // has to refetch global settings/copy after hydration.
  useState(() => {
    if (boot?.settings) queryClient.setQueryData(["site-settings"], normalizeSettings(boot.settings));
    if (boot?.content?.length) applySiteContentOverrides(boot.content, { notify: false });
    if (boot?.nav) {
      const nav = boot.nav as Array<{ placement?: string }>;
      queryClient.setQueryData(["site-nav", "header"], nav.filter((n) => n.placement === "header"));
      queryClient.setQueryData(["site-nav", "hero"], nav.filter((n) => n.placement === "hero"));
      queryClient.setQueryData(["site-nav", "footer"], nav.filter((n) => n.placement === "footer"));
    }
    return null;
  });

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
          router.invalidate();
          // Only user-scoped caches change on auth transitions; blanket
          // invalidation used to refetch the whole site on every sign-in.
          if (event !== "SIGNED_OUT") {
            for (const key of ["auth", "my-courses", "my-lecture-courses", "profile", "committee-role"]) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
          }
        }
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => unsub?.();
  }, [queryClient, router]);


  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <SeasonalTheme />
          <GoldenTheme />
          <ThemeDecor />
          <PresenceTracker />
          <DeviceTracker />
          <OnboardingGate />
          <PaymentTestModeBanner />
          <AnnouncementBar />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <GlobalFooter />
          <Toaster richColors position="top-right" />
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function PresenceTracker() {
  usePresence();
  return null;
}

/**
 * Accounts created through a social provider land without a username, real
 * name or phone. Send them through /welcome once, from anywhere in the app,
 * so the state can never linger half-finished.
 */
const ONBOARDING_EXEMPT = [
  "/welcome",
  "/auth",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/locked",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/.lovable",
];

function OnboardingGate() {
  const { user, profile, loading } = useAuth();
  const location = useRouterState({ select: (s) => s.location });
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    const pathname = location.pathname;
    if (ONBOARDING_EXEMPT.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
    if (!needsOnboarding(user.id, profile)) return;
    const next = pathname + (location.searchStr ?? "");
    const q = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    // Navigate in-app: a hard reload here threw away the freshly booted app.
    void router.navigate({ href: `/welcome${q}`, replace: true });
  }, [loading, user, profile, location, router]);

  return null;
}

/**
 * The site directory footer on every page except full-screen working
 * surfaces (admin, quiz/study players, auth-blocked screens) where it
 * would only get in the way.
 */
const NO_FOOTER = [
  "/admin",
  "/locked",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/.lovable",
];

function GlobalFooter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hidden =
    NO_FOOTER.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    /\/(run|exam|match|tap|checkout)(\/|$)/.test(pathname);
  if (hidden) return null;
  return <SiteFooter />;
}

function DeviceTracker() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let lastPing = 0;

    // The device check used to run every 60s in every open tab, plus once on
    // every focus/visibility change. That is a request storm at scale for a
    // check that only needs to be roughly current, so it is now throttled to
    // once every 5 minutes and never runs while the tab is hidden.
    const MIN_GAP_MS = 5 * 60_000;

    async function ping(force = false) {
      if (cancelled) return;
      if (!force) {
        if (document.hidden) return;
        if (Date.now() - lastPing < MIN_GAP_MS) return;
      }
      lastPing = Date.now();
      try {
        const [{ supabase }, { getOrCreateDeviceId }, { recordDevice }] = await Promise.all([
          import("@/integrations/supabase/client"),
          import("@/lib/device-id"),
          import("@/lib/devices.functions"),
        ]);
        const { data } = await supabase.auth.getSession();
        if (!data.session || cancelled) return;
        const deviceId = getOrCreateDeviceId();
        const res = await recordDevice({ data: { deviceId } });
        if (cancelled) return;
        if (res && "ok" in res && !res.ok) {
          // Over the device limit (or manually locked): send the user to the
          // reactivation screen instead of silently signing them out, so they
          // can redeem a code or contact support. Admins never hit this path.
          if (window.location.pathname !== "/locked") {
            window.location.href = "/locked";
          }
        }
      } catch {
        /* ignore */
      }
    }

    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") void ping(true);
      });
      unsub = () => sub.subscription.unsubscribe();
      void ping(true);
    })();

    const interval = window.setInterval(() => void ping(), MIN_GAP_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      unsub?.();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

