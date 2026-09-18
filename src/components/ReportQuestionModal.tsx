import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionReportType } from "@/lib/question-reports.functions";

interface ReportQuestionModalProps {
  questionId: string;
  questionStem?: string;
  source?: string;
  sourceContext?: string;
  className?: string;
  variant?: "button" | "icon";
  /** How often the button pulses to remind users (ms). Default: 5 minutes */
  pulseIntervalMs?: number;
}

const REPORT_REASONS: { type: QuestionReportType; label: string; labelAr: string; desc: string; descAr: string }[] = [
  {
    type: "wrong_answer",
    label: "Wrong answer",
    labelAr: "إجابة خاطئة",
    desc: "The marked correct answer is incorrect or incomplete.",
    descAr: "الإجابة المحددة كصحيحة غير دقيقة أو ناقصة.",
  },
  {
    type: "wrong_question",
    label: "Flawed question or options",
    labelAr: "سؤال أو خيارات معيبة",
    desc: "Missing statements, missing choices, or repeated answers.",
    descAr: "عبارات مفقودة، خيارات ناقصة، أو إجابات مكررة.",
  },
  {
    type: "unclear",
    label: "Unclear or ambiguous",
    labelAr: "غير واضح أو مبهم",
    desc: "The wording is confusing or could have multiple interpretations.",
    descAr: "الصياغة مربكة أو تحتمل أكثر من تفسير.",
  },
  {
    type: "typo",
    label: "Typo or translation error",
    labelAr: "خطأ إملائي أو ترجمة",
    desc: "Spelling, grammar, or translation mistake.",
    descAr: "خطأ في الهجاء أو القواعد أو الترجمة.",
  },
  {
    type: "other",
    label: "Other problem",
    labelAr: "مشكلة أخرى",
    desc: "Any other issue with this question.",
    descAr: "أي مشكلة أخرى في هذا السؤال.",
  },
];

