import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listQuestionReports,
  updateQuestionReport,
  deleteQuestionReport,
  type QuestionReport,
  type QuestionReportStatus,
  type QuestionReportType,
} from "@/lib/question-reports.functions";

export const Route = createFileRoute("/admin/question-reports")({
  head: () => ({
    meta: [
      { title: "Question Reports — Admin" },
      { name: "description", content: "Review and resolve questions reported by students." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminQuestionReports,
});

const TYPE_LABELS: Record<QuestionReportType, { label: string; color: string }> = {
  wrong_answer: { label: "Wrong answer", color: "bg-rose-500/10 text-rose-600 border-rose-200" },
  wrong_question: { label: "Flawed question", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  unclear: { label: "Unclear wording", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  typo: { label: "Typo / Translation", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  other: { label: "Other issue", color: "bg-muted text-muted-foreground border-border" },
};

function AdminQuestionReports() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<QuestionReportStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) guardRedirect(navigate);
  }, [authLoading, isAdmin, navigate]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["question-reports", activeTab, search],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await listQuestionReports({
        data: {
          status: activeTab,
          search: search.trim() || undefined,
        },
      });
      return res.reports;
    },
  });

  const reports = data ?? [];

  // Count pending reports
  const pendingCount =
    activeTab === "pending"
      ? reports.length
      : reports.filter((r) => r.status === "pending").length;

  async function handleStatusChange(report: QuestionReport, newStatus: QuestionReportStatus) {
    setUpdatingId(report.id);
    try {
      await updateQuestionReport({
        data: {
          id: report.id,
          status: newStatus,
        },
      });
      toast.success(
        newStatus === "reviewed"
          ? "Report marked as reviewed"
          : newStatus === "dismissed"
            ? "Report dismissed"
            : "Report reopened",
      );
      void queryClient.invalidateQueries({ queryKey: ["question-reports"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSaveNote(reportId: string) {
    setUpdatingId(reportId);
    try {
      await updateQuestionReport({
        data: {
          id: reportId,
          adminNotes: noteDraft.trim() || undefined,
        },
      });
      toast.success("Admin note saved");
      setEditingNotesId(null);
      void queryClient.invalidateQueries({ queryKey: ["question-reports"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to save note");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Are you sure you want to delete this report?")) return;
    setUpdatingId(reportId);
    try {
      await deleteQuestionReport({
        data: { id: reportId },
      });
      toast.success("Report deleted");
      void queryClient.invalidateQueries({ queryKey: ["question-reports"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to delete report");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-28 pb-24">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft size={13} /> Back to Administration
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">Question Reports</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-rose-500/10 border border-rose-200 text-rose-600 dark:text-rose-400 px-3 py-0.5 text-xs font-black">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Review and resolve errors, typos, or wrong answers flagged by students.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3.5 py-2 text-xs font-bold hover:bg-muted"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Filter bar & search */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="inline-flex rounded-xl border-2 border-border bg-card p-1">
            {(
              [
                ["pending", "Pending"],
                ["reviewed", "Reviewed"],
                ["dismissed", "Dismissed"],
                ["all", "All Reports"],
              ] as const
            ).map(([key, label]) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question, comment, email…"
              className="w-full rounded-xl border-2 border-border bg-card pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Content list */}
        {isLoading ? (
          <div className="mt-12 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <span className="text-sm font-bold">Loading reports…</span>
          </div>
        ) : reports.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
            <Inbox className="mx-auto w-10 h-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-bold text-foreground">No reports found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              {activeTab === "pending"
                ? "All clear! There are currently no pending question issues reported by students."
                : `No reports matching the '${activeTab}' filter.`}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {reports.map((report) => {
              const typeMeta = TYPE_LABELS[report.report_type] ?? TYPE_LABELS.other;
              const isUpdating = updatingId === report.id;
              const isEditingNotes = editingNotesId === report.id;

              return (
                <div
                  key={report.id}
                  className="rounded-2xl border-2 border-border bg-card p-5 transition-shadow hover:shadow-sm"
                >
                  {/* Card top bar */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${typeMeta.color}`}
                      >
                        {typeMeta.label}
                      </span>

                      {report.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-200">
                          <Clock size={11} /> Pending
                        </span>
                      ) : report.status === "reviewed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-200">
                          <CheckCircle2 size={11} /> Reviewed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
                          <XCircle size={11} /> Dismissed
                        </span>
                      )}

                      {report.source_context && (
                        <span className="text-xs text-muted-foreground font-medium">
                          in <span className="font-bold text-foreground">{report.source_context}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {report.user_email && (
                        <span className="inline-flex items-center gap-1" title={report.user_email}>
                          <Mail size={12} /> {report.user_email}
                        </span>
                      )}
                      <span>{new Date(report.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Question Stem */}
                  {report.question_stem && (
                    <div className="mt-3">
                      <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                        Question:
                      </span>
                      <p className="mt-1 text-sm font-medium text-foreground bg-muted/30 p-3 rounded-xl border border-border/60">
                        {report.question_stem}
                      </p>
                    </div>
                  )}

                  {/* Student Comment */}
                  {report.comment ? (
                    <div className="mt-3">
                      <span className="text-[11px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <MessageSquare size={12} /> Student issue note:
                      </span>
                      <p className="mt-1 text-xs text-foreground bg-rose-500/5 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-3 rounded-xl italic">
                        "{report.comment}"
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs italic text-muted-foreground">
                      (No additional comments provided by student)
                    </div>
                  )}

                  {/* Admin notes display or editor */}
                  {isEditingNotes ? (
                    <div className="mt-3 p-3 rounded-xl border border-border bg-muted/40 space-y-2">
                      <label className="text-[11px] font-bold text-foreground block">
                        Admin Note / Resolution Notes:
                      </label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="e.g. Corrected choice B in question bank, verified textbook..."
                        className="w-full text-xs rounded-lg border border-border bg-background p-2 focus:outline-none focus:border-primary text-foreground resize-none"
                        rows={2}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleSaveNote(report.id)}
                          className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  ) : report.admin_notes ? (
                    <div className="mt-3 p-2.5 rounded-xl border border-primary/20 bg-primary/5 text-xs flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-primary">Admin Note: </span>
                        <span className="text-foreground">{report.admin_notes}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(report.admin_notes || "");
                          setEditingNotesId(report.id);
                        }}
                        className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                        title="Edit note"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  ) : null}

                  {/* Actions bar */}
                  <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {report.status !== "reviewed" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(report, "reviewed")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} /> Mark Reviewed
                        </button>
                      )}

                      {report.status !== "dismissed" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(report, "dismissed")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                        >
                          <XCircle size={13} /> Dismiss
                        </button>
                      )}

                      {report.status !== "pending" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(report, "pending")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          <Clock size={13} /> Reopen
                        </button>
                      )}

                      {!report.admin_notes && !isEditingNotes && (
                        <button
                          type="button"
                          onClick={() => {
                            setNoteDraft("");
                            setEditingNotesId(report.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Pencil size={11} /> Add Note
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {report.question_source === "course" && report.source_context && (
                        <Link
                          to="/admin/courses"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded-lg hover:bg-muted"
                        >
                          <ExternalLink size={12} /> Go to Courses
                        </Link>
                      )}

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleDelete(report.id)}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
