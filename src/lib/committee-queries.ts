import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLOSED_SELECT } from "@/components/committee/ClosedState";

const SHARED = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
} as const;

/** Everything the year page renders, fetched in one parallel round trip. */
export function committeeYearQuery(year: string | number) {
  return queryOptions({
    queryKey: ["committee-year", String(year)],
    queryFn: async () => {
      const { data: y } = await supabase
        .from("committee_years")
        .select(`id, display_name, year_number, icon_key, ${CLOSED_SELECT}`)
        .eq("year_number", Number(year))
        .maybeSingle();
      if (!y) return { year: null, subjects: [], semesters: [], modules: [] };
      const [{ data: s }, { data: sem }, { data: allMods }] = await Promise.all([
        supabase
          .from("committee_subjects")
          .select(`id, year_id, semester_id, module_id, name, icon_key, sort_order, tag_label, tag_color, ${CLOSED_SELECT}`)
          .eq("year_id", y.id)
          .order("sort_order"),
        supabase
          .from("committee_semesters")
          .select(`id, year_id, name, number, sort_order, ${CLOSED_SELECT}`)
          .eq("year_id", y.id)
          .order("sort_order"),
        supabase
          .from("committee_modules")
          .select(`id, semester_id, name, icon_key, sort_order, ${CLOSED_SELECT}`)
          .order("sort_order"),
      ]);
      const semIds = new Set((sem ?? []).map((x: { id: string }) => x.id));
      const mods = ((allMods ?? []) as { semester_id: string }[]).filter((m) => semIds.has(m.semester_id));
      return { year: y, subjects: s ?? [], semesters: sem ?? [], modules: mods };
    },
    placeholderData: keepPreviousData,
    ...SHARED,
  });
}

/** Subject page: subject row, its categories, and only that subject's resources. */
export function committeeSubjectQuery(subjectId: string) {
  return queryOptions({
    queryKey: ["committee-subject", subjectId],
    queryFn: async () => {
      const [{ data: subj }, { data: cats }] = await Promise.all([
        supabase.from("committee_subjects").select("*").eq("id", subjectId).maybeSingle(),
        supabase.from("committee_categories").select("*").eq("subject_id", subjectId).order("sort_order"),
      ]);
      const catIds = (cats ?? []).map((c: { id: string }) => c.id);
      const { data: res } = catIds.length
        ? await supabase.from("committee_resources").select("*").in("category_id", catIds).order("sort_order")
        : { data: [] };
      return { subject: subj, categories: cats ?? [], resources: res ?? [] };
    },
    placeholderData: keepPreviousData,
    ...SHARED,
  });
}
