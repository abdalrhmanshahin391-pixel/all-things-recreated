import { useState } from "react";
import { AlertCircle, Check, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  submitQuestionReport,
  type QuestionReportType,
} from "@/lib/question-reports.functions";

interface ReportQuestionModalProps {
  questionId: string;
  questionStem?: string;
  source?: string;
  sourceContext?: string;
  className?: string;
  variant?: "button" | "icon";
}

const REPORT_REASONS: { type: QuestionReportType; label: string; desc: string }[] = [
  {
    type: "wrong_answer",
    label: "Wrong answer",
    desc: "The marked correct answer is incorrect or incomplete.",
  },
  {
    type: "wrong_question",
    label: "Flawed question or options",
    desc: "Missing statements, missing choices, or repeated answers.",
  },
  {
    type: "unclear",
    label: "Unclear or ambiguous",
    desc: "The wording is confusing or could have multiple interpretations.",
  },
  {
    type: "typo",
    label: "Typo or translation error",
    desc: "Spelling, grammar, or translation mistake.",
  },
  {
    type: "other",
    label: "Other problem",
    desc: "Any other issue with this question.",
  },
];

export function ReportQuestionModal({
  questionId,
  questionStem,
  source = "course",
  sourceContext,
  className = "",
  variant = "button",
}: ReportQuestionModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<QuestionReportType>("wrong_answer");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReported, setHasReported] = useState(false);

  async function handleSubmit() {
    if (!questionId) return;
    setIsSubmitting(true);
    try {
      await submitQuestionReport({
        data: {
          questionId,
          questionStem,
          questionSource: source,
          sourceContext,
          reportType: selectedType,
          comment: comment.trim() || undefined,
        },
      });
      setHasReported(true);
      toast.success("Thank you! Your report was submitted for review.");
      setOpen(false);
    } catch (err: any) {
      console.error("Report submit error:", err);
      toast.error(err?.message || "Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={hasReported ? "Report submitted" : "Report a problem with this question"}
          className={`p-1.5 rounded-lg border transition-all ${
            hasReported
              ? "border-rose-300 bg-rose-50 text-rose-600 dark:bg-rose-950/40"
              : "border-border text-muted-foreground hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50"
          } ${className}`}
        >
          {hasReported ? <Check size={14} /> : <AlertCircle size={14} />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={hasReported}
          className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-all duration-200 ${
            hasReported
              ? "border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold cursor-default"
              : "border-border text-muted-foreground hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50/40 dark:hover:bg-rose-950/20"
          } ${className}`}
        >
          {hasReported ? (
            <>
              <Check className="w-3.5 h-3.5 text-rose-600" />
              Reported
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              Report error
            </>
          )}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600 font-black">
              <AlertCircle className="w-5 h-5" />
              <DialogTitle>Report Question Issue</DialogTitle>
            </div>
            <DialogDescription>
              Found a mistake or issue with this question? Tell us and an instructor will review it.
            </DialogDescription>
          </DialogHeader>

          {questionStem && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground max-h-20 overflow-y-auto italic line-clamp-3">
              "{questionStem}"
            </div>
          )}

          <div className="space-y-2 py-2">
            <span className="text-xs font-bold text-foreground">What is the problem?</span>
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
                      <div className="text-xs font-bold text-foreground">{r.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {r.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">
              Additional explanation <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Correct answer should be B because... or Statement 3 has a typo..."
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
              Cancel
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
                  Submitting…
                </>
              ) : (
                "Submit Report"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
