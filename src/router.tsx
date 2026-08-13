import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Navigating back to a page you just visited should be instant: keep
        // data fresh for a couple of minutes and cached for half an hour.
        staleTime: 2 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm the next page (code chunk + loader) as soon as a link is hovered
    // or touched, so the click itself renders immediately.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // TanStack Query owns freshness; the router must not shadow it.
    defaultPreloadStaleTime: 0,
    // Avoid flashing a spinner for fast transitions.
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
  });


  // Dehydrate server-fetched queries into the HTML so pages render with their
  // data on the first frame instead of refetching after hydration.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
