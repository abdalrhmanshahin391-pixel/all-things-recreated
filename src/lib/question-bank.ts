/** Shared, client-safe types and lists for the admin Question Bank. */

export type QbOption = { label: string; text: string; is_correct: boolean; sort_order: number };
export type QbQuestion = { stem: string; explanation: string | null; answer_mode?: "single" | "multiple"; sort_order: number; options: QbOption[] };
export type QbMeta = {
  id: string;
  name: string;
  year: string;
  semester: string;
  subject: string;
  count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  source?: string | null;
};
export type QbGroupFile = { format: string; version: number; meta: QbMeta; questions: QbQuestion[] };
export type QbIndex = { format: string; version: number; groups: QbMeta[] };

export const QB_YEARS = [
  "Zero year",
  "First year",
  "Second year",
  "Third year",
  "Fourth year",
  "Fifth year",
  "Sixth year",
  "For all years",
];

export const QB_SEMESTERS = ["Semester 1", "Semester 2", "Summer", "Whole year"];

/** Sort helper used by the page: year, then semester, then subject, then manual order. */
export function sortGroups(groups: QbMeta[]): QbMeta[] {
  const yearRank = (y: string) => {
    const i = QB_YEARS.indexOf(y);
    return i === -1 ? QB_YEARS.length : i;
  };
  const semRank = (s: string) => {
    const i = QB_SEMESTERS.indexOf(s);
    return i === -1 ? QB_SEMESTERS.length : i;
  };
  return [...groups].sort(
    (a, b) =>
      yearRank(a.year) - yearRank(b.year) ||
      a.year.localeCompare(b.year) ||
      semRank(a.semester) - semRank(b.semester) ||
      a.semester.localeCompare(b.semester) ||
      a.subject.localeCompare(b.subject) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.name.localeCompare(b.name),
  );
}
