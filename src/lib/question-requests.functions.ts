import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, pourIntoCourse } from "@/lib/question-bank.server";
import type { QbQuestion } from "@/lib/question-bank";

/** Admin only: copies a contributor's group into a new subject of a course section. */
export const qrAddToCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; sectionId: string; subjectName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: qs, error } = await sb.from("request_questions").select("*").eq("group_id", data.groupId).order("sort_order");
    if (error) throw new Error(error.message);
    const list = (qs ?? []) as any[];
    if (!list.length) throw new Error("This group has no questions.");
    const { data: opts, error: oErr } = await sb
      .from("request_question_options").select("*").in("question_id", list.map((q) => q.id)).order("sort_order");
    if (oErr) throw new Error(oErr.message);
    const questions: QbQuestion[] = list.map((q, i) => ({
      stem: q.stem,
      explanation: q.explanation,
      answer_mode: q.answer_mode === "multiple" ? "multiple" : "single",
      sort_order: i + 1,
      image_url: q.image_url,
      options: ((opts ?? []) as any[])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ label: o.label, text: o.text, is_correct: o.is_correct, sort_order: o.sort_order })),
    }));
    const name = data.subjectName.trim();
    if (!name) throw new Error("Give the subject a name.");
    return pourIntoCourse({ sectionId: data.sectionId, subjectName: name, questions });
  });
