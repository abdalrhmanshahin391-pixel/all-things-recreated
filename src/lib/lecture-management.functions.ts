import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type LectureCourseOwner = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  granted_at: string;
  granted_reason: string | null;
};

export type QuestionBankCourseOption = {
  id: string;
  title: string;
  year: number;
  price: number;
  category: string;
  questions_count_final: number;
};

/**
 * Resolves the authenticated caller user and checks admin & head-of-staff permissions.
 */
async function resolveCallerAndPermissions(courseId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let userId: string | null = null;
  let isAdmin = false;
  let isHead = false;
  let isStaff = false;

  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token && token.split(".").length === 3) {
        const { data: authUser } = await supabaseAdmin.auth.getUser(token);
        if (authUser?.user?.id) {
          userId = authUser.user.id;
          const { data: roleCheck } = await supabaseAdmin.rpc("has_role", {
            _user_id: userId,
            _role: "admin",
          });
          isAdmin = Boolean(roleCheck);

          if (courseId && userId) {
            // Check if user is in lecture_staff for this course
            const { data: staffRow } = await (supabaseAdmin.from as any)("lecture_staff")
              .select("course_id")
              .eq("course_id", courseId)
              .eq("user_id", userId)
              .maybeSingle();
            isStaff = Boolean(staffRow);

            // Check if user is designated as head of staff for this course in site_content
            const { data: headRow } = await (supabaseAdmin.from as any)("site_content")
              .select("value_en")
              .eq("key", `lecture_head_staff_${courseId}`)
              .maybeSingle();

            const headIds: string[] = headRow?.value_en
              ? headRow.value_en.split(",").map((s: string) => s.trim())
              : [];
            isHead = isAdmin || (isStaff && headIds.includes(userId));
          }
        }
      }
    }
  } catch (err) {
    console.warn("[resolveCallerAndPermissions] Error verifying auth header:", err);
  }

  return { userId, isAdmin, isHead, isStaff, supabaseAdmin };
}

/**
 * List all users who own / are enrolled in a lecture course.
 * Authorized for Site Admins and designated Head of Staff.
 */
export const listLectureCourseOwnersServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string }) => {
    if (!data?.courseId) throw new Error("courseId is required");
    return data;
  })
  .handler(async ({ data }) => {
    const { courseId } = data;
    const { userId, isAdmin, isHead, supabaseAdmin } = await resolveCallerAndPermissions(courseId);

    // Allow site admins and course head staff (and regular staff in read mode)
    if (!isAdmin && !isHead) {
      // Also check if user is staff with read rights
      const { data: isStaffRpc } = await (supabaseAdmin.rpc as any)("is_lecture_staff", {
        _course_id: courseId,
        _user_id: userId || "00000000-0000-0000-0000-000000000000",
      });
      if (!isStaffRpc) {
        throw new Error("Unauthorized: Only Admins and Head of Staff can view course owners.");
      }
    }

    // Query user_lecture_courses joined with profiles
    const { data: rows, error } = await (supabaseAdmin.from as any)("user_lecture_courses")
      .select("user_id, granted_at, granted_reason")
      .eq("course_id", courseId)
      .order("granted_at", { ascending: false });

    if (error) {
      console.error("[listLectureCourseOwnersServerFn] Error fetching owners:", error);
      throw new Error(error.message);
    }

    const ownersList: any[] = rows ?? [];
    const userIds = ownersList.map((r) => r.user_id).filter(Boolean);

    let profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username, full_name, email, avatar_url")
        .in("id", userIds);
      (profs ?? []).forEach((p) => profilesMap.set(p.id, p));
    }

    const owners: LectureCourseOwner[] = ownersList.map((r) => {
      const p = profilesMap.get(r.user_id) || {};
      return {
        user_id: r.user_id,
        username: p.username ?? null,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        avatar_url: p.avatar_url ?? null,
        granted_at: r.granted_at,
        granted_reason: r.granted_reason ?? null,
      };
    });

    return {
      owners,
      totalCount: owners.length,
      isAdmin,
      isHead,
    };
  });

/**
 * Grant access to a lecture course for a specific user.
 * Authorized for Site Admins and Head of Staff.
 */
