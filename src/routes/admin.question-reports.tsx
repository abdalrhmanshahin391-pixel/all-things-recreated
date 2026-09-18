import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Inbox,
  Languages,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listQuestionReports,
  updateQuestionReport,
  deleteQuestionReport,
  getQuestionDetails,
  updateQuestionDetails,
  type QuestionReport,
  type QuestionReportStatus,
  type QuestionReportType,
  type QuestionDetails,
  type QuestionOptionItem,
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

const TYPE_META: Record<QuestionReportType, { labelEn: string; labelAr: string; color: string }> = {
  wrong_answer: {
    labelEn: "Wrong answer",
    labelAr: "إجابة خاطئة",
    color: "bg-rose-500/10 text-rose-600 border-rose-200",
  },
  wrong_question: {
    labelEn: "Flawed question",
    labelAr: "سؤال أو خيارات معيبة",
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
  },
  unclear: {
    labelEn: "Unclear wording",
    labelAr: "صياغة غير واضحة",
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
  },
  typo: {
    labelEn: "Typo / Translation",
    labelAr: "خطأ إملائي / ترجمة",
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
  other: {
    labelEn: "Other issue",
    labelAr: "مشكلة أخرى",
    color: "bg-muted text-muted-foreground border-border",
  },
};

function AdminQuestionReports() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isArabic, setIsArabic] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("admin_question_reports_lang") === "ar";
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<QuestionReportStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Go to Question Inspector state
  const [inspectingReport, setInspectingReport] = useState<QuestionReport | null>(null);
  const [inspectingQuestion, setInspectingQuestion] = useState<QuestionDetails | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(false);
  const [isSavingQuestion, setIsSavingQuestion] = useState<boolean>(false);
  const [notFoundWarning, setNotFoundWarning] = useState<boolean>(false);

  // Form edit fields
  const [editStem, setEditStem] = useState<string>("");
  const [editExplanation, setEditExplanation] = useState<string>("");
  const [editOptions, setEditOptions] = useState<QuestionOptionItem[]>([]);

  async function handleOpenInspect(report: QuestionReport) {
    setInspectingReport(report);
    setIsLoadingQuestion(true);
    setNotFoundWarning(false);
    setInspectingQuestion(null);
    try {
      const res = await getQuestionDetails({ data: { questionId: report.question_id } });
      if (res.question) {
        setInspectingQuestion(res.question);
        setEditStem(res.question.stem);
        setEditExplanation(res.question.explanation || "");
        setEditOptions(res.question.options || []);
      } else {
        setNotFoundWarning(true);
      }
    } catch (err: any) {
      console.error("Failed to load question details:", err);
      setNotFoundWarning(true);
    } finally {
      setIsLoadingQuestion(false);
    }
  }

  function handleOptionTextChange(idx: number, newText: string) {
    setEditOptions((prev) =>
      prev.map((opt, i) => (i === idx ? { ...opt, text: newText } : opt))
    );
  }

  function handleOptionCorrectToggle(idx: number) {
    if (!inspectingQuestion) return;
    const isSingle = inspectingQuestion.answer_mode === "single";
    setEditOptions((prev) =>
      prev.map((opt, i) => {
        if (isSingle) {
          return { ...opt, is_correct: i === idx };
        } else {
          return i === idx ? { ...opt, is_correct: !opt.is_correct } : opt;
        }
      })
    );
  }

  async function handleSaveQuestionChanges(markReviewed: boolean) {
    if (!inspectingQuestion || !inspectingReport) return;
    if (!editStem.trim()) {
      toast.error(isArabic ? "لا يمكن ترك نص السؤال فارغاً" : "Question stem cannot be empty");
      return;
    }
    setIsSavingQuestion(true);
    try {
      await updateQuestionDetails({
        data: {
          questionId: inspectingQuestion.id,
          stem: editStem,
          explanation: editExplanation,
          options: editOptions,
          reportIdToResolve: markReviewed ? inspectingReport.id : undefined,
        },
      });
      toast.success(
        markReviewed
          ? (isArabic ? "تم حفظ التعديلات وحل التقرير بنجاح!" : "Question updated & report resolved!")
          : (isArabic ? "تم حفظ تعديلات السؤال في قاعدة البيانات بنجاح!" : "Question updated in database!")
      );
      void queryClient.invalidateQueries({ queryKey: ["question-reports"] });
      if (markReviewed) {
        setInspectingReport(null);
        setInspectingQuestion(null);
      }
    } catch (err: any) {
      console.error("Failed to save question:", err);
      toast.error(err?.message || "Failed to update question");
    } finally {
      setIsSavingQuestion(false);
    }
  }

  function toggleLanguage() {
    setIsArabic((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_question_reports_lang", next ? "ar" : "en");
      }
      return next;
    });
  }

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
        isArabic
          ? newStatus === "reviewed"
            ? "تم تعليم التقرير كمُراجع"
            : newStatus === "dismissed"
              ? "تم استبعاد التقرير"
              : "تمت إعادة فتح التقرير"
          : newStatus === "reviewed"
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
      toast.success(isArabic ? "تم حفظ ملاحظة المشرف" : "Admin note saved");
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
    const confirmMsg = isArabic
      ? "هل أنت متأكد من حذف هذا التقرير؟"
      : "Are you sure you want to delete this report?";
    if (!confirm(confirmMsg)) return;
    setUpdatingId(reportId);
    try {
      await deleteQuestionReport({
        data: { id: reportId },
      });
      toast.success(isArabic ? "تم حذف التقرير" : "Report deleted");
      void queryClient.invalidateQueries({ queryKey: ["question-reports"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to delete report");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground" dir={isArabic ? "rtl" : "ltr"}>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-28 pb-24">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft size={13} className={isArabic ? "rotate-180" : ""} />
              {isArabic ? "العودة إلى لوحة الإدارة" : "Back to Administration"}
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">
                {isArabic ? "تقارير الأسئلة والملاحظات" : "Question Reports"}
              </h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-rose-500/10 border border-rose-200 text-rose-600 dark:text-rose-400 px-3 py-0.5 text-xs font-black">
                  {pendingCount} {isArabic ? "قيد المراجعة" : "pending"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isArabic
                ? "مراجعة وحل المشكلات، الأخطاء الإملائية، أو الإجابات الخاطئة التي أبلغ عنها الطلاب."
                : "Review and resolve errors, typos, or wrong answers flagged by students."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Arabic / English toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3.5 py-2 text-xs font-bold hover:bg-muted text-foreground transition-colors"
            >
              <Languages size={14} className="text-primary" />
              {isArabic ? "English" : "عربي"}
            </button>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3.5 py-2 text-xs font-bold hover:bg-muted"
            >
              <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
              {isArabic ? "تحديث" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Filter bar & search */}
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="inline-flex rounded-xl border-2 border-border bg-card p-1">
            {(
              [
                ["pending", isArabic ? "قيد المراجعة" : "Pending"],
                ["reviewed", isArabic ? "تمت المراجعة" : "Reviewed"],
                ["dismissed", isArabic ? "تم الاستبعاد" : "Dismissed"],
                ["all", isArabic ? "جميع التقارير" : "All Reports"],
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
            <Search
              className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${
                isArabic ? "right-3" : "left-3"
              }`}
              size={14}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isArabic
                  ? "البحث في السؤال، التعليق، البريد…"
                  : "Search question, comment, email…"
              }
              className={`w-full rounded-xl border-2 border-border bg-card py-2 text-xs text-foreground focus:outline-none focus:border-primary ${
                isArabic ? "pr-9 pl-3 text-right" : "pl-9 pr-3"
              }`}
            />
          </div>
        </div>

        {/* Content list */}
        {isLoading ? (
          <div className="mt-12 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <span className="text-sm font-bold">
              {isArabic ? "جاري تحميل التقارير…" : "Loading reports…"}
            </span>
          </div>
        ) : reports.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
            <Inbox className="mx-auto w-10 h-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-bold text-foreground">
              {isArabic ? "لا توجد تقارير" : "No reports found"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              {activeTab === "pending"
                ? isArabic
                  ? "رائع! لا توجد حالياً أي تقارير معلقة بانتظار المراجعة."
                  : "All clear! There are currently no pending question issues reported by students."
                : isArabic
                  ? "لا توجد تقارير تطابق هذا التصنيف."
                  : `No reports matching the '${activeTab}' filter.`}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {reports.map((report) => {
              const typeMeta = TYPE_META[report.report_type] ?? TYPE_META.other;
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
                        {isArabic ? typeMeta.labelAr : typeMeta.labelEn}
                      </span>

                      {report.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-200">
                          <Clock size={11} /> {isArabic ? "معلق" : "Pending"}
                        </span>
                      ) : report.status === "reviewed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-200">
                          <CheckCircle2 size={11} /> {isArabic ? "تمت المراجعة" : "Reviewed"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
                          <XCircle size={11} /> {isArabic ? "مستبعد" : "Dismissed"}
                        </span>
                      )}

                      {report.source_context && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {isArabic ? "في سياق " : "in "}
                          <span className="font-bold text-foreground">{report.source_context}</span>
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
                        {isArabic ? "نص السؤال:" : "Question:"}
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
                        <MessageSquare size={12} />
                        {isArabic ? "ملاحظة الطالب عن المشكلة:" : "Student issue note:"}
                      </span>
                      <p className="mt-1 text-xs text-foreground bg-rose-500/5 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-3 rounded-xl italic">
                        "{report.comment}"
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs italic text-muted-foreground">
                      {isArabic
                        ? "(لم يكتب الطالب تفاصيل إضافية)"
                        : "(No additional comments provided by student)"}
                    </div>
                  )}

                  {/* Admin notes display or editor */}
                  {isEditingNotes ? (
                    <div className="mt-3 p-3 rounded-xl border border-border bg-muted/40 space-y-2">
                      <label className="text-[11px] font-bold text-foreground block">
                        {isArabic ? "ملاحظة المشرف / إجراء الحل:" : "Admin Note / Resolution Notes:"}
                      </label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={
                          isArabic
                            ? "مثال: تم تصحيح الخيار B في بنك الأسئلة، والتحقق من المرجع الطبي..."
                            : "e.g. Corrected choice B in question bank, verified textbook..."
                        }
                        className="w-full text-xs rounded-lg border border-border bg-background p-2 focus:outline-none focus:border-primary text-foreground resize-none"
                        rows={2}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted"
                        >
                          {isArabic ? "إلغاء" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleSaveNote(report.id)}
                          className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                        >
                          {isArabic ? "حفظ الملاحظة" : "Save Note"}
                        </button>
                      </div>
                    </div>
                  ) : report.admin_notes ? (
                    <div className="mt-3 p-2.5 rounded-xl border border-primary/20 bg-primary/5 text-xs flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-primary">
                          {isArabic ? "ملاحظة المشرف: " : "Admin Note: "}
                        </span>
                        <span className="text-foreground">{report.admin_notes}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(report.admin_notes || "");
                          setEditingNotesId(report.id);
                        }}
                        className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                        title={isArabic ? "تعديل الملاحظة" : "Edit note"}
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
                          <CheckCircle2 size={13} />
                          {isArabic ? "تعليم كمُراجع" : "Mark Reviewed"}
                        </button>
                      )}

                      {report.status !== "dismissed" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(report, "dismissed")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                        >
                          <XCircle size={13} />
                          {isArabic ? "استبعاد" : "Dismiss"}
                        </button>
                      )}

                      {report.status !== "pending" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(report, "pending")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          <Clock size={13} />
                          {isArabic ? "إعادة فتح" : "Reopen"}
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
                          <Pencil size={11} />
                          {isArabic ? "إضافة ملاحظة" : "Add Note"}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenInspect(report)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-90 transition-all cursor-pointer"
                        title={isArabic ? "فحص وتعديل السؤال مباشرة" : "Inspect and edit live question in DB"}
                      >
                        <ExternalLink size={12} />
                        {isArabic ? "الانتقال إلى السؤال" : "Go to Question"}
                      </button>

                      {report.question_source === "course" && report.source_context && (
                        <Link
                          to="/admin/courses"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded-lg hover:bg-muted"
                        >
                          <BookOpen size={12} />
                          {isArabic ? "فتح الكورسات" : "Courses"}
                        </Link>
                      )}

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleDelete(report.id)}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title={isArabic ? "حذف التقرير" : "Delete report"}
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

        {/* ── GO TO QUESTION / LIVE DB INSPECTOR & EDITOR MODAL ──────────────── */}
        {inspectingReport && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="relative w-full max-w-3xl my-8 bg-card border-2 border-border rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      {isArabic ? "فاحص ومحرر السؤال المباشر" : "Question Inspector & Live DB Editor"}
                    </h3>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>ID: <code className="font-mono text-xs text-primary">{inspectingReport.question_id}</code></span>
                      {inspectingQuestion?.course_title && (
                        <span>· {inspectingQuestion.course_title} / {inspectingQuestion.subject_name}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setInspectingReport(null);
                    setInspectingQuestion(null);
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="overflow-y-auto space-y-4 pr-1 flex-1">
                {/* Student Report Details Context Banner */}
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 text-xs">
                      <AlertCircle size={14} />
                      {isArabic ? "تقرير الطالب عن المشكلة:" : "Reported Issue Context:"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {inspectingReport.user_email || "Anonymous"} · {new Date(inspectingReport.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {inspectingReport.comment && (
                    <p className="text-foreground italic bg-background/50 p-2.5 rounded-lg border border-border/50">
                      "{inspectingReport.comment}"
                    </p>
                  )}
                  {inspectingReport.source_context && (
                    <div className="text-[10px] text-muted-foreground">
                      {isArabic ? "السياق / الكورس: " : "Context: "}
                      <span className="font-semibold text-foreground">{inspectingReport.source_context}</span>
                    </div>
                  )}
                </div>

                {isLoadingQuestion ? (
                  <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs font-bold">{isArabic ? "جاري جلب السؤال من قاعدة البيانات…" : "Fetching question from database…"}</span>
                  </div>
                ) : notFoundWarning ? (
                  <div className="p-5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-center space-y-3">
                    <AlertCircle size={28} className="mx-auto text-amber-500" />
                    <div className="text-sm font-bold text-foreground">
                      {isArabic ? "لم يتم العثور على السؤال في قاعدة البيانات" : "Question Record Not Found in DB"}
                    </div>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      {isArabic
                        ? `لم يُعثر على سجل للسؤال برمز (${inspectingReport.question_id}) في جدول الأسئلة. قد يكون السؤال من دفعة تجريبية غير مثبتة أو تم حذفه مسبقاً.`
                        : `Question ID (${inspectingReport.question_id}) was not found in the live 'questions' table. It may have originated from an uncommitted batch session or was previously deleted.`}
                    </p>
                    {inspectingReport.question_stem && (
                      <div className="text-left text-xs bg-card p-3 rounded-lg border border-border text-foreground">
                        <div className="font-bold text-muted-foreground text-[10px] mb-1">STEM FROM REPORT:</div>
                        {inspectingReport.question_stem}
                      </div>
                    )}
                    <div className="pt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(inspectingReport, "reviewed")}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                      >
                        <CheckCircle2 size={13} className="inline mr-1" />
                        {isArabic ? "تعليم التقرير كمُراجع" : "Mark Report Reviewed"}
                      </button>
                    </div>
                  </div>
                ) : inspectingQuestion ? (
                  <div className="space-y-4">
                    {/* Stem Editor */}
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        {isArabic ? "نص السؤال (Stem):" : "Question Stem:"}
                      </label>
                      <textarea
                        rows={4}
                        value={editStem}
                        onChange={(e) => setEditStem(e.target.value)}
                        className="w-full text-xs rounded-xl border-2 border-border bg-background p-3 focus:outline-none focus:border-primary text-foreground leading-relaxed"
                        placeholder="Question text..."
                      />
                    </div>

                    {/* Options Editor */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-foreground">
                          {isArabic ? "خيارات الإجابة (حدد الإجابة الصحيحة):" : "Answer Choices (Mark Correct Option):"}
                        </label>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Mode: {inspectingQuestion.answer_mode}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {editOptions.map((opt, idx) => (
                          <div
                            key={opt.id || idx}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                              opt.is_correct
                                ? "border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/30"
                                : "border-border bg-background"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleOptionCorrectToggle(idx)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 transition-colors cursor-pointer ${
                                opt.is_correct
                                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                              title={opt.is_correct ? "Correct Answer" : "Click to mark as correct"}
                            >
                              {opt.label || String.fromCharCode(65 + idx)}
                            </button>

                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                              className="flex-1 bg-transparent text-xs text-foreground focus:outline-none px-1"
                              placeholder={`Option ${opt.label}...`}
                            />

                            <button
                              type="button"
                              onClick={() => handleOptionCorrectToggle(idx)}
                              className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 cursor-pointer ${
                                opt.is_correct
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {opt.is_correct ? "✓ Correct" : "Mark"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Explanation Editor */}
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        {isArabic ? "التفسير والشرح السريري:" : "Clinical Explanation / Justification:"}
                      </label>
                      <textarea
                        rows={3}
                        value={editExplanation}
                        onChange={(e) => setEditExplanation(e.target.value)}
                        className="w-full text-xs rounded-xl border-2 border-border bg-background p-3 focus:outline-none focus:border-primary text-foreground leading-relaxed"
                        placeholder="Explanation..."
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 mt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInspectingReport(null);
                    setInspectingQuestion(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                >
                  {isArabic ? "إغلاق" : "Close"}
                </button>

                {inspectingQuestion && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingQuestion}
                      onClick={() => handleSaveQuestionChanges(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-primary text-primary hover:bg-primary/10 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Save size={13} />
                      {isSavingQuestion
                        ? (isArabic ? "جاري الحفظ…" : "Saving…")
                        : (isArabic ? "حفظ التعديلات فقط" : "Save Changes to DB")}
                    </button>

                    <button
                      type="button"
                      disabled={isSavingQuestion}
                      onClick={() => handleSaveQuestionChanges(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      {isSavingQuestion
                        ? (isArabic ? "جاري الحفظ…" : "Saving…")
                        : (isArabic ? "حفظ وحل التقرير" : "Save & Mark Resolved")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
