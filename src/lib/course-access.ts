import { supabase } from "@/integrations/supabase/client";

export type CourseKind = "questions" | "lectures";

export function isFreeCourse(price: number | null | undefined): boolean {
  return (Number(price) || 0) <= 0;
}

export function accessTableFor(kind: string | null | undefined) {
  return kind === "lectures" ? "user_lecture_courses" : "user_courses";
}

import { enrollFreeCourseServerFn } from "./course-enrollment.functions";

/** Grants access to a free course. Safe to call repeatedly. */
export async function ensureFreeEnrollment(
  userId: string,
  courseId: string,
  kind: string | null | undefined,
): Promise<void> {
  try {
    await enrollFreeCourseServerFn({ data: { courseId, kind: kind === "lectures" ? "lectures" : "questions" } });
  } catch (serverErr) {
    // Fallback to client upsert in case caller is already an admin or offline
    const table = accessTableFor(kind);
    await (supabase.from(table) as any).upsert(
      { user_id: userId, course_id: courseId },
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    );
  }
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
