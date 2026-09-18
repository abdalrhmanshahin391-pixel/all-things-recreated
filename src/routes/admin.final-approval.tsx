// Final Approval — Dedicated Admin & QA Review Tool
// Allows QA reviewers and Admins to inspect extracted question batches against
// original PDF scans side-by-side, verify stems/choices, and approve batches for solving.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  FileText,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useServerFn } from "@tanstack/react-start";
import { getPageJpegFromCache } from "@/lib/pdf-page-image";
import {
  listApprovalBatches,
  getApprovalBatch,
  updateApprovalBatch,
  deleteApprovalBatch,
  type FinalApprovalBatch,
  type FinalApprovalBatchSummary,
  type BatchStatus,
} from "@/lib/final-approval.functions";
import type { SolvedQuestionState } from "@/lib/mcq-generator-124-pro.functions";

export const Route = createFileRoute("/admin/final-approval")({
  head: () => ({
    meta: [
      { title: "Final Approval (QA) — Admin" },
      { name: "description", content: "Quality assurance workspace to verify and approve extracted MCQs side-by-side with original PDF scans." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFinalApproval,
});

export function AdminFinalApproval() {
  const { isAdmin, isQa, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Server Functions ──────────────────────────────────────────────────────
  const listBatchesFn = useServerFn(listApprovalBatches);
  const getBatchFn = useServerFn(getApprovalBatch);
  const updateBatchFn = useServerFn(updateApprovalBatch);
  const deleteBatchFn = useServerFn(deleteApprovalBatch);

  // Route security guard
  useEffect(() => {
    if (!loading && !isAdmin && !isQa) {
      guardRedirect(navigate);
    }
  }, [loading, isAdmin, isQa, navigate]);

  // List Filters & Search
  const [statusFilter, setStatusFilter] = useState<"all" | BatchStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Active Batch in Split-Screen Review
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<FinalApprovalBatch | null>(null);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);

  // Review Workspace Local State
  const [currentQuestions, setCurrentQuestions] = useState<SolvedQuestionState[]>([]);
  const [qaActiveIndex, setQaActiveIndex] = useState(0);
  const [qaZoom, setQaZoom] = useState(1);
  const [qaFilter, setQaFilter] = useState<"all" | "review_only" | "approved" | "unapproved">("all");
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [localPageImages, setLocalPageImages] = useState<Record<number, string>>({});

  // Query Batches (Server + Client Backup)
  const { data: batchesData, isLoading: isLoadingBatches, refetch: refetchBatches } = useQuery({
    queryKey: ["final-approval-batches", statusFilter, searchQuery],
    queryFn: async () => {
      let serverBatches: FinalApprovalBatchSummary[] = [];
      try {
        const res = await listBatchesFn({ data: { status: statusFilter, search: searchQuery } });
        if (res?.batches) serverBatches = res.batches;
      } catch (e) {
        console.warn("[FinalApproval] Server list failed, checking local backup:", e);
      }

      // Merge with client localStorage batches
      let localBatches: FinalApprovalBatchSummary[] = [];
      try {
        const raw = localStorage.getItem("final_approval_batches_v1");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            localBatches = list.map((b: any) => ({
              id: b.id,
              title: b.title,
              status: b.status,
              total_questions: b.total_questions,
              approved_questions: b.approved_questions,
              flagged_questions: b.flagged_questions,
              created_at: b.created_at,
              updated_at: b.updated_at,
              created_by_email: b.created_by_email,
              notes: b.notes,
            }));
          }
        }
      } catch {}

      const map = new Map<string, FinalApprovalBatchSummary>();
      for (const b of localBatches) map.set(b.id, b);
      for (const b of serverBatches) map.set(b.id, b);
      let combined = Array.from(map.values());

      if (statusFilter !== "all") {
        combined = combined.filter((b) => b.status === statusFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        combined = combined.filter(
          (b) => b.title.toLowerCase().includes(q) || b.notes?.toLowerCase().includes(q)
        );
      }
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { batches: combined };
    },
    enabled: !!(isAdmin || isQa),
  });

  const batches = batchesData?.batches || [];

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = batches.length;
    const pending = batches.filter((b) => b.status === "pending").length;
    const inReview = batches.filter((b) => b.status === "in_review").length;
    const approved = batches.filter((b) => b.status === "approved").length;
    return { total, pending, inReview, approved };
  }, [batches]);

  // Load Batch into Split-Screen Mode
  const handleOpenBatch = async (batchId: string) => {
    try {
      setIsLoadingBatch(true);
      setActiveBatchId(batchId);
      let loadedBatch: FinalApprovalBatch | null = null;

      try {
        const res = await getBatchFn({ data: { batchId } });
        if (res?.batch) loadedBatch = res.batch;
      } catch (err) {
        console.warn("[FinalApproval] Server getBatch failed, checking local backup:", err);
      }

      if (!loadedBatch) {
        try {
          const raw = localStorage.getItem("final_approval_batches_v1");
          const list = raw ? JSON.parse(raw) : [];
          loadedBatch = list.find((b: any) => b.id === batchId) || null;
        } catch {}
      }

      if (loadedBatch) {
        setActiveBatch(loadedBatch);
        setCurrentQuestions(loadedBatch.questions || []);
        setQaActiveIndex(0);
        setQaZoom(1);
        setQaFilter("all");
      } else {
        throw new Error("Batch could not be loaded");
      }
    } catch (err: any) {
      toast.error(`Failed to load batch: ${err.message || "Unknown error"}`);
      setActiveBatchId(null);
      setActiveBatch(null);
    } finally {
      setIsLoadingBatch(false);
    }
  };

  // Close Split-Screen Mode
  const handleCloseBatch = () => {
    setActiveBatchId(null);
    setActiveBatch(null);
    setCurrentQuestions([]);
    refetchBatches();
  };

  // Delete Batch
  const handleDeleteBatch = async (batchId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete batch "${title}"?`)) return;
    try {
      try {
        await deleteBatchFn({ data: { batchId } });
      } catch (e) {
        console.warn("Server delete warning:", e);
      }

      // Also remove from client storage
      try {
        const raw = localStorage.getItem("final_approval_batches_v1");
        if (raw) {
          const list = JSON.parse(raw);
          const filtered = list.filter((b: any) => b.id !== batchId);
          localStorage.setItem("final_approval_batches_v1", JSON.stringify(filtered));
        }
      } catch {}

      toast.success("Batch deleted");
      refetchBatches();
      if (activeBatchId === batchId) {
        handleCloseBatch();
      }
    } catch (err: any) {
      toast.error(`Failed to delete batch: ${err.message}`);
    }
  };

  // Filtered Questions in Review
  const filteredQuestions = useMemo(() => {
    if (qaFilter === "review_only") return currentQuestions.filter((q) => q.needsReview);
    if (qaFilter === "approved") return currentQuestions.filter((q) => q.isApproved);
    if (qaFilter === "unapproved") return currentQuestions.filter((q) => !q.isApproved);
    return currentQuestions;
  }, [currentQuestions, qaFilter]);

  const activeQuestion = filteredQuestions[qaActiveIndex] || null;

  // Auto-fetch missing scanned page image from IndexedDB cache
  useEffect(() => {
    const pNum = activeQuestion?.pageNumber;
    if (!pNum) return;
    if (activeBatch?.page_images?.[pNum]) return;
    if (localPageImages[pNum]) return;

    let isMounted = true;
    getPageJpegFromCache(pNum).then((cached) => {
      if (cached && isMounted) {
        const src = cached.startsWith("data:") ? cached : `data:image/jpeg;base64,${cached}`;
        setLocalPageImages((prev) => ({ ...prev, [pNum]: src }));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [activeQuestion?.pageNumber, activeBatch, localPageImages]);

  const currentImageSrc =
    (activeQuestion?.pageNumber && activeBatch?.page_images?.[activeQuestion.pageNumber]) ||
    (activeQuestion?.pageNumber && localPageImages[activeQuestion.pageNumber]) ||
    null;

  // QA Editing Handlers
  const handleApproveQuestion = (qId: string) => {
    setCurrentQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, isApproved: true, needsReview: false } : q))
    );
    if (qaActiveIndex < filteredQuestions.length - 1) {
      setQaActiveIndex((prev) => prev + 1);
    }
    toast.success("Question approved!");
  };

  const handleToggleType = (qId: string) => {
    setCurrentQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const nextType = q.questionType === "combination" ? "ordinary" : "combination";
        return { ...q, questionType: nextType };
      })
    );
  };

  const handleFixStatementsAsOptions = (qId: string) => {
    setCurrentQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const newStatements = [...(q.statements || [])];
        const newOptions: any[] = [];
        let letterCode = 65; // 'A'

        for (const opt of q.options) {
          const matchNum = opt.text.match(/^([1-5])[\.\)\:\-]\s*(.*)$/);
          if (matchNum) {
            newStatements.push({ number: parseInt(matchNum[1], 10), text: matchNum[2].trim() });
          } else {
            newOptions.push({ letter: String.fromCharCode(letterCode++), text: opt.text });
          }
        }

        return {
          ...q,
          questionType: "combination",
          statements: newStatements,
          options: newOptions.length > 0 ? newOptions : q.options,
          needsReview: false,
        };
      })
    );
    toast.success("Reorganized numbered statements!");
  };

  const handleCleanTypos = (qId: string) => {
    setCurrentQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const cleanedOpts = q.options.map((opt) => {
          let t = opt.text;
          t = t.replace(/^[c-e]\)\s*all\s+(mentioned|above|of\s+the\s+above)/i, "all $1");
          t = t.replace(/^[c-e]all\s+(mentioned|above|of\s+the\s+above)/i, "all $1");
          t = t.replace(/^[a-e]\)\s*/i, "");
          return { ...opt, text: t.trim() };
        });
        return { ...q, options: cleanedOpts };
      })
    );
    toast.success("Cleaned option typos!");
  };

  const handleUpdateStem = (qId: string, val: string) => {
    setCurrentQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, stem: val } : q)));
  };

  const handleUpdateOption = (qId: string, optIdx: number, val: string) => {
    setCurrentQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const updatedOpts = [...q.options];
        if (updatedOpts[optIdx]) {
          updatedOpts[optIdx] = { ...updatedOpts[optIdx], text: val };
        }
        return { ...q, options: updatedOpts };
      })
    );
  };

  const handleDeleteQuestion = (qId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    setCurrentQuestions((prev) => prev.filter((q) => q.id !== qId));
    if (qaActiveIndex >= filteredQuestions.length - 1) {
      setQaActiveIndex(Math.max(0, filteredQuestions.length - 2));
    }
    toast.success("Question deleted");
  };

  // Save Batch Progress
  const handleSaveBatch = async (markAsApproved = false) => {
    if (!activeBatchId) return;
    try {
      setIsSavingBatch(true);
      const allApproved = currentQuestions.every((q) => q.isApproved);
      const newStatus: BatchStatus = markAsApproved || allApproved ? "approved" : "in_review";

      const updatedQuestions = markAsApproved
        ? currentQuestions.map((q) => ({ ...q, isApproved: true, needsReview: false }))
        : currentQuestions;

      try {
        await updateBatchFn({
          data: {
            batchId: activeBatchId,
            status: newStatus,
            questions: updatedQuestions,
          },
        });
      } catch (err) {
        console.warn("[FinalApproval] Server update failed, continuing with local store:", err);
      }

      // Also persist to localStorage backup
      try {
        const raw = localStorage.getItem("final_approval_batches_v1");
        if (raw) {
          const list = JSON.parse(raw);
          const idx = list.findIndex((b: any) => b.id === activeBatchId);
          if (idx >= 0) {
            list[idx].status = newStatus;
            list[idx].questions = updatedQuestions;
            list[idx].approved_questions = updatedQuestions.filter((q: any) => q.isApproved).length;
            list[idx].flagged_questions = updatedQuestions.filter((q: any) => q.needsReview).length;
            list[idx].updated_at = new Date().toISOString();
            localStorage.setItem("final_approval_batches_v1", JSON.stringify(list));
          }
        }
      } catch {}

      setCurrentQuestions(updatedQuestions);
      toast.success(markAsApproved ? "Batch marked as Fully Approved!" : "Batch progress saved!");
      refetchBatches();
    } catch (err: any) {
      toast.error(`Error saving batch: ${err.message}`);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Keyboard Navigation & Shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!activeBatchId || !activeQuestion) return;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (isInput) return; // Don't intercept while typing

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleApproveQuestion(activeQuestion.id);
      } else if (e.key === "j" || e.key === "J" || e.key === "ArrowLeft") {
        e.preventDefault();
        setQaActiveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowRight") {
        e.preventDefault();
        setQaActiveIndex((prev) => Math.min(filteredQuestions.length - 1, prev + 1));
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleToggleType(activeQuestion.id);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFixStatementsAsOptions(activeQuestion.id);
      }
    },
    [activeBatchId, activeQuestion, filteredQuestions.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const approvedCount = currentQuestions.filter((q) => q.isApproved).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-28 pb-20">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> Administration Hub
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck size={14} /> QA & Admin Clearance Active
            </span>
          </div>
        </div>

        {/* Title & Overview */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <CheckSquare className="text-emerald-400" size={28} /> Final Approval — QA Hub
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-3xl">
              Inspect extracted exam batches side-by-side with original scanned PDF pages. Verify stems, choices, and combination structures before plotting questions into the solving engine.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchBatches()}
              disabled={isLoadingBatches}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={isLoadingBatches ? "animate-spin" : ""} /> Refresh
            </button>
            <Link
              to="/admin/mcq-generator-124-pro"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
            >
              Open MCQ Generator <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Batches</span>
            <div className="mt-2 text-2xl font-black text-white">{metrics.total}</div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Pending Review</span>
            <div className="mt-2 text-2xl font-black text-amber-300">{metrics.pending}</div>
          </div>
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">In Progress</span>
            <div className="mt-2 text-2xl font-black text-cyan-300">{metrics.inReview}</div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Fully Approved</span>
            <div className="mt-2 text-2xl font-black text-emerald-300">{metrics.approved}</div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-8 p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {(
              [
                ["all", "All Batches"],
                ["pending", "Pending Review"],
                ["in_review", "In Progress"],
                ["approved", "Approved"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === key
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search batches by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>
        </div>

        {/* Batches List */}
        <div className="mt-4 space-y-3">
          {isLoadingBatches ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500">
              <Loader2 size={32} className="animate-spin mb-3 text-cyan-400" />
              <p className="text-sm">Loading approval queue...</p>
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center">
              <Inbox size={40} className="text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-300">No Batches in Final Approval</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Extract questions in the MCQ Generator and click <strong>"Send to Final Approval"</strong> to populate this review queue.
              </p>
              <Link
                to="/admin/mcq-generator-124-pro"
                className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                Go to MCQ Generator
              </Link>
            </div>
          ) : (
            batches.map((b) => {
              const pct = b.total_questions > 0 ? Math.round((b.approved_questions / b.total_questions) * 100) : 0;
              return (
                <div
                  key={b.id}
                  className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-base font-black text-white truncate">{b.title}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          b.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : b.status === "in_review"
                            ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {b.status === "approved"
                          ? "Fully Approved"
                          : b.status === "in_review"
                          ? "In Progress"
                          : "Pending Review"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 flex-wrap">
                      <span>Submitted by: <strong className="text-slate-300">{b.created_by_email || "admin"}</strong></span>
                      <span>•</span>
                      <span>{new Date(b.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>{b.total_questions} Questions</span>
                      {b.flagged_questions > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <AlertTriangle size={12} /> {b.flagged_questions} Flagged
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-300 ${
                            pct === 100 ? "bg-emerald-400" : "bg-gradient-to-r from-teal-400 to-emerald-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
                        {b.approved_questions} / {b.total_questions} Approved ({pct}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleOpenBatch(b.id)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <CheckSquare size={14} /> Review & Approve
                    </button>
                    <button
                      onClick={() => handleDeleteBatch(b.id, b.title)}
                      className="p-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                      title="Delete Batch"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ── SPLIT-SCREEN QA REVIEW WORKSPACE MODAL ───────────────────────── */}
      {activeBatchId && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          {/* Top QA Navigation Bar */}
          <header className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloseBatch}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Back to Batches Queue"
              >
                <ChevronLeft size={20} />
              </button>
              <div>
                <span className="text-sm font-black text-white flex items-center gap-2">
                  <CheckSquare size={16} className="text-emerald-400" />
                  {activeBatch?.title || "Final Approval Review"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Question Filter Pills */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                {(
                  [
                    ["all", `All (${currentQuestions.length})`],
                    ["review_only", `Flagged (${currentQuestions.filter((q) => q.needsReview).length})`],
                    ["unapproved", `Pending (${currentQuestions.filter((q) => !q.isApproved).length})`],
                    ["approved", `Approved (${approvedCount})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setQaFilter(key as any);
                      setQaActiveIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      qaFilter === key
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Live Counter Badge */}
              <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 font-bold">
                {approvedCount} / {currentQuestions.length} Approved
              </span>

              {/* Save Progress Button */}
              <button
                onClick={() => handleSaveBatch(false)}
                disabled={isSavingBatch}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingBatch ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save Progress
              </button>

              {/* Mark All Approved Button */}
              <button
                onClick={() => handleSaveBatch(true)}
                disabled={isSavingBatch}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Approve Entire Batch
              </button>

              <button
                onClick={handleCloseBatch}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* Body: Split Screen Workspace */}
          {isLoadingBatch ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Loader2 size={36} className="animate-spin mb-2 text-cyan-400" />
              <p className="text-sm">Loading batch questions & original scan images...</p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
              {/* LEFT 50%: Original Scanned PDF Page */}
              <div className="bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden">
                <div className="p-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-cyan-400" />
                    <span className="font-bold text-white">Original Document Scan</span>
                    {activeQuestion?.pageNumber && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[11px] font-bold">
                        Page {activeQuestion.pageNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQaZoom((z) => Math.max(0.6, z - 0.2))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Zoom Out"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="font-mono text-[11px] w-10 text-center text-slate-300">
                      {Math.round(qaZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setQaZoom((z) => Math.min(2.5, z + 0.2))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Zoom In"
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      onClick={() => setQaZoom(1)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold ml-1"
                    >
                      100%
                    </button>
                  </div>
                </div>

                {/* Scanned Image Viewer */}
                <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-slate-950/60 select-none">
                  {currentImageSrc ? (
                    <div
                      style={{ transform: `scale(${qaZoom})`, transformOrigin: "top center", transition: "transform 0.15s ease-out" }}
                      className="shadow-2xl rounded-lg overflow-hidden border border-slate-700 max-w-full"
                    >
                      <img
                        src={currentImageSrc.startsWith("data:") ? currentImageSrc : `data:image/jpeg;base64,${currentImageSrc}`}
                        alt={`Scanned Page ${activeQuestion?.pageNumber || ""}`}
                        className="w-full h-auto block"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-sm">
                      <FileText size={32} className="mb-2 text-slate-600" />
                      <span>Scan image for page {activeQuestion?.pageNumber || "N/A"} not loaded.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT 50%: Rapid Question Editor */}
              <div className="bg-slate-900/60 flex flex-col overflow-hidden">
                {activeQuestion ? (
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Header: Question Number, Approval Status, Type Switcher */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white font-mono bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                          Q #{qaActiveIndex + 1}
                        </span>
                        {activeQuestion.isApproved ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 size={13} /> Approved
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                            Pending Approval
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                          onClick={() => handleToggleType(activeQuestion.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            activeQuestion.questionType !== "combination"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Ordinary MCQ
                        </button>
                        <button
                          onClick={() => handleToggleType(activeQuestion.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            activeQuestion.questionType === "combination"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Combination MCQ
                        </button>
                      </div>
                    </div>

                    {/* 1-Click Smart Fixes */}
                    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400">Smart Fixes:</span>
                      <button
                        onClick={() => handleFixStatementsAsOptions(activeQuestion.id)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Move choices 1..4 out of options into the premise statements list"
                      >
                        <Sparkles size={12} /> Fix: Statements as Options
                      </button>
                      <button
                        onClick={() => handleCleanTypos(activeQuestion.id)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Auto-clean merged typos like 'call mentioned' -> 'all mentioned'"
                      >
                        <Wrench size={12} /> Clean Typos
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(activeQuestion.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all ml-auto cursor-pointer"
                        title="Delete Question"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Flagged Banner */}
                    {activeQuestion.needsReview && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                        <span>{activeQuestion.reviewReason || "Flagged for manual review."}</span>
                      </div>
                    )}

                    {/* Stem Textarea */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Question Prompt / Stem
                      </label>
                      <textarea
                        value={activeQuestion.stem}
                        onChange={(e) => handleUpdateStem(activeQuestion.id, e.target.value)}
                        rows={4}
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl p-3 text-sm text-white focus:outline-none transition-colors leading-relaxed font-sans"
                      />
                    </div>

                    {/* Premise Statements (if combination) */}
                    {activeQuestion.questionType === "combination" && activeQuestion.statements && (
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Numbered Statements (1, 2, 3...)
                        </label>
                        <div className="space-y-2">
                          {activeQuestion.statements.map((st: { number?: number; text: string }, sIdx: number) => (
                            <div key={sIdx} className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-lg bg-slate-800 text-amber-300 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-700">
                                {st.number || sIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={st.text}
                                onChange={(e) => {
                                  const updatedSts = [...(activeQuestion.statements || [])];
                                  updatedSts[sIdx] = { ...updatedSts[sIdx], text: e.target.value };
                                  setCurrentQuestions((prev) =>
                                    prev.map((q) => (q.id === activeQuestion.id ? { ...q, statements: updatedSts } : q))
                                  );
                                }}
                                className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Answer Choices */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Answer Choices (A, B, C, D)
                      </label>
                      <div className="grid grid-cols-1 gap-2">
                        {activeQuestion.options.map((opt, oIdx) => (
                          <div key={opt.letter || oIdx} className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-700">
                              {opt.letter}
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleUpdateOption(activeQuestion.id, oIdx, e.target.value)}
                              className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Navigation Bar */}
                    <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQaActiveIndex((prev) => Math.max(0, prev - 1))}
                          disabled={qaActiveIndex === 0}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <ChevronLeft size={14} /> Previous (J)
                        </button>
                        <span className="text-xs font-mono text-slate-400">
                          {qaActiveIndex + 1} / {filteredQuestions.length}
                        </span>
                        <button
                          onClick={() => setQaActiveIndex((prev) => Math.min(filteredQuestions.length - 1, prev + 1))}
                          disabled={qaActiveIndex >= filteredQuestions.length - 1}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          Next (K) <ChevronRight size={14} />
                        </button>
                      </div>

                      <button
                        onClick={() => handleApproveQuestion(activeQuestion.id)}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Check size={16} /> Approve & Next (Space)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                    <CheckCircle2 size={40} className="text-emerald-400 mb-2" />
                    <span>All questions in this view are approved!</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default AdminFinalApproval;
