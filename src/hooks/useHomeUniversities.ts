import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeUniversity = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  country: string | null;
  home_badge: "NEW" | "POPULAR" | "COMING_SOON" | null;
  home_tagline: string | null;
  home_order: number;
};

/**
 * One shared query for every home-page university surface (hero chips and
 * the university strip) so the page makes a single request instead of two.
 */
export const homeUniversitiesQuery = queryOptions({
  queryKey: ["home-universities"],
  queryFn: async (): Promise<HomeUniversity[]> => {
      const { data } = await supabase
        .from("universities")
        .select("id, slug, name, short_name, city, country, home_badge, home_tagline, home_order")
        .eq("is_active", true)
        .eq("home_visible", true)
        .order("home_order", { ascending: true })
        .order("name", { ascending: true });
      return (data ?? []) as HomeUniversity[];
  },
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
});

export function useHomeUniversities() {
  const { data } = useQuery(homeUniversitiesQuery);
  return data ?? [];
}
