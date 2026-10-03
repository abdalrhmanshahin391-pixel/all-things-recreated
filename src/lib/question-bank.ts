/** Shared, client-safe types and lists for the admin Question Bank. */

export type QbOption = { label: string; text: string; is_correct: boolean; sort_order: number };
export type QbQuestion = { stem: string; explanation: string | null; answer_mode?: "single" | "multiple"; sort_order: number; options: QbOption[]; image_url?: string | null };
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

const normStem = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Picture tests reuse one wording over different pictures ("Which of the following ribs are true ribs?").
 * A subject cannot hold two questions with the same text, so the same wording on a DIFFERENT picture
 * would be dropped as a duplicate. Those questions get a small "(Picture N)" tag instead, where N is the
 * order of the picture in this set. The same wording on the SAME picture is left alone (a real duplicate).
 */
export function disambiguatePictureStems<T extends { stem: string; image_url?: string | null }>(questions: T[]): T[] {
  const pictureNo = new Map<string, number>();
  const picturesByStem = new Map<string, Set<string>>();
  return questions.map((q) => {
    const picture = q.image_url ?? "";
    if (picture && !pictureNo.has(picture)) pictureNo.set(picture, pictureNo.size + 1);
    const key = normStem(q.stem ?? "");
    const seen = picturesByStem.get(key);
    if (!seen) {
      picturesByStem.set(key, new Set([picture]));
      return q;
    }
    if (seen.has(picture) || !picture) return q; // same picture (or no picture): a true duplicate, handled as before
    seen.add(picture);
    const tagged = `${q.stem.trim()} (Picture ${pictureNo.get(picture)})`;
    picturesByStem.set(normStem(tagged), new Set([picture]));
    return { ...q, stem: tagged };
  });
}

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
