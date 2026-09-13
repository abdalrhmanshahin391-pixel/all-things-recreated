import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

const SEMESTER_KEY_PREFIX = "course_semester_";

/**
 * Loads all course semester assignments from site_content as a Map(courseId -> 1 | 2).
 */
export async function fetchCourseSemestersMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data, error } = await (supabase.from as any)("site_content")
      .select("key,value_en")
      .like("key", `${SEMESTER_KEY_PREFIX}%`);

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (typeof row?.key === "string") {
          const cid = row.key.replace(SEMESTER_KEY_PREFIX, "");
          const val = Number(row.value_en);
          if (val === 1 || val === 2) {
            map.set(cid, val);
          }
        }
      }
    }
  } catch (err) {
    console.warn("fetchCourseSemestersMap failed:", err);
  }
  return map;
}

/**
 * Enriches an array of courses so that `course.semester` is populated
 * from the database column if present, or falls back to the site_content map.
 */
export function enrichCoursesWithSemesters<T extends { id: string; semester?: number | null }>(
  courses: T[],
  semesterMap: Map<string, number>,
): T[] {
  for (const c of courses) {
    if (c.semester === 1 || c.semester === 2) {
      // Already has a valid physical semester column value
      continue;
    }
    const fallbackVal = semesterMap.get(c.id);
    if (fallbackVal === 1 || fallbackVal === 2) {
      c.semester = fallbackVal;
    } else {
      c.semester = null;
    }
  }
  return courses;
}

/**
 * Server function to persist course semester.
 * Updates physical column if present, and always mirrors into site_content.
 */
export const saveCourseSemesterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { courseId: string; semester: number | null }) => {
    if (!data?.courseId) throw new Error("courseId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { courseId, semester } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Try updating physical column if it exists in schema
    try {
      await (supabaseAdmin.from("courses") as any)
        .update({ semester: (semester === 1 || semester === 2) ? semester : null })
        .eq("id", courseId);
    } catch {
      // Ignore if physical column does not exist yet
    }

    // 2. Always persist into site_content so semester is guaranteed to save
    const key = `${SEMESTER_KEY_PREFIX}${courseId}`;
    if (semester === 1 || semester === 2) {
      const { error: upsertErr } = await (supabaseAdmin.from as any)("site_content").upsert(
        {
          key,
          group_key: "courses",
          group_label: "Courses",
          label: `Semester for course ${courseId}`,
          kind: "text",
          value_en: String(semester),
          value_ar: String(semester),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (upsertErr) {
        console.warn("Failed to upsert course semester into site_content:", upsertErr);
      }
    } else {
      await (supabaseAdmin.from as any)("site_content").delete().eq("key", key);
    }

    return { ok: true, courseId, semester };
  });

/**
 * Client helper to save course semester with multiple fallbacks.
 */
export async function persistCourseSemester(courseId: string, semester: number | null) {
  const norm = (semester === 1 || semester === 2) ? semester : null;

  // 1. Server function (bypasses RLS)
  try {
    await saveCourseSemesterFn({ data: { courseId, semester: norm } });
    return;
  } catch (serverErr) {
    console.warn("saveCourseSemesterFn server error, attempting client fallback:", serverErr);
  }

  // 2. Direct client fallback via site_content
  try {
    const key = `${SEMESTER_KEY_PREFIX}${courseId}`;
    if (norm) {
      await (supabase.from as any)("site_content").upsert({
        key,
        group_key: "courses",
        group_label: "Courses",
        label: `Semester for course ${courseId}`,
        kind: "text",
        value_en: String(norm),
        value_ar: String(norm),
        updated_at: new Date().toISOString(),
      });
    } else {
      await (supabase.from as any)("site_content").delete().eq("key", key);
    }
  } catch (clientErr) {
    console.warn("Direct site_content client fallback also failed:", clientErr);
  }
}
