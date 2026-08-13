import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CourseOptionKind = "category" | "year" | "exam_type";

export type CourseOption = {
  id: string;
  kind: CourseOptionKind;
  value: string;
  label: string;
  sort_order: number;
};

export type CourseOptionGroups = Record<CourseOptionKind, CourseOption[]>;

/** Used when the table is empty (or unreachable) so the form never goes blank. */
export const FALLBACK_COURSE_OPTIONS: CourseOptionGroups = {
  category: [
    { id: "f-major", kind: "category", value: "major", label: "Major", sort_order: 0 },
    { id: "f-minor", kind: "category", value: "minor", label: "Minor", sort_order: 1 },
  ],
  year: [1, 2, 3, 4, 5, 6].map((y, i) => ({
    id: `f-year-${y}`,
    kind: "year" as const,
    value: String(y),
    label: `Year ${y}`,
    sort_order: i,
  })),
  exam_type: ["MINI-OSCE", "FINAL", "MID", "OSCE"].map((t, i) => ({
    id: `f-exam-${t}`,
    kind: "exam_type" as const,
    value: t,
    label: t,
    sort_order: i,
  })),
};

function group(rows: CourseOption[]): CourseOptionGroups {
  const out: CourseOptionGroups = { category: [], year: [], exam_type: [] };
  for (const r of rows) {
    if (out[r.kind]) out[r.kind].push(r);
  }
  (Object.keys(out) as CourseOptionKind[]).forEach((k) => {
    if (out[k].length === 0) out[k] = FALLBACK_COURSE_OPTIONS[k];
  });
  return out;
}

export const courseOptionsQuery = queryOptions({
  queryKey: ["course-options"],
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  queryFn: async (): Promise<CourseOptionGroups> => {
    const { data, error } = await (supabase.from as any)("course_options")
      .select("id, kind, value, label, sort_order")
      .order("kind")
      .order("sort_order");
    if (error) return FALLBACK_COURSE_OPTIONS;
    return group((data ?? []) as CourseOption[]);
  },
});

export function useCourseOptions() {
  const { data } = useQuery(courseOptionsQuery);
  return data ?? FALLBACK_COURSE_OPTIONS;
}

const ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
};

/** Label for a year number, falling back to "1st year" style ordinals. */
export function yearLabel(
  year: number | null | undefined,
  options?: CourseOptionGroups,
  otherLabel = "other",
) {
  if (!year || year <= 0) return otherLabel;
  const custom = options?.year.find((o) => Number(o.value) === year);
  if (custom) return custom.label;
  return `${ORDINAL[year] ?? `${year}th`} year`;
}