export function ReportQuestionModal({
  questionId,
  questionStem,
  source = "course",
  sourceContext,
  className = "",
  variant = "button",
  pulseIntervalMs = 5 * 60 * 1000, // 5 minutes
}: ReportQuestionModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<QuestionReportType>("wrong_answer");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isArabic, setIsArabic] = useState(false);

  // Pulse/shine animation every pulseIntervalMs — reminds users to report issues
  const [isShining, setIsShining] = useState(false);
  const shineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hasReported) return;

    function triggerShine() {
      setIsShining(true);
      setTimeout(() => setIsShining(false), 4000); // shine for 4 seconds
    }

    shineTimerRef.current = setInterval(triggerShine, pulseIntervalMs);
    return () => {
      if (shineTimerRef.current) clearInterval(shineTimerRef.current);
    };
  }, [hasReported, pulseIntervalMs]);

  async function handleSubmit() {
    if (!questionId?.trim()) {
      toast.error("Cannot submit: question ID is missing.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Get current logged-in user if available
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      const userEmail = user?.email || "";
      const userId = user?.id || null;

      // 2. Prepare structured message and metadata
      const payloadMeta = JSON.stringify({
        questionId: questionId.trim(),
        questionStem: questionStem?.slice(0, 500) || null,
        reportType: selectedType,
        source: source || "course",
        sourceContext: sourceContext || null,
      });

      const messageBody = [
        `[Question Report: ${selectedType}]`,
        questionStem ? `Question: "${questionStem}"` : null,
        comment.trim() ? `Student Comment: ${comment.trim()}` : null,
        sourceContext ? `Course Context: ${sourceContext}` : null,
        `__META__:${payloadMeta}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      // 3. Direct client insert into support_requests (satisfies PostgreSQL RLS policy)
      const { error: insertErr } = await (supabase.from as any)("support_requests").insert({
        name: userEmail ? userEmail.split("@")[0].slice(0, 100) : "Student",
        email: (userEmail || "student@aquaqbank.com").slice(0, 200),
        category: "question_report",
        subject: `[Report: ${selectedType}] Q# ${questionId.slice(0, 20)}`.slice(0, 200),
        message: messageBody.slice(0, 4000),
        status: "new",
        admin_notes: "",
        user_id: userId,
      });

      if (insertErr) {
        console.warn("Direct insert into support_requests failed, trying question_reports:", insertErr);
        // Fallback: try dedicated question_reports table if it exists
        const { error: dedicatedErr } = await (supabase.from as any)("question_reports").insert({
          question_id: questionId,
          question_stem: questionStem?.slice(0, 1000) || null,
          question_source: source || "course",
          source_context: sourceContext || null,
          user_id: userId,
          user_email: userEmail || null,
          report_type: selectedType,
          comment: comment.trim() || null,
          status: "pending",
        });
        if (dedicatedErr) throw new Error(insertErr.message || dedicatedErr.message);
      } else {
        // Also fire-and-forget to question_reports table if it exists
        (supabase.from as any)("question_reports")
          .insert({
            question_id: questionId,
            question_stem: questionStem?.slice(0, 1000) || null,
            question_source: source || "course",
            source_context: sourceContext || null,
            user_id: userId,
            user_email: userEmail || null,
            report_type: selectedType,
            comment: comment.trim() || null,
            status: "pending",
          })
          .then(() => {})
          .catch(() => {});
      }

      // Success!
      setHasReported(true);
      setIsSuccess(true);
      if (shineTimerRef.current) clearInterval(shineTimerRef.current);

      toast.success(
        isArabic
          ? "شكراً لك! تم إرسال التقرير بنجاح وسيتم مراجعته."
          : "Thank you! Your report has been submitted for review.",
      );

      // Auto close after brief confirmation
      setTimeout(() => {
        setOpen(false);
        setIsSuccess(false);
        setComment("");
      }, 1500);
    } catch (err: any) {
      console.error("Report submit error:", err);
      const msg = err?.message || "Failed to submit report. Please try again.";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  const triggerLabel = isArabic ? "الإبلاغ عن خطأ" : "Report error";
  const triggerLabelReported = isArabic ? "تم الإبلاغ" : "Reported";

  return (
    <>
      {/* ── Trigger button ── */}
      <div className="relative inline-flex items-center gap-1.5">
        {variant === "icon" ? (
          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              setIsSuccess(false);
              setOpen(true);
            }}
            title={hasReported ? triggerLabelReported : triggerLabel}
            className={`p-1.5 rounded-lg border transition-all ${
              hasReported
                ? "border-rose-300 bg-rose-50 text-rose-600 dark:bg-rose-950/40"
                : isShining
                  ? "border-rose-400 bg-rose-100/80 dark:bg-rose-950/60 text-rose-600 ring-2 ring-rose-300 ring-offset-1 animate-pulse"
                  : "border-border text-muted-foreground hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50"
            } ${className}`}
          >
            {hasReported ? <Check size={14} /> : <AlertCircle size={14} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              setIsSuccess(false);
              setOpen(true);
            }}
            disabled={hasReported}
            className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-all duration-300 ${
              hasReported
                ? "border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold cursor-default"
                : isShining
                  ? "border-rose-400 bg-rose-100/80 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold ring-2 ring-rose-300 dark:ring-rose-800 ring-offset-1 animate-pulse shadow-sm shadow-rose-300/40"
                  : "border-border text-muted-foreground hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50/40 dark:hover:bg-rose-950/20"
            } ${className}`}
          >
            {hasReported ? (
              <>
                <Check className="w-3.5 h-3.5 text-rose-600" />
                {triggerLabelReported}
              </>
            ) : isShining ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                {triggerLabel}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                {triggerLabel}
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Modal ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-600 font-black">
                <AlertCircle className="w-5 h-5" />
                <DialogTitle>
                  {isArabic ? "الإبلاغ عن مشكلة في السؤال" : "Report Question Issue"}
                </DialogTitle>
              </div>
              {/* Arabic / English toggle */}
              <button
                type="button"
                onClick={() => setIsArabic((v) => !v)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
              >
                {isArabic ? "English" : "عربي"}
              </button>
            </div>
            <DialogDescription>
              {isArabic
                ? "وجدت خطأً أو مشكلة في هذا السؤال؟ أخبرنا وسيراجعه المشرف."
                : "Found a mistake or issue with this question? Tell us and an instructor will review it."}
            </DialogDescription>
          </DialogHeader>

          {isSuccess ? (
            <div className="my-6 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center flex flex-col items-center gap-3 animate-in fade-in zoom-in-95">
              <CheckCircle2 size={42} className="text-emerald-500 animate-bounce" />
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {isArabic ? "تم إرسال التقرير بنجاح!" : "Report Submitted Successfully!"}
              </div>
              <p className="text-xs text-muted-foreground max-w-xs">
                {isArabic
                  ? "شكراً لك على مساعدتنا في تحسين جودة الأسئلة."
                  : "Thank you for helping us maintain top-tier question quality."}
              </p>
            </div>
          ) : (
            <>
              {questionStem && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground max-h-20 overflow-y-auto italic line-clamp-3">
                  "{questionStem}"
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="space-y-2 py-2">
                <span className="text-xs font-bold text-foreground">
                  {isArabic ? "ما هي المشكلة؟" : "What is the problem?"}
                </span>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pe-1">
                  {REPORT_REASONS.map((r) => {
                    const isSelected = selectedType === r.type;
                    return (
                      <label
                        key={r.type}
                        onClick={() => setSelectedType(r.type)}
                        className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 ring-1 ring-rose-500"
                            : "border-border hover:bg-muted/60"
                        }`}
                      >
                        <input
                          type="radio"
                          name="reportReason"
                          value={r.type}
                          checked={isSelected}
                          onChange={() => setSelectedType(r.type)}
                          className="mt-0.5 accent-rose-600"
                        />
                        <div className="flex-1">
                          <div className="text-xs font-bold text-foreground">
                            {isArabic ? r.labelAr : r.label}
                          </div>
                          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                            {isArabic ? r.descAr : r.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  {isArabic ? "تفاصيل إضافية" : "Additional explanation"}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({isArabic ? "اختياري" : "optional"})
                  </span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    isArabic
                      ? "مثال: الإجابة الصحيحة يجب أن تكون B لأن... أو العبارة 3 بها خطأ..."
                      : "e.g. Correct answer should be B because... or Statement 3 has a typo..."
                  }
                  className="w-full text-xs rounded-xl border-2 border-border bg-background p-3 focus:outline-none focus:border-rose-500 text-foreground resize-none"
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted text-muted-foreground"
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {isArabic ? "جاري الإرسال…" : "Submitting…"}
                    </>
                  ) : isArabic ? (
                    "إرسال التقرير"
                  ) : (
                    "Submit Report"
                  )}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
