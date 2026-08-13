import { supabase } from "@/integrations/supabase/client";

export type CourseKind = "questions" | "lectures";

export function isFreeCourse(price: number | null | undefined): boolean {
  return (Number(price) || 0) <= 0;
}

export function accessTableFor(kind: string | null | undefined) {
  return kind === "lectures" ? "user_lecture_courses" : "user_courses";
}

/** Grants access to a free course. Safe to call repeatedly. */
export async function ensureFreeEnrollment(
  userId: string,
  courseId: string,
  kind: string | null | undefined,
): Promise<void> {
  const table = accessTableFor(kind);
  await (supabase.from(table) as any).upsert(
    { user_id: userId, course_id: courseId },
    { onConflict: "user_id,course_id", ignoreDuplicates: true },
  );
}

export async function hasCourseAccess(
  userId: string,
  courseId: string,
  kind: string | null | undefined,
): Promise<boolean> {
  const table = accessTableFor(kind);
  const { data } = await (supabase.from(table) as any)
    .select("user_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  return !!data;
}
