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
  year: [
    {
      id: "f-year-zero",
      kind: "year" as const,
      value: "7",
      label: "Zero Course",
      sort_order: 0,
    },
    ...[1, 2, 3, 4, 5, 6].map((y, i) => ({
      id: `f-year-${y}`,
      kind: "year" as const,
      value: String(y),
      label: `Year ${y}`,
      sort_order: i + 1,
    })),
    {
      id: "f-year-0",
      kind: "year" as const,
      value: "0",
      label: "For all years",
      sort_order: 7,
    },
  ],
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

/** Checks whether a course or year option represents "Zero Course" (Preparatory year). */
export function isZeroCourse(
  year: number | null | undefined,
  options?: CourseOptionGroups,
): boolean {
  if (year === null || year === undefined) return false;
  const custom = options?.year.find((o) => Number(o.value) === year);
  if (custom) {
    const lower = custom.label.toLowerCase();
    return (
      lower.includes("zero") ||
      lower.includes("تحضير") ||
      lower.includes("preparatory") ||
      lower.includes("foundation")
    );
  }
  return false;
}

/** Checks whether a course or year option represents "All years" / universal. */
export function isAllYearsCourse(
  year: number | null | undefined,
  options?: CourseOptionGroups,
): boolean {
  if (year === null || year === undefined) return false;
  if (isZeroCourse(year, options)) return false;

  const custom = options?.year.find((o) => Number(o.value) === year);
  if (custom) {
    const lower = custom.label.toLowerCase();
    return (
      lower.includes("all year") ||
      lower.includes("لكل السنين") ||
      lower.includes("جميع السنوات") ||
      lower.includes("لجميع السنوات") ||
      lower.includes("general")
    );
  }
  return year === 0;
}

/** Returns a numerical sort priority so years order: Zero Course (0), Years 1-6 (1-6), All years (999). */
export function getYearSortPriority(
  year: number,
  options?: CourseOptionGroups,
): number {
  if (isZeroCourse(year, options)) return 0;
  if (isAllYearsCourse(year, options)) return 999;
  return year;
}

/** Label for a year number, properly distinguishing Zero Course, All Years, and standard years. */
export function yearLabel(
  year: number | null | undefined,
  options?: CourseOptionGroups,
  otherLabel = "For all years",
) {
  if (year === null || year === undefined) return otherLabel;
  const custom = options?.year.find((o) => Number(o.value) === year);
  if (custom) return custom.label;
  if (isZeroCourse(year, options)) return "Zero Course";
  if (isAllYearsCourse(year, options) || year === 0) return "For all years";
  return `${ORDINAL[year] ?? `${year}th`} year`;
}

export type SemesterValue = 1 | 2;

export const SEMESTER_OPTIONS = [
  { value: 1, labelEn: "1st Semester", labelAr: "الفصل الأول" },
  { value: 2, labelEn: "2nd Semester", labelAr: "الفصل الثاني" },
] as const;

/**
 * Checks whether an academic year supports semester selection.
 * Semester selection applies to all years EXCEPT Zero course and all-years courses.
 */
export function hasSemesterSupport(
  year: number | null | undefined,
  options?: CourseOptionGroups,
): boolean {
  if (year === null || year === undefined) return false;
  if (isZeroCourse(year, options)) return false;
  if (isAllYearsCourse(year, options)) return false;
  return true;
}

/**
 * Returns a human-friendly label for a semester value.
 */
export function semesterLabel(
  semester: number | null | undefined,
  lang: "en" | "ar" = "en",
): string | null {
  if (semester === 1) return lang === "ar" ? "الفصل الأول" : "1st Semester";
  if (semester === 2) return lang === "ar" ? "الفصل الثاني" : "2nd Semester";
  return null;
}

