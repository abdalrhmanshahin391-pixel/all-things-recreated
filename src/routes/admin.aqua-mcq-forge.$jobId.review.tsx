import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Edit3,
  Flag,
  Check,
  CheckCheck,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Quote,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import {
  amfGetJob,
  amfListItems,
  amfUpdateItem,
  amfSetItemsStatus,
} from "@/lib/aqua-mcq-forge.functions";
import { formatQuestionStem, ensureCombinedStemWithStatements } from "@/lib/question-format";
import { stripSourceCitation } from "@/lib/aqua-mcq-forge.explanation";

export const Route = createFileRoute("/admin/aqua-mcq-forge/$jobId/review")({
  head: () => ({
    meta: [
      { title: "Review Questions — Aqua MCQ Forge" },
      { name: "description", content: "Review and approve authored medical MCQs with 7-point validation." },
    ],
  }),
  component: AquaMcqForgeReview,
});

function AquaMcqForgeReview() {
  const { jobId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) guardRedirect(navigate);
  }, [loading, user, navigate]);

  const getJob = useServerFn(amfGetJob);
  const listItems = useServerFn(amfListItems);
  const updateItem = useServerFn(amfUpdateItem);
  const setItemsStatus = useServerFn(amfSetItemsStatus);

  const [job, setJob] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  // Expandable state for validation details
  const [expandedVal, setExpandedVal] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    stem: "",
    explanation: "",
  });

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const res: any = await getJob({ data: { jobId } });
      setJob(res.job);
      setTopics(res.topics ?? []);

      const qItems: any = await listItems({
        data: {
          jobId,
          statusFilter: statusFilter as any,
          topicId: topicFilter !== "all" ? topicFilter : undefined,
        },
      });
      setItems(qItems ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load review items.");
    } finally {
      setBusy(false);
    }
  }, [getJob, listItems, jobId, statusFilter, topicFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSetStatus(itemId: string, status: "approved" | "rejected" | "pending") {
    try {
      await updateItem({ data: { itemId, patch: { status } } });
      setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, status } : item)));
      toast.success(`Question marked as ${status}.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update question status.");
    }
  }

  async function handleBulkApprove() {
    const pendingIds = items.filter((i) => i.status === "pending" || i.status === "needs_review").map((i) => i.id);
    if (!pendingIds.length) {
      toast.info("No pending questions to approve.");
      return;
    }
    try {
      setBusy(true);
      await setItemsStatus({ data: { itemIds: pendingIds, status: "approved" } });
      toast.success(`Approved ${pendingIds.length} question(s)!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Bulk approval failed.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: any) {
    setEditingItem(item);
    setEditForm({
      stem: item.stem || "",
      explanation: item.explanation || "",
    });
  }

  async function saveEdit() {
    if (!editingItem) return;
    try {
      setBusy(true);
      await updateItem({
        data: {
          itemId: editingItem.id,
          patch: {
            stem: editForm.stem,
            explanation: editForm.explanation,
          },
        },
      });
      toast.success("Question updated.");
      setEditingItem(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save edits.");
    } finally {
      setBusy(false);
    }
  }

  const approvedCount = items.filter((i) => i.status === "approved").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              <Link to="/admin/aqua-mcq-forge/$jobId" params={{ jobId }} className="hover:text-indigo-600 transition flex items-center gap-1">
                <ArrowLeft size={13} /> Studio
              </Link>
              <span>/</span>
              <span>Question Review</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              Review Authored Questions
              <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200">
                {items.length} question(s)
              </Badge>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Verify accuracy, inspect 7-point validation reports, and approve questions for import.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleBulkApprove}
              disabled={busy || items.length === 0}
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5 text-xs font-bold"
            >
              <CheckCheck size={16} /> Approve All Pending
            </Button>

            <Link to="/admin/aqua-mcq-forge/$jobId/import" params={{ jobId }}>
              <Button
                disabled={approvedCount === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-xs font-bold"
              >
                <ExternalLink size={16} /> Import to Course ({approvedCount})
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 p-3 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-400" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Topic:</span>
              <Select value={topicFilter} onValueChange={setTopicFilter}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Topics</SelectItem>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Showing <strong className="text-slate-900">{items.length}</strong> questions
          </div>
        </div>

        {/* Questions Cards List */}
        <div className="mt-6 space-y-6">
          {busy && items.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="animate-spin mx-auto text-indigo-600 mb-2" size={24} />
              Loading questions...
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-500 font-semibold">No questions found matching your filter.</p>
              <Link to="/admin/aqua-mcq-forge/$jobId" params={{ jobId }} className="mt-3 inline-block">
                <Button size="sm" variant="outline" className="gap-1.5 mt-2">
                  <ArrowLeft size={14} /> Back to Studio to Generate
                </Button>
              </Link>
            </div>
          ) : (
            items.map((item, idx) => {
              const valReport = item.validation_report || {};
              const checks = valReport.checks || {};
              const isExpanded = !!expandedVal[item.id];
              const isCombined = item.form === "B";

              return (
                <Card
                  key={item.id}
                  className={`bg-white transition-all shadow-sm ${
                    item.status === "approved"
                      ? "border-emerald-300 ring-1 ring-emerald-100"
                      : item.status === "needs_review"
                      ? "border-rose-300 ring-1 ring-rose-100"
                      : "border-slate-200"
                  }`}
                >
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-sm text-slate-700">#{idx + 1}</span>

                        <Badge variant="outline" className="text-xs font-semibold bg-slate-50">
                          {item.topic_name || "General"}
                        </Badge>

                        <Badge
                          variant="secondary"
                          className={
                            isCombined
                              ? "bg-purple-50 text-purple-700 border-purple-200 font-bold"
                              : "bg-blue-50 text-blue-700 border-blue-200 font-bold"
                          }
                        >
                          {isCombined ? "Combined (Form B)" : "Standard (Form A)"}
                        </Badge>

                        <Badge
                          variant="outline"
                          className={
                            item.difficulty === "easy"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold capitalize"
                              : item.difficulty === "medium"
                              ? "bg-amber-50 text-amber-700 border-amber-200 font-bold capitalize"
                              : "bg-rose-50 text-rose-700 border-rose-200 font-bold capitalize"
                          }
                        >
                          {item.difficulty}
                        </Badge>

                        <Badge variant="outline" className="text-[11px] text-slate-500 uppercase tracking-wider">
                          {item.objective}
                        </Badge>

                        {/* Deduplication similarity score */}
                        {item.dup_score > 0 && (
                          <span className="text-[11px] font-mono text-slate-400">
                            Similarity: {item.dup_score}%
                          </span>
                        )}
                      </div>

                      {/* Status indicator */}
                      <Badge
                        className={
                          item.status === "approved"
                            ? "bg-emerald-600 text-white font-bold"
                            : item.status === "rejected"
                            ? "bg-rose-600 text-white font-bold"
                            : item.status === "needs_review"
                            ? "bg-amber-500 text-white font-bold"
                            : "bg-slate-200 text-slate-700 font-bold"
                        }
                      >
                        {item.status.toUpperCase().replace("_", " ")}
                      </Badge>
                    </div>

                    {/* 7-Point Validation Summary Pill */}
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVal((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                          item.validation_passed
                            ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-950 font-semibold"
                            : "border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-950 font-semibold"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.validation_passed ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : (
                            <AlertTriangle size={16} className="text-rose-600" />
                          )}
                          <span>
                            {item.validation_passed
                              ? "7-Point Quality Verification: Passed All Checks"
                              : `Validation Issues Flagged (${item.validation_attempts} attempt(s))`}:
                          </span>
                          <span className="font-normal text-slate-600 truncate max-w-md">
                            {item.flag_reason || "Verified against textbook source."}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                          <div className="font-bold text-slate-700 mb-2">7-Point Quality Checklist:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center gap-1.5">
                              {checks.answer_supported_by_source ? "✅" : "❌"}{" "}
                              <span>Answer supported by source</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.exactly_one_correct_answer ? "✅" : "❌"}{" "}
                              <span>Unambiguous single correct answer</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.distractors_plausible ? "✅" : "❌"}{" "}
                              <span>Distractors plausible & challenging</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.explanation_agrees_with_source ? "✅" : "❌"}{" "}
                              <span>Explanation agrees with source</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.difficulty_matches_target ? "✅" : "❌"}{" "}
                              <span>Difficulty matches target</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.question_type_correct ? "✅" : "❌"}{" "}
                              <span>Form matches Standard/Combined</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {checks.no_information_outside_source ? "✅" : "❌"}{" "}
                              <span>Zero unverified outside information</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-4">
                    {/* Image illustration if present */}
                    {item.has_image && item.image_url && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-w-sm mx-auto">
                        <img src={item.image_url} alt="Medical Question Illustration" className="w-full h-auto object-contain" />
                        {item.image_prompt && (
                          <div className="p-2 text-[11px] text-slate-500 italic bg-white border-t border-slate-100">
                            Illustration: {item.image_prompt}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Question Stem */}
                    <div className="text-base font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap">
                      {ensureCombinedStemWithStatements(item.stem, item.explanation, item.options)}
                    </div>

                    {/* Form B Statements if applicable and not already in stem */}
                    {isCombined &&
                      !/(?:^|\n)\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+/i.test(item.stem) &&
                      Array.isArray(item.statements) &&
                      item.statements.length > 0 && (
                      <div className="space-y-1.5 pl-4 border-l-2 border-purple-200 py-1">
                        {item.statements.map((s: any, sIdx: number) => (
                          <div key={sIdx} className="text-sm text-slate-800">
                            <span className="font-bold text-purple-700">{s.n})</span> {s.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(item.options ?? []).map((opt: any, optIdx: number) => {
                        const isCorrect = (item.answer_labels ?? []).includes(String(opt.label).toUpperCase());
                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border text-sm flex items-start gap-3 transition ${
                              isCorrect
                                ? "bg-emerald-50/80 border-emerald-400 text-emerald-950 font-semibold"
                                : "bg-slate-50/60 border-slate-200 text-slate-800"
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                isCorrect ? "bg-emerald-600 text-white" : "bg-white border border-slate-300 text-slate-700"
                              }`}
                            >
                              {opt.label}
                            </span>
                            <span className="leading-snug">{opt.text}</span>
                            {isCorrect && <Check size={16} className="text-emerald-600 ml-auto shrink-0 mt-0.5" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Source Fidelity Citation Block */}
                    {item.source_fidelity && (
                      <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/40 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                          <BookOpen size={14} className="text-indigo-600" />
                          <span>Source Fidelity Proof:</span>
                          <span className="font-normal text-indigo-800">{item.source_fidelity.source}</span>
                          {item.source_fidelity.page && (
                            <span className="font-normal text-indigo-700">• Page: {item.source_fidelity.page}</span>
                          )}
                          {item.source_fidelity.section && (
                            <span className="font-normal text-indigo-700">• Section: {item.source_fidelity.section}</span>
                          )}
                        </div>
                        {item.source_fidelity.evidence && (
                          <div className="text-slate-600 italic pl-5 border-l-2 border-indigo-200 mt-1">
                            "{item.source_fidelity.evidence}"
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rendered Structured Explanation */}
                    {item.explanation && (
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-sm prose prose-slate max-w-none prose-table:border prose-th:bg-slate-900 prose-th:text-white prose-th:p-2 prose-td:p-2 prose-td:border">
                        <ReactMarkdown>{stripSourceCitation(item.explanation)}</ReactMarkdown>
                      </div>
                    )}

                    {/* Bottom Action Buttons Bar */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSetStatus(item.id, "approved")}
                          className={`gap-1 text-xs font-bold ${
                            item.status === "approved"
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          <CheckCircle2 size={15} /> Approve
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleSetStatus(item.id, "rejected")}
                          className={`gap-1 text-xs font-bold ${
                            item.status === "rejected"
                              ? "bg-rose-600 text-white"
                              : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                          }`}
                        >
                          <XCircle size={15} /> Reject
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSetStatus(item.id, "pending")}
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          Reset to Pending
                        </Button>
                      </div>

                      <Button size="sm" variant="outline" onClick={() => openEdit(item)} className="gap-1.5 text-xs">
                        <Edit3 size={14} /> Edit Question
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Edit Modal */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Edit Question & Explanation</DialogTitle>
              <DialogDescription>
                Modify question stem or fine-tune explanation markdown before importing.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Question Stem</Label>
                <Textarea
                  rows={4}
                  value={editForm.stem}
                  onChange={(e) => setEditForm({ ...editForm, stem: e.target.value })}
                  className="font-sans text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Explanation Markdown
                </Label>
                <Textarea
                  rows={12}
                  value={editForm.explanation}
                  onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
