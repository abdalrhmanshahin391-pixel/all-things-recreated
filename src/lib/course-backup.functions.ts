import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BACKUP_FORMAT = "lovable-course-backup";
const BACKUP_VERSION = 1;

export type BackupOption = {
  label: string;
  text: string;
  is_correct: boolean;
  sort_order: number;
};
export type BackupQuestion = {
  stem: string;
  explanation: string | null;
  answer_mode?: "single" | "multiple";
  sort_order: number;
  options: BackupOption[];
};
export type BackupSubject = {
  name: string;
  access_level: string;
  sort_order: number;
  questions: BackupQuestion[];
};
export type BackupGroup = {
  name: string;
  sort_order: number;
  subjects: BackupSubject[];
};
export type CourseBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  course: { id: string; title: string };
  subject_groups: BackupGroup[];
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const exportCourseBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { courseId: string }) => d)
  .handler(async ({ data, context }): Promise<CourseBackup> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: course, error: cErr } = await supabaseAdmin
      .from("courses")
      .select("id,title")
      .eq("id", data.courseId)
      .single();
    if (cErr || !course) throw new Error(cErr?.message ?? "Course not found");

    const { data: groups } = await supabaseAdmin
      .from("subject_groups")
      .select("id,name,sort_order")
      .eq("course_id", data.courseId)
      .order("sort_order");

    const groupIds = (groups ?? []).map((g: any) => g.id);
    const { data: subjects } = groupIds.length
      ? await supabaseAdmin
          .from("subjects")
          .select("id,group_id,name,sort_order,access_level")
          .in("group_id", groupIds)
          .order("sort_order")
      : { data: [] as any[] };

    const subjectIds = (subjects ?? []).map((s: any) => s.id);
    const questions: any[] = [];
    // Chunk to handle thousands
    for (let i = 0; i < subjectIds.length; i += 200) {
      const chunk = subjectIds.slice(i, i + 200);
      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("id,subject_id,stem,explanation,answer_mode,sort_order")
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
        .select("question_id,label,text,is_correct,sort_order")
        .in("question_id", chunk)
        .order("sort_order");
      if (os) options.push(...os);
    }

    const optsByQ = new Map<string, BackupOption[]>();
    for (const o of options) {
      const arr = optsByQ.get(o.question_id) ?? [];
      arr.push({ label: o.label, text: o.text, is_correct: o.is_correct, sort_order: o.sort_order });
      optsByQ.set(o.question_id, arr);
    }

    const qsBySubject = new Map<string, BackupQuestion[]>();
    for (const q of questions) {
      const arr = qsBySubject.get(q.subject_id) ?? [];
      arr.push({
        stem: q.stem,
        explanation: q.explanation,
        answer_mode: q.answer_mode ?? "single",
        sort_order: q.sort_order,
        options: optsByQ.get(q.id) ?? [],
      });
      qsBySubject.set(q.subject_id, arr);
    }

    const subsByGroup = new Map<string, BackupSubject[]>();
    for (const s of subjects ?? []) {
      const arr = subsByGroup.get(s.group_id) ?? [];
      arr.push({
        name: s.name,
        access_level: s.access_level,
        sort_order: s.sort_order,
        questions: qsBySubject.get(s.id) ?? [],
      });
      subsByGroup.set(s.group_id, arr);
    }

    const backup: CourseBackup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      course: { id: course.id, title: course.title },
      subject_groups: (groups ?? []).map((g: any) => ({
        name: g.name,
        sort_order: g.sort_order,
        subjects: subsByGroup.get(g.id) ?? [],
      })),
    };
    return backup;
  });

function norm(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export const importCourseBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { courseId: string; payload: CourseBackup }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { payload, courseId } = data;
    if (!payload || payload.format !== BACKUP_FORMAT) {
      throw new Error("Invalid backup file");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: course, error: cErr } = await supabaseAdmin
      .from("courses").select("id").eq("id", courseId).single();
    if (cErr || !course) throw new Error("Target course not found");

    let groupsAdded = 0, subjectsAdded = 0, questionsAdded = 0, questionsSkipped = 0;

    // Load existing groups for course
    const { data: existingGroups } = await supabaseAdmin
      .from("subject_groups").select("id,name,sort_order").eq("course_id", courseId);
    const groupByName = new Map<string, { id: string; sort_order: number }>();
    for (const g of existingGroups ?? []) groupByName.set(norm(g.name), g);

    for (const g of payload.subject_groups ?? []) {
      let groupRow = groupByName.get(norm(g.name));
      if (!groupRow) {
        const { data: inserted, error } = await supabaseAdmin
          .from("subject_groups")
          .insert({ course_id: courseId, name: g.name, sort_order: g.sort_order ?? 0 })
          .select("id,sort_order").single();
        if (error || !inserted) throw new Error("group insert: " + (error?.message ?? ""));
        groupRow = { id: inserted.id, sort_order: inserted.sort_order };
        groupByName.set(norm(g.name), groupRow);
        groupsAdded++;
      }

      // Existing subjects for this group
      const { data: existingSubjects } = await supabaseAdmin
        .from("subjects").select("id,name,sort_order,access_level").eq("group_id", groupRow.id);
      const subjectByName = new Map<string, { id: string }>();
      for (const s of existingSubjects ?? []) subjectByName.set(norm(s.name), { id: s.id });

      for (const s of g.subjects ?? []) {
        let subjectRow = subjectByName.get(norm(s.name));
        if (!subjectRow) {
          const { data: inserted, error } = await supabaseAdmin
            .from("subjects")
            .insert({
              group_id: groupRow.id,
              name: s.name,
              sort_order: s.sort_order ?? 0,
              access_level: (s.access_level as any) ?? "paid",
            })
            .select("id").single();
          if (error || !inserted) throw new Error("subject insert: " + (error?.message ?? ""));
          subjectRow = { id: inserted.id };
          subjectByName.set(norm(s.name), subjectRow);
          subjectsAdded++;
        }

        // Existing question stems for this subject (for de-dup)
        const { data: existingQs } = await supabaseAdmin
          .from("questions").select("id,stem").eq("subject_id", subjectRow.id);
        const stems = new Set((existingQs ?? []).map((q: any) => norm(q.stem)));

        for (const q of s.questions ?? []) {
          if (stems.has(norm(q.stem))) { questionsSkipped++; continue; }
          const { data: insertedQ, error: qErr } = await supabaseAdmin
            .from("questions")
            .insert({
              subject_id: subjectRow.id,
              stem: q.stem,
              explanation: q.explanation,
              answer_mode: q.answer_mode ?? "single",
              sort_order: q.sort_order ?? 0,
            })
            .select("id").single();
          if (qErr || !insertedQ) throw new Error("question insert: " + (qErr?.message ?? ""));
          questionsAdded++;
          stems.add(norm(q.stem));

          if (q.options?.length) {
            const rows = q.options.map((o, idx) => ({
              question_id: insertedQ.id,
              label: o.label ?? String.fromCharCode(65 + idx),
              text: o.text,
              is_correct: !!o.is_correct,
              sort_order: o.sort_order ?? idx,
            }));
            const { error: oErr } = await supabaseAdmin.from("question_options").insert(rows);
            if (oErr) throw new Error("options insert: " + oErr.message);
          }
        }
      }
    }

    return { groupsAdded, subjectsAdded, questionsAdded, questionsSkipped };
  });