export const grantLectureCourseAccessServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; targetUserId: string; reason?: string }) => {
    if (!data?.courseId || !data?.targetUserId) throw new Error("courseId and targetUserId are required");
    return data;
  })
  .handler(async ({ data }) => {
    const { courseId, targetUserId, reason } = data;
    const { isAdmin, isHead, supabaseAdmin } = await resolveCallerAndPermissions(courseId);

    if (!isAdmin && !isHead) {
      throw new Error("Unauthorized: Only Admins and Head of Staff can grant course access.");
    }

    const { error } = await (supabaseAdmin.from as any)("user_lecture_courses").upsert(
      {
        course_id: courseId,
        user_id: targetUserId,
        granted_reason: reason || (isHead ? "granted_by_head_staff" : "granted_by_admin"),
        granted_at: new Date().toISOString(),
      },
      { onConflict: "course_id,user_id" },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Revoke access to a lecture course for a specific user.
 * Authorized for Site Admins and Head of Staff.
 */
export const revokeLectureCourseAccessServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; targetUserId: string }) => {
    if (!data?.courseId || !data?.targetUserId) throw new Error("courseId and targetUserId are required");
    return data;
  })
  .handler(async ({ data }) => {
    const { courseId, targetUserId } = data;
    const { isAdmin, isHead, supabaseAdmin } = await resolveCallerAndPermissions(courseId);

    if (!isAdmin && !isHead) {
      throw new Error("Unauthorized: Only Admins and Head of Staff can revoke course access.");
    }

    const { error } = await (supabaseAdmin.from as any)("user_lecture_courses")
      .delete()
      .eq("course_id", courseId)
      .eq("user_id", targetUserId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Get designated Head of Staff user IDs for a lecture course.
 */
export const getLectureHeadStaffServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string }) => {
    if (!data?.courseId) throw new Error("courseId is required");
    return data;
  })
  .handler(async ({ data }) => {
    const { courseId } = data;
    const { supabaseAdmin, userId, isAdmin } = await resolveCallerAndPermissions(courseId);

    const { data: row } = await (supabaseAdmin.from as any)("site_content")
      .select("value_en")
      .eq("key", `lecture_head_staff_${courseId}`)
      .maybeSingle();

    const headUserIds: string[] = row?.value_en
      ? row.value_en.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const isCurrentCallerHead = isAdmin || (userId ? headUserIds.includes(userId) : false);

    return {
      headUserIds,
      isCurrentCallerHead,
      isAdmin,
    };
  });

/**
 * Designate or remove a staff member as Head of Staff.
 * Authorized for Site Admins only.
 */
export const setLectureHeadStaffServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; userId: string; isHead: boolean }) => {
    if (!data?.courseId || !data?.userId) throw new Error("courseId and userId are required");
    return data;
  })
  .handler(async ({ data }) => {
    const { courseId, userId: targetUserId, isHead } = data;
    const { isAdmin, supabaseAdmin } = await resolveCallerAndPermissions(courseId);

    if (!isAdmin) {
      throw new Error("Unauthorized: Only site administrators can assign the Head of Staff.");
    }

    const key = `lecture_head_staff_${courseId}`;
    const { data: row } = await (supabaseAdmin.from as any)("site_content")
      .select("value_en")
      .eq("key", key)
      .maybeSingle();

    let currentHeads: string[] = row?.value_en
      ? row.value_en.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (isHead) {
      if (!currentHeads.includes(targetUserId)) {
        currentHeads.push(targetUserId);
      }
    } else {
      currentHeads = currentHeads.filter((id) => id !== targetUserId);
    }

    if (currentHeads.length > 0) {
      const { error } = await (supabaseAdmin.from as any)("site_content").upsert(
        {
          key,
          value_en: currentHeads.join(","),
          group_key: "lectures",
          group_label: "Lecture Staff",
          label: "Head of Staff User IDs",
          kind: "text",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
    } else {
      await (supabaseAdmin.from as any)("site_content").delete().eq("key", key);
    }

    return { ok: true, headUserIds: currentHeads };
  });

/**
 * Fetch Question Bank courses (where kind = 'questions') to let teachers
 * link a course from courses to a lecture topic/class as a Test or Homework.
 */
export const listQuestionBankCoursesServerFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("id, title, year, price, category, questions_count_final")
      .eq("kind", "questions")
      .eq("published", true)
      .order("year", { ascending: true })
      .order("title", { ascending: true });

    if (error) throw new Error(error.message);
    return { courses: (data ?? []) as QuestionBankCourseOption[] };
  });
