import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { formatQuestionStem } from "@/lib/question-format";

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
 * Server function to export all questions and options from a section (subject group)
 * specifically formatted for Google NotebookLM.
 *
 * Excludes answers (is_correct) and explanations to allow NotebookLM to solve them.
 */
export const exportSectionQuestionsForNotebookLmServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; groupId: string }) => {
    if (!data?.courseId || !data?.groupId) throw new Error("courseId and groupId are required");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await resolveCallerUser();

    // 1. Fetch course info
    const { data: course, error: cErr } = await (supabaseAdmin.from("courses") as any)
      .select("id, title, year")
      .eq("id", data.courseId)
      .maybeSingle();
    if (cErr || !course) throw new Error("Course not found");

    // 2. Fetch section (group) info
    const { data: group, error: gErr } = await (supabaseAdmin.from("subject_groups") as any)
      .select("id, name, sort_order")
      .eq("id", data.groupId)
      .eq("course_id", data.courseId)
      .maybeSingle();
    if (gErr || !group) throw new Error("Section not found");

    // 3. Fetch subjects in this group
    const { data: subjects, error: sErr } = await (supabaseAdmin.from("subjects") as any)
      .select("id, name, sort_order")
      .eq("group_id", data.groupId)
      .order("sort_order");
    if (sErr) throw sErr;

    const subjectIds = (subjects ?? []).map((s: any) => s.id as string);
    if (subjectIds.length === 0) {
      return {
        ok: true,
        text: `==================================================\nCOURSE: ${course.title}\nSECTION: ${group.name}\nTOTAL QUESTIONS: 0\n==================================================\n\nNo subjects or questions found in this section.`,
        questionCount: 0,
        groupName: group.name,
        courseTitle: course.title,
      };
    }

    const subjectMap = new Map<string, string>();
    for (const s of (subjects ?? [])) {
      subjectMap.set(s.id, s.name);
    }

    // 4. Fetch questions and options (STRICTLY omitting is_correct and explanation!)
    const { data: questions, error: qErr } = await (supabaseAdmin.from("questions") as any)
      .select(
        "id, subject_id, stem, sort_order, answer_mode, question_options(id, label, text, sort_order)",
      )
      .in("subject_id", subjectIds)
      .order("sort_order");
    if (qErr) throw qErr;

    const qList = (questions ?? []) as any[];

    // 5. Build clean, readable plain-text document for NotebookLM
    const lines: string[] = [];
    lines.push(`==================================================`);
    lines.push(`COURSE: ${course.title}${course.year ? ` (Year ${course.year})` : ""}`);
    lines.push(`SECTION: ${group.name}`);
    lines.push(`TOTAL QUESTIONS: ${qList.length}`);
    lines.push(`==================================================\n`);

    let currentSubjectId = "";
    let questionIndex = 1;

    for (const q of qList) {
      const subjectName = subjectMap.get(q.subject_id) || "";
      if (q.subject_id !== currentSubjectId) {
        currentSubjectId = q.subject_id;
        lines.push(`\n### SUBJECT: ${subjectName}\n`);
      }

      // Format stem with clean line breaks for numbered statements
      const formattedStem = formatQuestionStem(q.stem || "");
      lines.push(`${questionIndex}. ${formattedStem}`);

      if (q.answer_mode === "multiple") {
        lines.push(`(Select all that apply)`);
      }

      // Format options
      const options = (q.question_options ?? [])
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      if (options.length > 0) {
        lines.push("");
        for (const opt of options) {
          lines.push(`${opt.label}. ${opt.text}`);
        }
      }

      lines.push(`\n--------------------------------------------------\n`);
      questionIndex++;
    }

    return {
      ok: true,
      text: lines.join("\n"),
      questionCount: qList.length,
      groupName: group.name,
      courseTitle: course.title,
    };
  });
