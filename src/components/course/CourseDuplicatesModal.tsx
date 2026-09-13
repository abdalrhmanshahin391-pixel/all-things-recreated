import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  findCourseDuplicateQuestions,
  deleteCourseDuplicateQuestion,
  type CourseDuplicateReport,
  type DuplicateCluster,
} from "@/lib/course-duplicates.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Files,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Search,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export function CourseDuplicatesModal({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [report, setReport] = useState<CourseDuplicateReport | null>(null);
  const [query, setQuery] = useState("");

  const scanFn = useServerFn(findCourseDuplicateQuestions);
  const deleteFn = useServerFn(deleteCourseDuplicateQuestion);

  async function runScan() {
    setLoading(true);
    try {
      const res = await scanFn({ data: { courseId } });
      setReport(res);
    } catch (e: any) {
      toast.error(e?.message || "Failed to scan for duplicate questions");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !report && !loading) {
      void runScan();
    }
  }

  async function handleDelete(clusterId: string, questionId: string, stem: string) {
    const preview = stem.slice(0, 60) + (stem.length > 60 ? "..." : "");
    if (!window.confirm(`Are you sure you want to permanently delete this duplicate question?\n\n"${preview}"`)) {
      return;
    }

    setDeletingId(questionId);
    try {
      await deleteFn({ data: { questionId } });
      toast.success("Duplicate question deleted");

      // Update local report state
      setReport((prev) => {
        if (!prev) return null;
        const updatedClusters = prev.clusters
          .map((c) => {
            if (c.clusterId !== clusterId) return c;
            return {
              ...c,
              questions: c.questions.filter((q) => q.id !== questionId),
            };
          })
          // Keep clusters that still have > 1 questions, or keep them to show resolved
          .filter((c) => c.questions.length > 1);

        const redundantQuestionsCount = updatedClusters.reduce(
          (sum, c) => sum + (c.questions.length - 1),
          0,
        );

        return {
          ...prev,
          totalQuestions: prev.totalQuestions - 1,
          duplicateClustersCount: updatedClusters.length,
          redundantQuestionsCount,
          clusters: updatedClusters,
        };
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete question");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredClusters = (report?.clusters ?? []).filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    if (c.canonicalStem.toLowerCase().includes(q)) return true;
    return c.questions.some(
      (item) =>
        item.subject_name.toLowerCase().includes(q) ||
        item.group_name.toLowerCase().includes(q),
    );
  });

  const btnStyle =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-white/90 border border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-white shadow-sm disabled:opacity-50 transition-colors";

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className={btnStyle}
        title="Check for duplicate questions across all subjects in this course"
      >
        <Files className="w-3.5 h-3.5" />
        Check duplicates
      </button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b border-border">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Files className="w-5 h-5 text-indigo-600" />
                  Course Duplicate Questions Checker
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Scanning all subjects & groups in <span className="font-semibold text-foreground">"{courseTitle}"</span> for identical or near-duplicate questions.
                </DialogDescription>
              </div>

              <button
                type="button"
                onClick={runScan}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Rescan
              </button>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto pt-4 space-y-4 pr-1">
            {loading && (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" />
                <p className="text-sm font-semibold text-foreground">
                  Scanning course questions across all subjects...
                </p>
                <p className="text-xs text-muted-foreground">
                  Analyzing stems, comparing text similarity, and grouping duplicates.
                </p>
              </div>
            )}

            {!loading && report && (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-xl border border-border bg-card">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Total Questions
                    </p>
                    <p className="text-lg font-bold mt-0.5">{report.totalQuestions}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-card">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Subjects Scanned
                    </p>
                    <p className="text-lg font-bold mt-0.5">{report.totalSubjects}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-card">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Duplicate Sets
                    </p>
                    <p className={`text-lg font-bold mt-0.5 ${report.duplicateClustersCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {report.duplicateClustersCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-card">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Redundant Copies
                    </p>
                    <p className={`text-lg font-bold mt-0.5 ${report.redundantQuestionsCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {report.redundantQuestionsCount}
                    </p>
                  </div>
                </div>

                {/* Clean state */}
                {report.duplicateClustersCount === 0 && (
                  <div className="py-12 px-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                    <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                      No Duplicate Questions Found!
                    </p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      All {report.totalQuestions} questions across {report.totalSubjects} subjects in this course are unique.
                    </p>
                  </div>
                )}

                {/* Duplicate clusters found */}
                {report.duplicateClustersCount > 0 && (
                  <div className="space-y-4">
                    {/* Filter bar */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter by question stem or subject name..."
                        className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Cluster cards */}
                    <div className="space-y-4">
                      {filteredClusters.map((cluster, cIndex) => (
                        <div
                          key={cluster.clusterId}
                          className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                              <span className="grid size-6 place-items-center rounded-md bg-amber-500/15 text-amber-700 text-xs font-black">
                                #{cIndex + 1}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                cluster.isExact
                                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              }`}>
                                {cluster.isExact ? "Exact Duplicate" : "Near Duplicate"}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground">
                              {cluster.questions.length} copies found
                            </span>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            {cluster.questions.map((q, qIndex) => (
                              <div
                                key={q.id}
                                className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2.5 flex flex-col justify-between"
                              >
                                <div>
                                  {/* Subject & Group Tag */}
                                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5 text-xs">
                                    <span className="inline-flex items-center gap-1 font-bold text-foreground">
                                      <span className="text-muted-foreground">{q.group_name} ·</span>
                                      {q.subject_name}
                                    </span>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      ID: {q.id.slice(0, 8)}
                                    </span>
                                  </div>

                                  {/* Stem */}
                                  <p className="text-xs font-medium text-foreground line-clamp-3">
                                    {q.stem}
                                  </p>

                                  {/* Options preview */}
                                  {q.options && q.options.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                                      {q.options.slice(0, 4).map((opt) => (
                                        <div
                                          key={opt.label}
                                          className={`flex items-start gap-1.5 text-[11px] ${
                                            opt.is_correct
                                              ? "font-bold text-emerald-700 dark:text-emerald-400"
                                              : "text-muted-foreground"
                                          }`}
                                        >
                                          <span className="w-3.5 shrink-0 font-mono">
                                            {opt.label}.
                                          </span>
                                          <span className="line-clamp-1">{opt.text}</span>
                                          {opt.is_correct && (
                                            <Check className="w-3 h-3 text-emerald-600 shrink-0 ml-auto" />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Explanation hint */}
                                  {q.explanation && (
                                    <p className="mt-1.5 text-[10px] text-muted-foreground line-clamp-1 italic">
                                      Has explanation ({q.explanation.length} chars)
                                    </p>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-muted-foreground">
                                    {qIndex === 0 ? "Copy A (Original)" : `Copy ${String.fromCharCode(65 + qIndex)}`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(cluster.clusterId, q.id, q.stem)}
                                    disabled={deletingId === q.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
                                    title="Delete this copy"
                                  >
                                    {deletingId === q.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                    Delete copy
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {filteredClusters.length === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          No duplicates match your search filter.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
