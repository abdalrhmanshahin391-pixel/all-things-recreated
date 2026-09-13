import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  extractQuestionnaireTopics,
  classifyCourseQuestions,
  applyCourseQuestionSort,
  type SortedQuestionCategory,
} from "@/lib/course-sorter.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Upload,
  FileText,
  Loader2,
  FolderPlus,
  FolderTree,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RefreshCw,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

function blobToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type DestinationChoice = {
  action: "create_new_subject" | "move_to_existing" | "skip";
  targetSubjectId?: string;
  newSubjectName: string;
  targetGroupId?: string;
  newGroupName?: string;
};

export function CourseSortQuestionsModal({
  courseId,
  courseTitle,
  onSorted,
}: {
  courseId: string;
  courseTitle: string;
  onSorted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "review" | "success">("input");

  // Input states
  const [mode, setMode] = useState<"pdf" | "text" | "auto">("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [topicsText, setTopicsText] = useState("");
  const [sortingInstructions, setSortingInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");

  // Results & assignments
  const [courseGroups, setCourseGroups] = useState<any[]>([]);
  const [courseSubjects, setCourseSubjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<SortedQuestionCategory[]>([]);
  const [destinations, setDestinations] = useState<Record<string, DestinationChoice>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Success stats
  const [successStats, setSuccessStats] = useState<{ moved: number; created: number } | null>(null);

  const extractTopicsFn = useServerFn(extractQuestionnaireTopics);
  const classifyQuestionsFn = useServerFn(classifyCourseQuestions);
  const applySortFn = useServerFn(applyCourseQuestionSort);

  async function handleAnalyzeAndSort() {
    setBusy(true);
    try {
      let pdfBase64: string | undefined;
      if (mode === "pdf") {
        if (!pdfFile) {
          toast.error("Please upload a questionnaire PDF first.");
          return;
        }
        if (pdfFile.size > 20_000_000) {
          toast.error("PDF file size must be 20 MB or smaller.");
          return;
        }
        pdfBase64 = await blobToBase64(pdfFile);
      } else if (mode === "text") {
        if (!topicsText.trim()) {
          toast.error("Please paste your questionnaire topics or lecture titles.");
          return;
        }
      }

      setBusyMessage("Reading questionnaire and extracting topics...");
      const topicRes = await extractTopicsFn({
        data: {
          courseId,
          pdfBase64,
          text: mode === "text" ? topicsText : undefined,
          autoDetectFromQuestions: mode === "auto",
        },
      });

      if (!topicRes.topics || topicRes.topics.length < 2) {
        throw new Error("Could not extract topics. Please paste the topics text directly.");
      }

      setBusyMessage(`Classifying course questions into ${topicRes.topics.length} topics with AI...`);
      const classifyRes = await classifyQuestionsFn({
        data: {
          courseId,
          topics: topicRes.topics,
          sortingInstructions: sortingInstructions.trim() || undefined,
        },
      });

      setCourseGroups(classifyRes.groups);
      setCourseSubjects(classifyRes.subjects);
      setCategories(classifyRes.categories);

      // Initialize default destinations for each category
      const initialDest: Record<string, DestinationChoice> = {};
      classifyRes.categories.forEach((cat) => {
        const defaultGroupId = cat.suggestedTargetGroupId || classifyRes.groups?.[0]?.id || "";
        if (cat.suggestedTargetSubjectId) {
          initialDest[cat.topic] = {
            action: "move_to_existing",
            targetSubjectId: cat.suggestedTargetSubjectId,
            newSubjectName: cat.topic,
            targetGroupId: defaultGroupId,
          };
        } else {
          initialDest[cat.topic] = {
            action: "create_new_subject",
            newSubjectName: cat.topic,
            targetGroupId: defaultGroupId,
          };
        }
      });
      setDestinations(initialDest);
      setStep("review");
      toast.success(`Sorted questions into ${classifyRes.categories.length} categories!`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to sort questions");
    } finally {
      setBusy(false);
      setBusyMessage("");
    }
  }

  async function handleApply() {
    const assignments = categories.map((cat) => {
      const dest = destinations[cat.topic] || {
        action: "create_new_subject",
        newSubjectName: cat.topic,
        targetGroupId: courseGroups?.[0]?.id,
      };

      return {
        topic: cat.topic,
        questionIds: cat.questionIds,
        action: dest.action,
        targetSubjectId: dest.targetSubjectId,
        newSubjectName: dest.newSubjectName,
        targetGroupId: dest.targetGroupId,
        newGroupName: dest.newGroupName,
      };
    });

    const activeCount = assignments
      .filter((a) => a.action !== "skip")
      .reduce((sum, a) => sum + a.questionIds.length, 0);

    if (activeCount === 0) {
      toast.error("No questions are selected to be moved.");
      return;
    }

    if (!window.confirm(`Move and organize ${activeCount} question(s) into their chosen subjects?`)) {
      return;
    }

    setBusy(true);
    setBusyMessage("Applying question placements and creating subjects...");
    try {
      const res = await applySortFn({
        data: {
          courseId,
          assignments,
        },
      });

      setSuccessStats({
        moved: res.movedQuestionsCount,
        created: res.createdSubjectsCount,
      });
      setStep("success");
      toast.success(`Organized ${res.movedQuestionsCount} questions!`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply question sorting");
    } finally {
      setBusy(false);
      setBusyMessage("");
    }
  }

  function handleDestinationChange(topic: string, partial: Partial<DestinationChoice>) {
    setDestinations((prev) => ({
      ...prev,
      [topic]: {
        ...prev[topic],
        ...partial,
      },
    }));
  }

  function applyBulkGroup(groupId: string) {
    setDestinations((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((t) => {
        next[t] = {
          ...next[t],
          targetGroupId: groupId,
        };
      });
      return next;
    });
    toast.success("Updated default folder for all new subjects");
  }

  const btnStyle =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-white/90 border border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-white shadow-sm disabled:opacity-50 transition-colors";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep("input");
          setOpen(true);
        }}
        className={btnStyle}
        title="Sort course questions by syllabus/questionnaire PDF or topics"
      >
        <FolderTree className="w-3.5 h-3.5 text-indigo-600" />
        Sort questions
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Sort Course Questions (AI Questionnaire Organizer)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Upload a questionnaire/syllabus or paste topics to automatically categorize questions and choose where to put each category in <span className="font-semibold text-foreground">"{courseTitle}"</span>.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
            {busy && (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" />
                <p className="text-sm font-semibold text-foreground">{busyMessage || "Processing..."}</p>
                <p className="text-xs text-muted-foreground">This may take a few moments depending on the questions count.</p>
              </div>
            )}

            {!busy && step === "input" && (
              <div className="space-y-4">
                {/* Method selection tabs */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                    1. Questionnaire / Syllabus Source
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("pdf")}
                      className={`p-3 rounded-xl border text-left text-xs transition ${
                        mode === "pdf"
                          ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <Upload className="w-4 h-4 text-indigo-600 mb-1" />
                      <span className="font-bold block">Upload PDF</span>
                      <span className="text-[11px] text-muted-foreground">Questionnaire, syllabus, or lecture list</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode("text")}
                      className={`p-3 rounded-xl border text-left text-xs transition ${
                        mode === "text"
                          ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <FileText className="w-4 h-4 text-indigo-600 mb-1" />
                      <span className="font-bold block">Paste Text</span>
                      <span className="text-[11px] text-muted-foreground">List of lectures or questionnaire topics</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode("auto")}
                      className={`p-3 rounded-xl border text-left text-xs transition ${
                        mode === "auto"
                          ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-indigo-600 mb-1" />
                      <span className="font-bold block">AI Auto-Detect</span>
                      <span className="text-[11px] text-muted-foreground">Analyze questions & propose categories</span>
                    </button>
                  </div>
                </div>

                {/* Tab content */}
                {mode === "pdf" && (
                  <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-border bg-card p-6 text-center hover:border-indigo-500 transition">
                    <Upload className="mx-auto text-muted-foreground w-6 h-6 mb-2" />
                    <p className="text-sm font-bold text-foreground">
                      {pdfFile ? pdfFile.name : "Click to choose Questionnaire / Syllabus PDF"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload the PDF outlining the questions, topics, or lecture titles (up to 20 MB).
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}

                {mode === "text" && (
                  <div className="space-y-1.5">
                    <textarea
                      value={topicsText}
                      onChange={(e) => setTopicsText(e.target.value)}
                      rows={6}
                      placeholder={`Paste topics or questionnaire sections, for example:
Lecture 1: Acute Coronary Syndromes
Lecture 2: Valvular Heart Diseases
Lecture 3: Arrhythmias & Conduction Disorders
Lecture 4: Heart Failure & Cardiomyopathies`}
                      className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Each topic will become a category that questions are sorted into.
                    </p>
                  </div>
                )}

                {mode === "auto" && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-xs text-indigo-900 dark:text-indigo-200">
                    <p className="font-bold mb-1">Automatic Topic Extraction</p>
                    <p className="text-muted-foreground">
                      The AI will scan the stems of questions in this course, identify recurring themes and clinical systems, and propose logical sub-subject categories.
                    </p>
                  </div>
                )}

                {/* Optional AI Instructions */}
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <label className="text-xs font-bold text-foreground block">
                    2. AI Sorting Instructions & Notes (Optional) / توجيهات وملاحظات للذكاء الاصطناعي أثناء الفرز
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Tell Gemini strictly how to categorize questions (e.g., specific rules, how to handle edge cases, or chapter priorities).
                  </p>
                  <textarea
                    value={sortingInstructions}
                    onChange={(e) => setSortingInstructions(e.target.value)}
                    rows={2}
                    placeholder="e.g.: Strictly classify pediatric surgical conditions into Pediatric Surgery rather than General Surgery..."
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Submit button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAnalyzeAndSort}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    Analyze & Sort Questions
                  </button>
                </div>
              </div>
            )}

            {!busy && step === "review" && (
              <div className="space-y-4">
                {/* Header summary & bulk actions */}
                <div className="rounded-xl border border-border bg-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {categories.length} Categories Identified
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Review each category and select where each sort should be placed.
                    </p>
                  </div>

                  {courseGroups.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Set all new subjects folder:</span>
                      <select
                        onChange={(e) => applyBulkGroup(e.target.value)}
                        defaultValue={courseGroups[0]?.id}
                        className="px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold"
                      >
                        {courseGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Category destination list */}
                <div className="space-y-3">
                  {categories.map((cat, idx) => {
                    const dest = destinations[cat.topic] || {
                      action: "create_new_subject",
                      newSubjectName: cat.topic,
                      targetGroupId: courseGroups?.[0]?.id,
                    };

                    const isExpanded = expandedCategory === cat.topic;

                    return (
                      <div
                        key={cat.topic}
                        className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm"
                      >
                        {/* Title & stats */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="grid size-6 place-items-center rounded-md bg-indigo-500/15 text-indigo-700 text-xs font-black">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-sm text-foreground">
                              {cat.topic}
                            </span>
                            <span className="rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-black">
                              {cat.questionsCount} question{cat.questionsCount > 1 ? "s" : ""}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedCategory(isExpanded ? null : cat.topic)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? "Hide sample" : "Preview sample"}
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>

                        {/* Sample questions preview */}
                        {isExpanded && (
                          <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1.5 border border-border/60">
                            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
                              Sample Questions in this Category:
                            </p>
                            {cat.questionsSample.map((q) => (
                              <div key={q.id} className="text-foreground/90 flex items-start gap-1.5">
                                <span className="text-muted-foreground">•</span>
                                <span className="line-clamp-1">{q.stem}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                                  ({q.currentSubjectName})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Destination controls: WHERE TO PUT THIS SORT */}
                        <div className="pt-2 border-t border-border/60 space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Where to put this sort:
                          </span>

                          <div className="grid sm:grid-cols-3 gap-2">
                            {/* Option 1: Create New Subject */}
                            <label
                              className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                dest.action === "create_new_subject"
                                  ? "border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20"
                                  : "border-border hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`dest-${cat.topic}`}
                                checked={dest.action === "create_new_subject"}
                                onChange={() => handleDestinationChange(cat.topic, { action: "create_new_subject" })}
                                className="mt-0.5 accent-indigo-600"
                              />
                              <div className="min-w-0">
                                <span className="font-bold block">Create New Subject</span>
                                <span className="text-[11px] text-muted-foreground">Add as a new subject card</span>
                              </div>
                            </label>

                            {/* Option 2: Move to Existing */}
                            <label
                              className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                dest.action === "move_to_existing"
                                  ? "border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20"
                                  : "border-border hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`dest-${cat.topic}`}
                                checked={dest.action === "move_to_existing"}
                                onChange={() => handleDestinationChange(cat.topic, { action: "move_to_existing" })}
                                className="mt-0.5 accent-indigo-600"
                              />
                              <div className="min-w-0">
                                <span className="font-bold block">Move to Existing</span>
                                <span className="text-[11px] text-muted-foreground">Merge into an existing subject</span>
                              </div>
                            </label>

                            {/* Option 3: Skip */}
                            <label
                              className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                dest.action === "skip"
                                  ? "border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20"
                                  : "border-border hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`dest-${cat.topic}`}
                                checked={dest.action === "skip"}
                                onChange={() => handleDestinationChange(cat.topic, { action: "skip" })}
                                className="mt-0.5 accent-indigo-600"
                              />
                              <div className="min-w-0">
                                <span className="font-bold block">Don't move</span>
                                <span className="text-[11px] text-muted-foreground">Keep in original subject</span>
                              </div>
                            </label>
                          </div>

                          {/* Detail inputs based on action */}
                          {dest.action === "create_new_subject" && (
                            <div className="mt-2 grid sm:grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                                  Subject Name:
                                </label>
                                <input
                                  type="text"
                                  value={dest.newSubjectName}
                                  onChange={(e) => handleDestinationChange(cat.topic, { newSubjectName: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                                  Target Folder / Group:
                                </label>
                                <select
                                  value={dest.targetGroupId ?? courseGroups?.[0]?.id ?? ""}
                                  onChange={(e) => handleDestinationChange(cat.topic, { targetGroupId: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                                >
                                  {courseGroups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          {dest.action === "move_to_existing" && (
                            <div className="mt-2 pt-1">
                              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                                Select Existing Subject:
                              </label>
                              <select
                                value={dest.targetSubjectId ?? courseSubjects?.[0]?.id ?? ""}
                                onChange={(e) => handleDestinationChange(cat.topic, { targetSubjectId: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                              >
                                {courseSubjects.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer action buttons */}
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("input")}
                    className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                  >
                    ← Back to Setup
                  </button>

                  <button
                    type="button"
                    onClick={handleApply}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition"
                  >
                    Apply Sorting & Move Questions
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {!busy && step === "success" && successStats && (
              <div className="py-12 px-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
                <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  Questions Successfully Sorted!
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Organized and moved {successStats.moved} questions across {successStats.created} new/existing subjects in this course.
                </p>
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSorted?.();
                      window.location.reload();
                    }}
                    className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm hover:bg-emerald-700 transition"
                  >
                    Done & Refresh Course
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
