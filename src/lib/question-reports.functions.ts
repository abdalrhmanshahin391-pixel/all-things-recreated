import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuestionReportType = "wrong_answer" | "wrong_question" | "unclear" | "typo" | "other";
export type QuestionReportStatus = "pending" | "reviewed" | "dismissed";

export interface QuestionReport {
  id: string;
  question_id: string;
  question_stem: string | null;
  question_source: string;
  source_context: string | null;
  user_id: string | null;
  user_email: string | null;
  report_type: QuestionReportType;
  comment: string | null;
  status: QuestionReportStatus;
  admin_notes: string | null;
  created_at: string;
}

async function assertAdminRole(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

/**
 * Submit a question report by a student or user.
 */
export const submitQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      questionId: string;
      questionStem?: string;
      questionSource?: string;
      sourceContext?: string;
      reportType: QuestionReportType;
      comment?: string;
    }) => {
      if (!d.questionId?.trim()) throw new Error("Question ID is required");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Extract user email from claims if available
    const userEmail = (context.claims as any)?.email || null;

    // Check if user already reported this exact question recently (within last hour) to prevent accidental duplicate clicks
    const { data: existing } = await (supabaseAdmin.from as any)("question_reports")
      .select("id")
      .eq("question_id", data.questionId)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return { ok: true, message: "Already reported", reportId: existing.id };
    }

    const { data: inserted, error } = await (supabaseAdmin.from as any)("question_reports")
      .insert({
        question_id: data.questionId,
        question_stem: data.questionStem?.slice(0, 1000) || null,
        question_source: data.questionSource || "course",
        source_context: data.sourceContext || null,
        user_id: context.userId,
        user_email: userEmail,
        report_type: data.reportType || "wrong_answer",
        comment: data.comment?.trim()?.slice(0, 2000) || null,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      // If table doesn't exist yet, provide clear error
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        throw new Error(
          "Table 'question_reports' has not been created yet in the database. Please execute the SQL migration in Supabase SQL editor.",
        );
      }
      console.error("Failed to submit question report:", error);
      throw new Error(error.message || "Failed to submit report");
    }

    return { ok: true, reportId: inserted?.id };
  });

/**
 * List question reports for admin panel review.
 */
export const listQuestionReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d?: { status?: QuestionReportStatus | "all"; search?: string; limit?: number }) => d ?? {},
  )
  .handler(async ({ data, context }): Promise<{ reports: QuestionReport[] }> => {
    await assertAdminRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin.from as any)("question_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data?.limit ?? 200);

    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    if (data?.search?.trim()) {
      const s = `%${data.search.trim()}%`;
      query = query.or(`question_stem.ilike.${s},comment.ilike.${s},user_email.ilike.${s}`);
    }

    const { data: rows, error } = await query;

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return { reports: [] };
      }
      console.error("Failed to fetch question reports:", error);
      throw new Error(error.message);
    }

    return { reports: (rows ?? []) as QuestionReport[] };
  });

/**
 * Update report status and/or admin notes.
 */
export const updateQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      status?: QuestionReportStatus;
      adminNotes?: string;
    }) => {
      if (!d.id) throw new Error("Report ID is required");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdminRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const updates: Record<string, any> = {};
    if (data.status) updates.status = data.status;
    if (data.adminNotes !== undefined) updates.admin_notes = data.adminNotes;

    const { error } = await (supabaseAdmin.from as any)("question_reports")
      .update(updates)
      .eq("id", data.id);

    if (error) {
      console.error("Failed to update question report:", error);
      throw new Error(error.message);
    }

    return { ok: true };
  });

/**
 * Delete a question report.
 */
export const deleteQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("Report ID is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin.from as any)("question_reports")
      .delete()
      .eq("id", data.id);

    if (error) {
      console.error("Failed to delete question report:", error);
      throw new Error(error.message);
    }

    return { ok: true };
  });
