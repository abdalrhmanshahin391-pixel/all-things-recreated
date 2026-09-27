import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureCombinedStemWithStatements } from "@/lib/question-format";
import { stripSourceCitation } from "@/lib/aqua-mcq-forge.explanation";

export type OptionData = {
  id: string;
  label: string;
  text: string;
  is_correct: boolean;
  sort_order: number;
};

export type QuestionData = {
  id: string;
  subject_id: string;
  stem: string;
  explanation: string | null;
  image_url: string | null;
  answer_mode: "single" | "multiple";
  sort_order: number;
  question_options: OptionData[];
};

async function resolveCallerUser() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let userId: string | null = null;
  let isAdmin = false;

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
        }
      }
    }
  } catch (err) {
    console.warn("[resolveCallerUser] Could not verify auth header:", err);
  }

  return { userId, isAdmin, supabaseAdmin };
}

/**
 * Server function to securely enroll a student in a free course (price <= 0).
 * Bypasses client-side RLS using supabaseAdmin so user_courses row is reliably created.
 */
export const enrollFreeCourseServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; kind?: "questions" | "lectures" }) => {
    if (!data?.courseId) throw new Error("courseId required");
    return data;
  })
  .handler(async ({ data }) => {
    const { userId, isAdmin, supabaseAdmin } = await resolveCallerUser();
    if (!userId) {
      throw new Error("Unauthorized: Sign in required to enroll in course");
    }

    const { data: course, error: cErr } = await (supabaseAdmin.from("courses") as any)
      .select("id, price, kind")
      .eq("id", data.courseId)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!course) throw new Error("Course not found");

    const price = Number(course.price ?? 0);
    // If course is not free and caller is not admin, cannot auto-enroll without payment
    if (price > 0 && !isAdmin) {
      throw new Error("Course is not free");
    }

    const table = (data.kind || course.kind) === "lectures" ? "user_lecture_courses" : "user_courses";
    const { error: insErr } = await (supabaseAdmin.from(table) as any).upsert(
      { user_id: userId, course_id: data.courseId },
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    );

    if (insErr) {
      console.error("[enrollFreeCourseServerFn] Failed to insert enrollment:", insErr);
      throw insErr;
    }

    return { ok: true, enrolled: true };
  });

/**
 * Loads questions and options for a study/session/exam run according to the platform access rules:
 * 1. Admin: access everything.
 * 2. PUBLIC (free_public): free for everyone (even guests).
 * 3. LOGGED-IN (free_logged_in): free for any logged-in user.
 * 4. PAID (paid):
 *    - In free courses (price <= 0): acts like LOGGED-IN (free for any logged-in user, auto-enrolls).
 *    - In paid courses (price > 0): requires user_courses enrollment or active package purchase.
 */
export const loadCourseRunQuestionsServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: {
    courseId: string;
    subjectIds: string[];
  }) => {
    if (!data?.courseId) throw new Error("courseId required");
    if (!Array.isArray(data.subjectIds)) throw new Error("subjectIds must be an array");
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: boolean; questions: QuestionData[] }> => {
    const { userId, isAdmin, supabaseAdmin } = await resolveCallerUser();

    // 1. Fetch course details
    const { data: course, error: courseErr } = await (supabaseAdmin.from("courses") as any)
      .select("id, price, published")
      .eq("id", data.courseId)
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!course) throw new Error("Course not found");

    const isFree = Number(course.price ?? 0) <= 0;

    // 2. Fetch all requested subjects and their groups
    let subjectIds = data.subjectIds.filter(Boolean);
    if (subjectIds.length === 0) {
      return { ok: true, questions: [] };
    }

    const { data: subRows, error: subErr } = await (supabaseAdmin.from("subjects") as any)
      .select("id, access_level, group_id, subject_groups!inner(course_id)")
      .in("id", subjectIds);

    if (subErr) throw subErr;

    // Filter to subjects that actually belong to this course
    const validSubs = (subRows ?? []).filter(
      (s: any) => s.subject_groups?.course_id === data.courseId,
    );

    if (validSubs.length === 0) {
      return { ok: true, questions: [] };
    }

    // 3. Check enrollment if user is logged in
    let isEnrolled = false;
    if (userId) {
      const { data: enr } = await (supabaseAdmin.from("user_courses") as any)
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", data.courseId)
        .maybeSingle();

      if (enr) {
        isEnrolled = true;
      } else if (isFree) {
        // Free course: auto-enroll logged in user
        await (supabaseAdmin.from("user_courses") as any).upsert(
          { user_id: userId, course_id: data.courseId },
          { onConflict: "user_id,course_id", ignoreDuplicates: true },
        );
        isEnrolled = true;
      } else {
        // Check active package purchase
        const { data: pkgPurchases } = await (supabaseAdmin.from("package_purchases") as any)
          .select("package_id, status")
          .eq("user_id", userId);

        const activePkgIds = (pkgPurchases ?? [])
          .filter((p: any) => !p.status || p.status === "active" || p.status === "completed")
          .map((p: any) => p.package_id);

        if (activePkgIds.length > 0) {
          const { data: link } = await (supabaseAdmin.from("package_courses") as any)
            .select("id")
            .eq("course_id", data.courseId)
            .in("package_id", activePkgIds)
            .limit(1);

          if (link && link.length > 0) {
            isEnrolled = true;
          }
        }
      }
    }

    // 4. Determine allowed subjects based on user-defined rules:
    // - Admin: all
    // - free_public: everyone (guest or logged-in)
    // - free_logged_in: any logged-in user
    // - paid: free course (isFree) OR isEnrolled
    const allowedSubjectIds = validSubs
      .filter((s: any) => {
        if (isAdmin) return true;
        const access = s.access_level || "paid";
        if (access === "free_public") return true;
        if (!userId) return false;
        if (access === "free_logged_in") return true;
        if (isFree || isEnrolled) return true;
        return false;
      })
      .map((s: any) => s.id as string);

    if (allowedSubjectIds.length === 0) {
      return { ok: true, questions: [] };
    }

    // 5. Query questions and options with supabaseAdmin
    const { data: qs, error: qErr } = await (supabaseAdmin.from("questions") as any)
      .select(
        "id,subject_id,stem,explanation,image_url,answer_mode,sort_order,question_options(id,label,text,is_correct,sort_order)",
      )
      .in("subject_id", allowedSubjectIds)
      .order("sort_order");

    if (qErr) {
      console.error("[loadCourseRunQuestionsServerFn] Failed to fetch questions:", qErr);
      throw qErr;
    }

    const processedQuestions = (qs ?? []).map((q: any) => {
      const options = q.question_options ?? [];
      const cleanExp = stripSourceCitation(q.explanation);
      const completeStem = ensureCombinedStemWithStatements(q.stem, cleanExp, options);
      return {
        ...q,
        stem: completeStem,
        explanation: cleanExp,
      };
    });

    // Opportunistically persist healed stems in the background
    try {
      for (const pq of processedQuestions) {
        const orig = (qs ?? []).find((q: any) => q.id === pq.id);
        if (orig && (pq.stem !== orig.stem || pq.explanation !== orig.explanation)) {
          void (supabaseAdmin.from("questions") as any)
            .update({ stem: pq.stem, explanation: pq.explanation || null })
            .eq("id", pq.id);
        }
      }
    } catch {
      // non-blocking
    }

    return {
      ok: true,
      questions: processedQuestions as QuestionData[],
    };
  });
