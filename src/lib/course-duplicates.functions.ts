import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DuplicateQuestionItem = {
  id: string;
  stem: string;
  explanation: string | null;
  answer_mode: string;
  subject_id: string;
  subject_name: string;
  group_name: string;
  options: Array<{
    label: string;
    text: string;
    is_correct: boolean;
    sort_order: number;
  }>;
  created_at?: string | null;
};

export type DuplicateCluster = {
  clusterId: string;
  canonicalStem: string;
  isExact: boolean;
  questions: DuplicateQuestionItem[];
};

export type CourseDuplicateReport = {
  courseId: string;
  courseTitle: string;
  totalQuestions: number;
  totalSubjects: number;
  duplicateClustersCount: number;
  redundantQuestionsCount: number;
  clusters: DuplicateCluster[];
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function cleanStem(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  // Strip html tags
  s = s.replace(/<[^>]+>/g, " ");
  // Strip markdown formatting characters
  s = s.replace(/[*_~`#]/g, "");
  // Strip leading question numbers like "1.", "1)", "1 -", "Q1:", "Question 1:", "1:"
  s = s.replace(/^(?:(?:q|question)\s*\d+[\s.:)\-–—=]+|\d+[\s.:)\-–—=]+)/i, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  // Strip surrounding punctuation
  s = s.replace(/^[:;.,\-–—\s]+|[:;.,\-–—\s]+$/g, "");
  return s;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const setA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const setB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export const findCourseDuplicateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CourseDuplicateReport> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: course, error: cErr } = await supabaseAdmin
      .from("courses")
      .select("id, title")
      .eq("id", data.courseId)
      .single();
    if (cErr || !course) throw new Error(cErr?.message ?? "Course not found");

    const { data: groups } = await supabaseAdmin
      .from("subject_groups")
      .select("id, name, sort_order")
      .eq("course_id", data.courseId)
      .order("sort_order");

    const groupMap = new Map<string, string>();
    (groups ?? []).forEach((g: any) => groupMap.set(g.id, g.name));

    const groupIds = (groups ?? []).map((g: any) => g.id);
    const { data: subjects } = groupIds.length
      ? await supabaseAdmin
          .from("subjects")
          .select("id, group_id, name, sort_order")
          .in("group_id", groupIds)
          .order("sort_order")
      : { data: [] as any[] };

    const subjectMap = new Map<string, { name: string; groupName: string }>();
    (subjects ?? []).forEach((s: any) => {
      subjectMap.set(s.id, {
        name: s.name,
        groupName: groupMap.get(s.group_id) || "General",
      });
    });

    const subjectIds = (subjects ?? []).map((s: any) => s.id);
    const questions: any[] = [];
    for (let i = 0; i < subjectIds.length; i += 200) {
      const chunk = subjectIds.slice(i, i + 200);
      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("id, subject_id, stem, explanation, answer_mode, sort_order, created_at")
        .in("subject_id", chunk)
        .order("sort_order");
      if (qs) questions.push(...qs);
    }

    const qIds = questions.map((q) => q.id);
    const options: any[] = [];
    for (let i = 0; i < qIds.length; i += 500) {
      const chunk = qIds.slice(i, i + 500);
      const { data: os } = await supabaseAdmin
        .from("question_options")
        .select("question_id, label, text, is_correct, sort_order")
        .in("question_id", chunk)
        .order("sort_order");
      if (os) options.push(...os);
    }

    const optsByQ = new Map<string, any[]>();
    for (const o of options) {
      const arr = optsByQ.get(o.question_id) ?? [];
      arr.push({
        label: o.label,
        text: o.text,
        is_correct: !!o.is_correct,
        sort_order: o.sort_order,
      });
      optsByQ.set(o.question_id, arr);
    }

    // Index questions by cleaned stem for exact duplicates
    const exactClusters = new Map<string, DuplicateQuestionItem[]>();
    const cleanedStems: Array<{ cleaned: string; item: DuplicateQuestionItem }> = [];

    for (const q of questions) {
      const subInfo = subjectMap.get(q.subject_id) || { name: "Unknown Subject", groupName: "Unknown Group" };
      const item: DuplicateQuestionItem = {
        id: q.id,
        stem: q.stem,
        explanation: q.explanation,
        answer_mode: q.answer_mode ?? "single",
        subject_id: q.subject_id,
        subject_name: subInfo.name,
        group_name: subInfo.groupName,
        options: optsByQ.get(q.id) ?? [],
        created_at: q.created_at ?? null,
      };

      const cleaned = cleanStem(q.stem);
      if (!cleaned) continue;

      cleanedStems.push({ cleaned, item });
      const existing = exactClusters.get(cleaned) ?? [];
      existing.push(item);
      exactClusters.set(cleaned, existing);
    }

    const finalClusters: DuplicateCluster[] = [];
    const usedItemIds = new Set<string>();

    // 1. First pass: exact cleaned stem matches
    let clusterCounter = 1;
    for (const [cleaned, list] of exactClusters.entries()) {
      if (list.length >= 2) {
        list.forEach((it) => usedItemIds.add(it.id));
        finalClusters.push({
          clusterId: `cluster-${clusterCounter++}`,
          canonicalStem: list[0].stem,
          isExact: true,
          questions: list,
        });
      }
    }

    // 2. Second pass: near-duplicate stem matches (>92% similarity)
    const remaining = cleanedStems.filter((s) => !usedItemIds.has(s.item.id) && s.cleaned.length >= 25);
    for (let i = 0; i < remaining.length; i++) {
      if (usedItemIds.has(remaining[i].item.id)) continue;
      const group: DuplicateQuestionItem[] = [remaining[i].item];

      for (let j = i + 1; j < remaining.length; j++) {
        if (usedItemIds.has(remaining[j].item.id)) continue;
        const sim = tokenSimilarity(remaining[i].cleaned, remaining[j].cleaned);
        if (sim >= 0.92) {
          group.push(remaining[j].item);
          usedItemIds.add(remaining[j].item.id);
        }
      }

      if (group.length >= 2) {
        usedItemIds.add(remaining[i].item.id);
        finalClusters.push({
          clusterId: `cluster-${clusterCounter++}`,
          canonicalStem: group[0].stem,
          isExact: false,
          questions: group,
        });
      }
    }

    const redundantQuestionsCount = finalClusters.reduce((sum, c) => sum + (c.questions.length - 1), 0);

    return {
      courseId: data.courseId,
      courseTitle: course.title,
      totalQuestions: questions.length,
      totalSubjects: (subjects ?? []).length,
      duplicateClustersCount: finalClusters.length,
      redundantQuestionsCount,
      clusters: finalClusters,
    };
  });

export const deleteCourseDuplicateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("id", data.questionId);

    if (error) throw new Error(error.message);
    return { success: true, questionId: data.questionId };
  });
