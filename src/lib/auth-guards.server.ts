import { getRequest } from "@tanstack/react-start/server";

/** Who is calling this server function, read from the Authorization header. `userId` is null for signed-out callers. */
export async function getCaller() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let userId: string | null = null;
  let isAdmin = false;
  try {
    const authHeader = getRequest()?.headers?.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token && token.split(".").length === 3) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user?.id) {
        userId = data.user.id;
        const { data: roleCheck } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
        isAdmin = Boolean(roleCheck);
      }
    }
  } catch (err) {
    console.warn("[getCaller] could not verify the auth header:", err);
  }
  return { userId, isAdmin, supabaseAdmin };
}

/** Throws unless the caller is a signed-in admin. */
export async function requireAdminCaller() {
  const caller = await getCaller();
  if (!caller.userId) throw new Error("Unauthorized: sign in required");
  if (!caller.isAdmin) throw new Error("Forbidden: admin only");
  return caller;
}

/** Throws unless the caller is signed in. */
export async function requireSignedInCaller() {
  const caller = await getCaller();
  if (!caller.userId) throw new Error("Unauthorized: sign in required");
  return caller as typeof caller & { userId: string };
}

/**
 * Whether a person may open a private lecture file (video or PDF): admins, golden members, staff of the course,
 * students enrolled in it, or anyone for a lesson marked free. A file that no lesson or material points to is
 * only opened by admins and by people who can view the course named in `courseHint`.
 */
export async function canOpenLectureFile(
  caller: { userId: string | null; isAdmin: boolean; supabaseAdmin: any },
  path: string,
  kind: "video" | "pdf",
  courseHint?: string,
): Promise<boolean> {
  const { userId, isAdmin, supabaseAdmin } = caller;
  if (isAdmin) return true;

  const column = kind === "video" ? "video_storage_path" : "pdf_storage_path";
  const courseIds = new Set<string>();
  let free = false;

  const { data: items } = await supabaseAdmin.from("lecture_items").select("is_free,subject_id").eq(column, path);
  const subjectIds = [...new Set(((items ?? []) as any[]).map((i) => i.subject_id).filter(Boolean))];
  for (const i of (items ?? []) as any[]) if (i.is_free) free = true;
  if (subjectIds.length) {
    const { data: subs } = await supabaseAdmin.from("lecture_subjects").select("course_id").in("id", subjectIds);
    for (const s of (subs ?? []) as any[]) if (s.course_id) courseIds.add(s.course_id);
  }
  if (kind === "pdf") {
    const { data: mats } = await supabaseAdmin.from("lecture_course_materials").select("course_id").eq("storage_path", path);
    for (const m of (mats ?? []) as any[]) if (m.course_id) courseIds.add(m.course_id);
  }

  if (free) return true;
  if (!userId) return false;
  if (!courseIds.size && courseHint && path.includes(courseHint)) courseIds.add(courseHint);
  if (!courseIds.size) return false;

  const { data: golden } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "golden" });
  if (golden) return true;

  const ids = [...courseIds];
  const [{ data: enrolled }, { data: staff }] = await Promise.all([
    supabaseAdmin.from("user_lecture_courses").select("course_id").eq("user_id", userId).in("course_id", ids).limit(1),
    supabaseAdmin.from("lecture_staff").select("course_id").eq("user_id", userId).in("course_id", ids).limit(1),
  ]);
  return Boolean(enrolled?.length || staff?.length);
}
