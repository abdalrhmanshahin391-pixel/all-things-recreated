import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SubjectAccess } from "@/lib/subjects.functions";

export type CoursePageGroup = { id: string; name: string; sort_order: number };
export type CoursePageSubject = {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  question_count: number;
  access_level: SubjectAccess;
  ordered: boolean;
};
export type CoursePageData<C = any> = { course: C; groups: CoursePageGroup[]; subjects: CoursePageSubject[] } | null;

export const coursePageKey = (courseId: string) => ["course-page", courseId] as const;
export const poolCountsKey = (userId: string | undefined, courseId: string) => ["course-pool-counts", userId, courseId] as const;

function toSubject(row: any, count: number): CoursePageSubject {
  return {
    id: row.id,
    group_id: row.group_id,
    name: row.name,
    sort_order: row.sort_order,
    access_level: (row.access_level ?? "paid") as SubjectAccess,
    ordered: Boolean(row.ordered),
    question_count: count,
  };
}

/** The separate queries the page used before the one-request function existed. */
async function fetchCoursePageLegacy(courseId: string): Promise<CoursePageData> {
  const { data: c } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
  if (!c) return null;
  const { data: g } = await (supabase.from as any)("subject_groups")
    .select("id,name,sort_order")
    .eq("course_id", courseId)
    .order("sort_order");
  const groups = (g ?? []) as CoursePageGroup[];
  let subjects: CoursePageSubject[] = [];
  if (groups.length) {
    const { data: s } = await (supabase.from as any)("subjects")
      .select("id,group_id,name,sort_order,access_level,ordered")
      .in("group_id", groups.map((x) => x.id))
      .order("sort_order");
    const rows = (s ?? []) as any[];
    const ids = rows.map((r) => r.id as string);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data } = await (supabase as any).rpc("get_subject_question_counts", { _subject_ids: ids });
      for (const r of (data ?? []) as { subject_id: string; cnt: number }[]) counts.set(r.subject_id, Number(r.cnt) || 0);
    }
    subjects = rows.map((r) => toSubject(r, counts.get(r.id) ?? 0));
  }
  return { course: c, groups, subjects };
}

/** One request; falls back to the separate queries if the database function is not installed yet. */
export async function fetchCoursePage(courseId: string): Promise<CoursePageData> {
  const { data, error } = await (supabase as any).rpc("get_course_page", { _course_id: courseId });
  if (error) return fetchCoursePageLegacy(courseId);
  if (!data) return null;
  const d = data as { course: any; groups: CoursePageGroup[]; subjects: any[] };
  return {
    course: d.course,
    groups: d.groups ?? [],
    subjects: (d.subjects ?? []).map((r) => toSubject(r, Number(r.question_count) || 0)),
  };
}

/** Start loading a course's page data before the student opens it (hover / touch on its card). */
export function prefetchCoursePage(qc: QueryClient, courseId: string) {
  void qc.prefetchQuery({ queryKey: coursePageKey(courseId), queryFn: () => fetchCoursePage(courseId), staleTime: 5 * 60_000 });
}

export type PoolCounts = { flagged: Record<string, number>; incorrect: Record<string, number> };

/** The student's flagged and wrong-answer counts per subject. */
export async function fetchPoolCounts(userId: string, subjectIds: string[]): Promise<PoolCounts> {
  const out: PoolCounts = { flagged: {}, incorrect: {} };
  if (!subjectIds.length) return out;
  const { data, error } = await (supabase as any).rpc("get_my_subject_pool_counts", { _subject_ids: subjectIds });
  if (!error) {
    for (const r of (data ?? []) as { subject_id: string; flagged: number; incorrect: number }[]) {
      if (Number(r.flagged) > 0) out.flagged[r.subject_id] = Number(r.flagged);
      if (Number(r.incorrect) > 0) out.incorrect[r.subject_id] = Number(r.incorrect);
    }
    return out;
  }
  // Fallback: the earlier way, downloading the course's question ids.
  const { data: qRows } = await (supabase.from as any)("questions").select("id,subject_id").in("subject_id", subjectIds);
  const qToSubject = new Map<string, string>(((qRows ?? []) as any[]).map((r) => [r.id, r.subject_id]));
  const qids = Array.from(qToSubject.keys());
  if (!qids.length) return out;
  const [{ data: flagRows }, { data: attemptRows }] = await Promise.all([
    (supabase.from as any)("question_flags").select("question_id").eq("user_id", userId).in("question_id", qids),
    (supabase.from as any)("question_attempts").select("question_id").eq("user_id", userId).eq("is_correct", false).in("question_id", qids),
  ]);
  for (const r of (flagRows ?? []) as any[]) {
    const sid = qToSubject.get(r.question_id);
    if (sid) out.flagged[sid] = (out.flagged[sid] ?? 0) + 1;
  }
  const wrong = new Set<string>(((attemptRows ?? []) as any[]).map((r) => r.question_id));
  for (const qid of wrong) {
    const sid = qToSubject.get(qid);
    if (sid) out.incorrect[sid] = (out.incorrect[sid] ?? 0) + 1;
  }
  return out;
}
