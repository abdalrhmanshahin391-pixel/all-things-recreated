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
  /** Storage backend flag ('question_reports' table or 'support_requests' bridge) */
  table_source?: "question_reports" | "support_requests";
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
 * Uses context.supabase with authenticated user token.
 * If dedicated 'question_reports' table has not been created yet in Postgres,
 * automatically falls back to 'support_requests' with category='question_report'
 * so that student reports are NEVER lost or blocked.
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
    const sb = context.supabase;
    const userEmail = (context.claims as any)?.email || null;

    // 1. Try dedicated question_reports table
    try {
      const { data: inserted, error: insertErr } = await (sb.from as any)("question_reports")
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

      if (!insertErr && inserted?.id) {
        return { ok: true, reportId: inserted.id };
      }
    } catch (e) {
      // Fall through to support_requests bridge
    }

    // 2. Fallback to support_requests table (always exists in Supabase schema)
    try {
      const payloadMeta = JSON.stringify({
        questionId: data.questionId,
        questionStem: data.questionStem?.slice(0, 500) || null,
        reportType: data.reportType,
        source: data.questionSource || "course",
        sourceContext: data.sourceContext || null,
      });

      const messageBody = [
        `[Question Report: ${data.reportType}]`,
        data.questionStem ? `Question: "${data.questionStem}"` : null,
        data.comment ? `Student Comment: ${data.comment}` : null,
        data.sourceContext ? `Course Context: ${data.sourceContext}` : null,
        `__META__:${payloadMeta}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const { data: ticket, error: ticketErr } = await (sb.from as any)("support_requests")
        .insert({
          user_id: context.userId,
          name: userEmail ? userEmail.split("@")[0] : "Student",
          email: userEmail || "student@aquaqbank.com",
          category: "question_report",
          subject: `Question Report: ${data.reportType} (Q# ${data.questionId.slice(0, 18)})`,
          message: messageBody,
          status: "pending",
        })
        .select("id")
        .single();

      if (ticketErr) {
        console.error("Support requests fallback error:", ticketErr);
        throw new Error(ticketErr.message || "Failed to submit report");
      }

      return { ok: true, reportId: ticket?.id };
    } catch (err: any) {
      console.error("Failed to submit question report:", err);
      throw new Error(err?.message || "Failed to submit question report");
    }
  });

/**
 * List question reports for admin panel review.
 * Aggregates reports from question_reports and support_requests (category='question_report').
 */
export const listQuestionReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d?: { status?: QuestionReportStatus | "all"; search?: string; limit?: number }) => d ?? {},
  )
  .handler(async ({ data, context }): Promise<{ reports: QuestionReport[] }> => {
    await assertAdminRole(context);
    const sb = context.supabase;
    const allReports: QuestionReport[] = [];

    // 1. Check dedicated question_reports table
    try {
      let q = (sb.from as any)("question_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data?.limit ?? 200);

      if (data?.status && data.status !== "all") {
        q = q.eq("status", data.status);
      }
      if (data?.search?.trim()) {
        const s = `%${data.search.trim()}%`;
        q = q.or(`question_stem.ilike.${s},comment.ilike.${s},user_email.ilike.${s}`);
      }

      const { data: rows } = await q;
      if (Array.isArray(rows)) {
        for (const r of rows) {
          allReports.push({
            ...r,
            table_source: "question_reports",
          });
        }
      }
    } catch {
      // Table doesn't exist yet, proceed to support_requests
    }

    // 2. Also retrieve from support_requests where category='question_report'
    try {
      let q2 = (sb.from as any)("support_requests")
        .select("*")
        .eq("category", "question_report")
        .order("created_at", { ascending: false })
        .limit(data?.limit ?? 200);

      if (data?.status && data.status !== "all") {
        q2 = q2.eq("status", data.status);
      }
      if (data?.search?.trim()) {
        const s = `%${data.search.trim()}%`;
        q2 = q2.or(`message.ilike.${s},email.ilike.${s},subject.ilike.${s}`);
      }

      const { data: tickets } = await q2;
      if (Array.isArray(tickets)) {
        for (const t of tickets) {
          // Parse metadata embedded in message
          let qId = "unknown";
          let stem: string | null = null;
          let rType: QuestionReportType = "wrong_answer";
          let comment: string | null = null;
          let sContext: string | null = null;

          const metaMatch = t.message?.match(/__META__:(.+)$/s);
          if (metaMatch) {
            try {
              const meta = JSON.parse(metaMatch[1].trim());
              qId = meta.questionId || qId;
              stem = meta.questionStem || null;
              rType = meta.reportType || rType;
              sContext = meta.sourceContext || null;
            } catch {}
          }

          // Extract comment
          const commentMatch = t.message?.match(/Student Comment:\s*(.+?)(?:\n\n|\n__META__|$)/s);
          if (commentMatch) {
            comment = commentMatch[1].trim();
          } else if (!metaMatch) {
            comment = t.message;
          }

          // Map ticket status (open -> pending, resolved -> reviewed, closed -> dismissed)
          const mappedStatus: QuestionReportStatus =
            t.status === "resolved" || t.status === "reviewed"
              ? "reviewed"
              : t.status === "closed" || t.status === "dismissed"
                ? "dismissed"
                : "pending";

          allReports.push({
            id: t.id,
            question_id: qId,
            question_stem: stem,
            question_source: "course",
            source_context: sContext,
            user_id: t.user_id,
            user_email: t.email,
            report_type: rType,
            comment,
            status: mappedStatus,
            admin_notes: t.admin_notes || null,
            created_at: t.created_at,
            table_source: "support_requests",
          });
        }
      }
    } catch (e) {
      console.warn("Error querying support_requests for question reports:", e);
    }

    // Sort combined reports by created_at desc
    allReports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { reports: allReports.slice(0, data?.limit ?? 200) };
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
    const sb = context.supabase;

    const updates: Record<string, any> = {};
    if (data.status) updates.status = data.status;
    if (data.adminNotes !== undefined) updates.admin_notes = data.adminNotes;

    // Try question_reports first
    try {
      const { error } = await (sb.from as any)("question_reports").update(updates).eq("id", data.id);
      if (!error) return { ok: true };
    } catch {}

    // Fallback to support_requests
    try {
      const ticketStatus =
        data.status === "reviewed" ? "resolved" : data.status === "dismissed" ? "closed" : "open";
      await (sb.from as any)("support_requests")
        .update({
          status: ticketStatus,
          admin_notes: data.adminNotes ?? undefined,
        })
        .eq("id", data.id);
    } catch (err: any) {
      console.error("Failed to update report in support_requests:", err);
      throw new Error(err?.message || "Failed to update report");
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
    const sb = context.supabase;

    // Try question_reports
    try {
      await (sb.from as any)("question_reports").delete().eq("id", data.id);
    } catch {}

    // Try support_requests
    try {
      await (sb.from as any)("support_requests").delete().eq("id", data.id);
    } catch {}

    return { ok: true };
  });
