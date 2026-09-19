// Final Approval — Dedicated Admin & QA Review Tool
// Allows QA reviewers and Admins to inspect extracted question batches against
// original PDF scans side-by-side, verify stems/choices, pan/zoom scans with mouse,
// highlight/mark scans, add missed questions, review/remove duplicates, and approve batches for solving & importing.

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
  Hand,
  Highlighter,
  RotateCcw,
  Plus,
  Move,
  Copy,
  Send,
  ArrowRight,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useServerFn } from "@tanstack/react-start";
import {
  getPageJpegFromCache,
  getSessionPageImages,
  getAllCachedPageJpegs,
  saveApprovalBatchToIndexedDb,
  getApprovalBatchFromIndexedDb,
  getAllApprovalBatchesFromIndexedDb,
  deleteApprovalBatchFromIndexedDb,
} from "@/lib/pdf-page-image";
import {
  listApprovalBatches,
  getApprovalBatch,
  updateApprovalBatch,
  deleteApprovalBatch,
  getLifecycleBadgeInfo,
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

export interface HighlightStroke {
  id: string;
  color: string;
  width?: number;
  points: Array<{ x: number; y: number }>; // Normalized 0..1 coordinates
}

export interface DuplicateGroup {
  id: string;
  stemSnippet: string;
  questions: SolvedQuestionState[];
}

// ── Duplicate Detection Algorithms ──────────────────────────────────────────
function normalizeStemForCompare(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/^\s*\d+[\.\)\:\-]\s*/, "") // remove leading question numbers e.g. "1.", "12)", "3 - "
    .replace(/[^\p{L}\p{N}\s]/gu, " ")   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length > 20 && b.length > 20) {
    if (a.includes(b) || b.includes(a)) {
      const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      if (ratio > 0.8) return 0.95;
    }
  }
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  return (2 * matches) / (wordsA.size + wordsB.size);
}

function findDuplicateClusters(questions: SolvedQuestionState[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < questions.length; i++) {
    const q1 = questions[i];
    if (assigned.has(q1.id)) continue;
    const norm1 = normalizeStemForCompare(q1.stem);
    if (norm1.length < 8) continue;

    const cluster: SolvedQuestionState[] = [q1];

    for (let j = i + 1; j < questions.length; j++) {
      const q2 = questions[j];
      if (assigned.has(q2.id)) continue;
      const norm2 = normalizeStemForCompare(q2.stem);

      let isDup = false;
      if (norm1 === norm2) {
        isDup = true;
      } else {
        const sim = computeSimilarity(norm1, norm2);
        if (sim >= 0.82) {
          isDup = true;
        }
      }

      if (isDup) {
        cluster.push(q2);
        assigned.add(q2.id);
      }
    }

    if (cluster.length > 1) {
      assigned.add(q1.id);
      groups.push({
        id: `dup_${q1.id}`,
        stemSnippet: q1.stem.slice(0, 90) + (q1.stem.length > 90 ? "..." : ""),
        questions: cluster,
      });
    }
  }

  return groups;
}

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
  const [qaPan, setQaPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Inspection Tools: Pan vs Highlight
  const [activeTool, setActiveTool] = useState<"pan" | "highlight">("pan");
  const [highlightColor, setHighlightColor] = useState<string>("#facc15"); // yellow default
  const [pageHighlights, setPageHighlights] = useState<Record<number, HighlightStroke[]>>({});
  const [currentDrawingStroke, setCurrentDrawingStroke] = useState<HighlightStroke | null>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  // Manual Page Switcher (allows QA to view pages even if no questions were extracted)
  const [viewingPageNumber, setViewingPageNumber] = useState<number>(1);

  // Filtering questions in batch
  const [qaFilter, setQaFilter] = useState<"all" | "review_only" | "approved" | "unapproved">("all");
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [localPageImages, setLocalPageImages] = useState<Record<number, string>>({});

  // Duplicates Review Modal
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);

  // Manual Add Question Modal
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [addFormPage, setAddFormPage] = useState<number>(1);
  const [addFormStem, setAddFormStem] = useState<string>("");
  const [addFormType, setAddFormType] = useState<"ordinary" | "combination">("ordinary");
  const [addFormOptions, setAddFormOptions] = useState<Array<{ letter: string; text: string }>>([
    { letter: "A", text: "" },
    { letter: "B", text: "" },
    { letter: "C", text: "" },
    { letter: "D", text: "" },
  ]);
  const [addFormStatements, setAddFormStatements] = useState<Array<{ number: number; text: string }>>([
    { number: 1, text: "" },
    { number: 2, text: "" },
    { number: 3, text: "" },
    { number: 4, text: "" },
  ]);

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

      // Merge with client IndexedDB and localStorage batches
      let localBatches: FinalApprovalBatchSummary[] = [];
      try {
        const idbBatches = await getAllApprovalBatchesFromIndexedDb();
        if (Array.isArray(idbBatches)) {
          for (const b of idbBatches) {
            localBatches.push({
              id: b.id,
              title: b.title,
              status: b.status,
              total_questions: b.total_questions || b.questions?.length || 0,
              approved_questions: b.approved_questions || b.questions?.filter((q: any) => q.isApproved).length || 0,
              flagged_questions: b.flagged_questions || b.questions?.filter((q: any) => q.needsReview).length || 0,
              created_at: b.created_at,
              updated_at: b.updated_at,
              created_by_email: b.created_by_email,
              notes: b.notes,
            });
          }
        }
      } catch {}

      try {
        const raw = localStorage.getItem("final_approval_batches_v1");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const b of list) {
              if (!localBatches.some((lb) => lb.id === b.id)) {
                localBatches.push({
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
                });
              }
            }
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
    const pending = batches.filter((b) => b.status === "pending" || b.status === "pending_approval_extraction").length;
    const readyToSolve = batches.filter((b) => b.status === "ready_to_solve").length;
    const solved = batches.filter((b) => b.status === "solved" || b.status === "pending_approval_solved").length;
    const readyToImport = batches.filter((b) => b.status === "ready_to_import" || b.status === "approved").length;
    return { total, pending, readyToSolve, solved, readyToImport };
  }, [batches]);

  // Load Batch into Split-Screen Mode
  const handleOpenBatch = async (batchId: string) => {
    try {
      setIsLoadingBatch(true);
      setActiveBatchId(batchId);
      let loadedBatch: FinalApprovalBatch | null = null;

      // 1. Try server function
      try {
        const res = await getBatchFn({ data: { batchId } });
        if (res?.batch) loadedBatch = res.batch;
      } catch (err) {
        console.warn("[FinalApproval] Server getBatch failed, checking local backup:", err);
      }

      // 2. Try IndexedDB full approval batch store
      if (!loadedBatch || !loadedBatch.questions || loadedBatch.questions.length === 0) {
        try {
          const idbBatch = await getApprovalBatchFromIndexedDb(batchId);
          if (idbBatch) {
            loadedBatch = { ...(loadedBatch || {}), ...idbBatch };
          }
        } catch (idbErr) {
          console.warn("[FinalApproval] IDB batch fetch warning:", idbErr);
        }
      }

      // 3. Try localStorage batches summary list
      if (!loadedBatch) {
        try {
          const raw = localStorage.getItem("final_approval_batches_v1");
          const list = raw ? JSON.parse(raw) : [];
          loadedBatch = list.find((b: any) => b.id === batchId) || null;
        } catch {}
      }

      // 4. Try dedicated localStorage questions key
      if (loadedBatch && (!loadedBatch.questions || loadedBatch.questions.length === 0)) {
        try {
          const rawQ = localStorage.getItem(`final_approval_questions_${batchId}`);
          if (rawQ) {
            const parsedQ = JSON.parse(rawQ);
            if (Array.isArray(parsedQ) && parsedQ.length > 0) {
              loadedBatch.questions = parsedQ;
            }
          }
        } catch {}
      }

      // 5. CRITICAL AUTO-RESCUE FOR EXISTING BATCHES:
      // If questions are still empty/missing, but batch exists, rescue questions from mcq_124_pro_extracted_questions!
      if (loadedBatch && (!loadedBatch.questions || loadedBatch.questions.length === 0)) {
        try {
          const rawExtracted = localStorage.getItem("mcq_124_pro_extracted_questions");
          if (rawExtracted) {
            const extracted = JSON.parse(rawExtracted);
            if (Array.isArray(extracted) && extracted.length > 0) {
              console.log(`[FinalApproval] Rescuing ${extracted.length} questions from mcq_124_pro_extracted_questions for batch ${batchId}`);
              const rescued = extracted.map((q: any) => ({
                ...q,
                isApproved: q.isApproved ?? false,
                needsReview: q.needsReview ?? true,
                lifecycleStatus: loadedBatch?.status || "pending_approval_extraction",
              }));
              loadedBatch.questions = rescued;
              loadedBatch.total_questions = rescued.length;

              // Save rescued questions immediately to IndexedDB and LocalStorage so it's permanently restored
              await saveApprovalBatchToIndexedDb(loadedBatch);
              try {
                localStorage.setItem(`final_approval_questions_${batchId}`, JSON.stringify(rescued));
                const rawList = localStorage.getItem("final_approval_batches_v1");
                if (rawList) {
                  const bList = JSON.parse(rawList);
                  const bIdx = bList.findIndex((b: any) => b.id === batchId);
                  if (bIdx >= 0) {
                    bList[bIdx].questions = rescued;
                    bList[bIdx].total_questions = rescued.length;
                    localStorage.setItem("final_approval_batches_v1", JSON.stringify(bList));
                  }
                }
              } catch {}
              toast.success(`Restored ${rescued.length} questions for this batch!`, { duration: 4000 });
            }
          }
        } catch (rescueErr) {
          console.warn("[FinalApproval] Auto-rescue warning:", rescueErr);
        }
      }

      if (loadedBatch) {
        if (!loadedBatch.page_images || Object.keys(loadedBatch.page_images).length === 0) {
          try {
            const batchImgs = await getSessionPageImages(batchId);
            if (batchImgs && Object.keys(batchImgs).length > 0) {
              loadedBatch.page_images = batchImgs;
            } else {
              const wsImgs = await getSessionPageImages("current_active_workspace");
              if (wsImgs && Object.keys(wsImgs).length > 0) {
                loadedBatch.page_images = wsImgs;
              } else {
                const cachedPages = await getAllCachedPageJpegs();
                if (cachedPages && Object.keys(cachedPages).length > 0) {
                  loadedBatch.page_images = cachedPages;
                }
              }
            }
          } catch {}
        }
        setActiveBatch(loadedBatch);
        setCurrentQuestions(loadedBatch.questions || []);
        if (loadedBatch.highlights) {
          setPageHighlights(loadedBatch.highlights as any);
        } else {
          setPageHighlights({});
        }
        setQaActiveIndex(0);
        setQaZoom(1);
        setQaPan({ x: 0, y: 0 });
        setQaFilter("all");
        setActiveTool("pan");
        const initialPage = loadedBatch.questions?.[0]?.pageNumber || 1;
        setViewingPageNumber(initialPage);
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
    setPageHighlights({});
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

      await deleteApprovalBatchFromIndexedDb(batchId);

      try {
        localStorage.removeItem(`final_approval_questions_${batchId}`);
      } catch {}

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

  // Keep viewingPageNumber synced when active question changes
  useEffect(() => {
    if (activeQuestion?.pageNumber) {
      setViewingPageNumber(activeQuestion.pageNumber);
    }
  }, [activeQuestion?.pageNumber]);

  const effectivePageNumber = viewingPageNumber || activeQuestion?.pageNumber || 1;

  // Auto-fetch scanned page image from cache/IndexedDB
  useEffect(() => {
    const pNum = effectivePageNumber;
    if (!pNum) return;
    if (activeBatch?.page_images?.[pNum]) return;
    if (localPageImages[pNum]) return;

    let isMounted = true;
    (async () => {
      // 1. Batch images in IndexedDB
      if (activeBatchId) {
        const batchImgs = await getSessionPageImages(activeBatchId);
        if (batchImgs?.[pNum] && isMounted) {
          const src = batchImgs[pNum].startsWith("data:") ? batchImgs[pNum] : `data:image/jpeg;base64,${batchImgs[pNum]}`;
          setLocalPageImages((prev) => ({ ...prev, [pNum]: src }));
          return;
        }
      }
      // 2. Active workspace images
      const wsImgs = await getSessionPageImages("current_active_workspace");
      if (wsImgs?.[pNum] && isMounted) {
        const src = wsImgs[pNum].startsWith("data:") ? wsImgs[pNum] : `data:image/jpeg;base64,${wsImgs[pNum]}`;
        setLocalPageImages((prev) => ({ ...prev, [pNum]: src }));
        return;
      }
      // 3. Individual page cache
      const cached = await getPageJpegFromCache(pNum);
      if (cached && isMounted) {
        const src = cached.startsWith("data:") ? cached : `data:image/jpeg;base64,${cached}`;
        setLocalPageImages((prev) => ({ ...prev, [pNum]: src }));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [effectivePageNumber, activeBatch, activeBatchId, localPageImages]);

  const currentImageSrc =
    (activeBatch?.page_images?.[effectivePageNumber]) ||
    (localPageImages[effectivePageNumber]) ||
    null;

  // Detect Duplicates
  const duplicateClusters = useMemo(() => {
    return findDuplicateClusters(currentQuestions);
  }, [currentQuestions]);

  const totalDuplicatesCount = useMemo(() => {
    return duplicateClusters.reduce((acc, g) => acc + (g.questions.length - 1), 0);
  }, [duplicateClusters]);

  // Remove All Duplicates
  const handleRemoveAllDuplicates = () => {
    if (duplicateClusters.length === 0) {
      toast.info("No duplicate questions found!");
      return;
    }

    const idsToRemove = new Set<string>();
    for (const group of duplicateClusters) {
      // Keep best question (priority: approved, then most options, then first)
      let best = group.questions[0];
      for (const q of group.questions) {
        if (q.isApproved && !best.isApproved) {
          best = q;
        } else if ((q.options?.length || 0) > (best.options?.length || 0)) {
          best = q;
        }
      }

      for (const q of group.questions) {
        if (q.id !== best.id) {
          idsToRemove.add(q.id);
        }
      }
    }

    setCurrentQuestions((prev) => prev.filter((q) => !idsToRemove.has(q.id)));
    toast.success(`Removed ${idsToRemove.size} duplicate questions! Batch is now clean.`);
    setIsDuplicatesModalOpen(false);
  };

  // Keep single question in duplicate group
  const handleKeepOnlyOneInGroup = (groupId: string, keepId: string) => {
    const group = duplicateClusters.find((g) => g.id === groupId);
    if (!group) return;
    const toRemove = group.questions.filter((q) => q.id !== keepId).map((q) => q.id);
    setCurrentQuestions((prev) => prev.filter((q) => !toRemove.includes(q.id)));
    toast.success(`Kept selected question, removed ${toRemove.length} duplicate copy(s).`);
  };

  // ── Pan & Drag Zoom Handlers ──────────────────────────────────────────────
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or middle click

    // Check if dragging/panning
    if (activeTool === "pan" || e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: qaPan.x,
        panY: qaPan.y,
      };
      return;
    }

    // Highlighting mode: begin stroke
    if (activeTool === "highlight") {
      const img = imgElementRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const newStroke: HighlightStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        color: highlightColor,
        width: 14,
        points: [{ x: relX, y: relY }],
      };
      setCurrentDrawingStroke(newStroke);
    }
  };

  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setQaPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    if (currentDrawingStroke) {
      const img = imgElementRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      setCurrentDrawingStroke((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...prev.points, { x: relX, y: relY }],
        };
      });
    }
  };

  const handleImageMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (currentDrawingStroke) {
      if (currentDrawingStroke.points.length > 1) {
        const pNum = effectivePageNumber;
        setPageHighlights((prev) => ({
          ...prev,
          [pNum]: [...(prev[pNum] || []), currentDrawingStroke],
        }));
      }
      setCurrentDrawingStroke(null);
    }
  };

  const handleResetPanZoom = () => {
    setQaZoom(1);
    setQaPan({ x: 0, y: 0 });
  };

  const handleUndoHighlight = () => {
    const pNum = effectivePageNumber;
    setPageHighlights((prev) => {
      const list = prev[pNum] || [];
      if (list.length === 0) return prev;
      return {
        ...prev,
        [pNum]: list.slice(0, list.length - 1),
      };
    });
  };

  const handleClearHighlights = () => {
    const pNum = effectivePageNumber;
    setPageHighlights((prev) => ({
      ...prev,
      [pNum]: [],
    }));
  };

  // ── Manual Add Question Handler ───────────────────────────────────────────
  const handleOpenAddQuestionModal = (targetPage?: number) => {
    const page = targetPage || effectivePageNumber;
    setAddFormPage(page);
    setAddFormStem("");
    setAddFormType("ordinary");
    setAddFormOptions([
      { letter: "A", text: "" },
      { letter: "B", text: "" },
      { letter: "C", text: "" },
      { letter: "D", text: "" },
    ]);
    setAddFormStatements([
      { number: 1, text: "" },
      { number: 2, text: "" },
      { number: 3, text: "" },
      { number: 4, text: "" },
    ]);
    setIsAddQuestionModalOpen(true);
  };

  const handleCreateManualQuestion = () => {
    if (!addFormStem.trim()) {
      toast.error("Please enter question stem / prompt");
      return;
    }

    const filteredOpts = addFormOptions.filter((o) => o.text.trim().length > 0);
    if (filteredOpts.length < 2) {
      toast.error("Please enter at least 2 options");
      return;
    }

    const newQuestion: SolvedQuestionState = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: String(currentQuestions.length + 1),
      pageNumber: addFormPage,
      stem: addFormStem.trim(),
      questionType: addFormType,
      options: filteredOpts,
      statements:
        addFormType === "combination"
          ? addFormStatements.filter((s) => s.text.trim().length > 0)
          : undefined,
      hasMissingOptions: false,
      missingOptionsCount: 0,
      detectedAnswer: null,
      comboSets: [],
      originalCombinations: [],
      solveStatus: "unsolved",
      isApproved: false,
      needsReview: false,
    };

    setCurrentQuestions((prev) => [...prev, newQuestion]);
    setIsAddQuestionModalOpen(false);
    toast.success(`Question added to Page ${addFormPage}!`);
    // Select newly added question
    setQaFilter("all");
    setQaActiveIndex(currentQuestions.length);
  };

  // ── QA Editing Handlers ───────────────────────────────────────────────────
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

  // ── Save Batch Progress & Lifecycle Transitions ───────────────────────────
  const handleSaveBatch = async (overrideStatus?: BatchStatus) => {
    if (!activeBatchId) return;
    try {
      setIsSavingBatch(true);
      const allApproved = currentQuestions.length > 0 && currentQuestions.every((q) => q.isApproved);

      let newStatus: BatchStatus = overrideStatus || activeBatch?.status || "in_review";
      if (!overrideStatus) {
        if (allApproved) {
          if (activeBatch?.status === "pending_approval_solved" || currentQuestions.some((q) => q.solveStatus === "solved")) {
            newStatus = "ready_to_import";
          } else {
            newStatus = "ready_to_solve";
          }
        }
      }

      const updatedQuestions = currentQuestions;

      try {
        await updateBatchFn({
          data: {
            batchId: activeBatchId,
            status: newStatus,
            questions: updatedQuestions,
            highlights: pageHighlights as any,
          },
        });
      } catch (err) {
        console.warn("[FinalApproval] Server update failed, continuing with local store:", err);
      }

      // Persist to IndexedDB (unlimited capacity)
      await saveApprovalBatchToIndexedDb({
        ...(activeBatch || {}),
        id: activeBatchId,
        status: newStatus,
        questions: updatedQuestions,
        highlights: pageHighlights,
        approved_questions: updatedQuestions.filter((q: any) => q.isApproved).length,
        flagged_questions: updatedQuestions.filter((q: any) => q.needsReview).length,
        total_questions: updatedQuestions.length,
        updated_at: new Date().toISOString(),
      });

      // Persist to dedicated localStorage key
      try {
        localStorage.setItem(`final_approval_questions_${activeBatchId}`, JSON.stringify(updatedQuestions));
      } catch (e) {
        console.warn("Could not save to final_approval_questions_ key:", e);
      }

      // Persist to localStorage backup
      try {
        const raw = localStorage.getItem("final_approval_batches_v1");
        if (raw) {
          const list = JSON.parse(raw);
          const idx = list.findIndex((b: any) => b.id === activeBatchId);
          if (idx >= 0) {
            list[idx].status = newStatus;
            list[idx].questions = updatedQuestions;
            list[idx].highlights = pageHighlights;
            list[idx].approved_questions = updatedQuestions.filter((q: any) => q.isApproved).length;
            list[idx].flagged_questions = updatedQuestions.filter((q: any) => q.needsReview).length;
            list[idx].total_questions = updatedQuestions.length;
            list[idx].updated_at = new Date().toISOString();
            localStorage.setItem("final_approval_batches_v1", JSON.stringify(list));
          }
        }
      } catch {}

      if (activeBatch) {
        setActiveBatch({
          ...activeBatch,
          status: newStatus,
          questions: updatedQuestions,
          highlights: pageHighlights as any,
          approved_questions: updatedQuestions.filter((q) => q.isApproved).length,
        });
      }

      toast.success(
        newStatus === "ready_to_solve"
          ? "Batch approved for solving! Ready to plot in Solver Engine."
          : newStatus === "ready_to_import"
          ? "Solutions approved! Ready to import into Course Question Bank."
          : "Batch progress saved!"
      );
      refetchBatches();
    } catch (err: any) {
      toast.error(`Error saving batch: ${err.message}`);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
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
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setActiveTool((t) => (t === "highlight" ? "pan" : "highlight"));
      }
    },
    [activeBatchId, activeQuestion, filteredQuestions.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const approvedCount = currentQuestions.filter((q) => q.isApproved).length;
  const currentPageHighlights = pageHighlights[effectivePageNumber] || [];

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
              Inspect extracted exam batches side-by-side with original scanned PDF pages. Pan & zoom scans freely, highlight key areas, add missed questions, purge duplicates, and approve questions for the Solver Engine.
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
              search={{}}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
            >
              Open MCQ Generator <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Batches</span>
            <div className="mt-1.5 text-2xl font-black text-white">{metrics.total}</div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">Pending Review</span>
            <div className="mt-1.5 text-2xl font-black text-amber-300">{metrics.pending}</div>
          </div>
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">Ready to Solve</span>
            <div className="mt-1.5 text-2xl font-black text-blue-300">{metrics.readyToSolve}</div>
          </div>
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">Solved / Review</span>
            <div className="mt-1.5 text-2xl font-black text-purple-300">{metrics.solved}</div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">Ready to Import</span>
            <div className="mt-1.5 text-2xl font-black text-emerald-300">{metrics.readyToImport}</div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-8 p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex-wrap">
            {(
              [
                ["all", "All Batches"],
                ["pending_approval_extraction", "Pending Review"],
                ["ready_to_solve", "Ready to Solve"],
                ["pending_approval_solved", "Review Solved"],
                ["ready_to_import", "Ready to Import"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                search={{}}
                className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                Go to MCQ Generator
              </Link>
            </div>
          ) : (
            batches.map((b) => {
              const pct = b.total_questions > 0 ? Math.round((b.approved_questions / b.total_questions) * 100) : 0;
              const badge = getLifecycleBadgeInfo(b.status);

              return (
                <div
                  key={b.id}
                  className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-base font-black text-white truncate">{b.title}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${badge.badgeClass}`}
                        title={badge.description}
                      >
                        {badge.label}
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

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Context Action depending on lifecycle */}
                    {b.status === "ready_to_solve" && (
                      <Link
                        to="/admin/mcq-generator-124-pro"
                        search={{ batchId: b.id, stage: "solve" }}
                        className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Layers size={13} /> Solve in Engine
                      </Link>
                    )}

                    {b.status === "ready_to_import" && (
                      <Link
                        to="/admin/mcq-generator-124-pro"
                        search={{ batchId: b.id, stage: "import" }}
                        className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Send size={13} /> Import into Course
                      </Link>
                    )}

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
          <header className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleCloseBatch}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                title="Back to Batches Queue"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <span className="text-sm font-black text-white flex items-center gap-2 truncate">
                  <CheckSquare size={16} className="text-emerald-400 shrink-0" />
                  {activeBatch?.title || "Final Approval Review"}
                </span>
              </div>

              {/* Lifecycle Badge */}
              {activeBatch && (
                <span className={`hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getLifecycleBadgeInfo(activeBatch.status).badgeClass}`}>
                  {getLifecycleBadgeInfo(activeBatch.status).label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Question Filter Pills */}
              <div className="hidden lg:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      qaFilter === key
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Duplicate Detection Badge Button */}
              {duplicateClusters.length > 0 && (
                <button
                  onClick={() => setIsDuplicatesModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                  title="Review duplicate questions before solving or importing"
                >
                  <AlertTriangle size={13} />
                  <span>{duplicateClusters.length} Duplicates ({totalDuplicatesCount} copies)</span>
                </button>
              )}

              {/* Add Question on Page Button */}
              <button
                onClick={() => handleOpenAddQuestionModal(effectivePageNumber)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Add a question that was missed on this page"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Add Question</span>
              </button>

              {/* Live Counter Badge */}
              <span className="hidden sm:inline-block px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 font-bold">
                {approvedCount} / {currentQuestions.length} Approved
              </span>

              {/* Save Progress Button */}
              <button
                onClick={() => handleSaveBatch()}
                disabled={isSavingBatch}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSavingBatch ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span className="hidden md:inline">Save</span>
              </button>

              {/* Approve for Solving / Approve for Import Action Button */}
              {activeBatch?.status === "pending_approval_solved" ? (
                <button
                  onClick={() => handleSaveBatch("ready_to_import")}
                  disabled={isSavingBatch}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 size={14} /> Approve for Import
                </button>
              ) : activeBatch?.status === "ready_to_import" ? (
                <Link
                  to="/admin/mcq-generator-124-pro"
                  search={{ batchId: activeBatchId, stage: "import" }}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <Send size={14} /> Return to Generator to Import
                </Link>
              ) : activeBatch?.status === "ready_to_solve" ? (
                <Link
                  to="/admin/mcq-generator-124-pro"
                  search={{ batchId: activeBatchId, stage: "solve" }}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <Layers size={14} /> Open in Solver Engine
                </Link>
              ) : (
                <button
                  onClick={() => handleSaveBatch("ready_to_solve")}
                  disabled={isSavingBatch}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Mark approved and prepare questions for MCQ Solving Engine"
                >
                  <CheckCircle2 size={14} /> Approve for Solving
                </button>
              )}

              <button
                onClick={handleCloseBatch}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
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
              {/* ── LEFT 50%: Original Scanned PDF Page with Pan & Highlight ── */}
              <div className="bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden">
                {/* Document Viewer Toolbar */}
                <div className="p-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0 gap-2 flex-wrap">
                  {/* Page Navigation */}
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-cyan-400" />
                    <span className="font-bold text-white hidden sm:inline">Scanned Page:</span>
                    <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setViewingPageNumber((p) => Math.max(1, p - 1))}
                        disabled={viewingPageNumber <= 1}
                        className="p-0.5 rounded text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Previous Page"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="font-mono text-cyan-300 font-bold px-1">
                        Page {effectivePageNumber}
                      </span>
                      <button
                        onClick={() => setViewingPageNumber((p) => p + 1)}
                        className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                        title="Next Page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Tool Switcher: Pan vs Highlight */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setActiveTool("pan")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        activeTool === "pan"
                          ? "bg-slate-800 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                      title="Pan Mode (Drag mouse to move image in any direction)"
                    >
                      <Hand size={13} />
                      <span>Pan</span>
                    </button>
                    <button
                      onClick={() => setActiveTool("highlight")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        activeTool === "highlight"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "text-slate-400 hover:text-white"
                      }`}
                      title="Highlight Mode (Draw marker lines directly on scan)"
                    >
                      <Highlighter size={13} />
                      <span>Highlight</span>
                    </button>
                  </div>

                  {/* Highlight Color & Actions (when highlight mode active) */}
                  {activeTool === "highlight" && (
                    <div className="flex items-center gap-1.5">
                      {[
                        { color: "#facc15", label: "Yellow" },
                        { color: "#10b981", label: "Emerald" },
                        { color: "#06b6d4", label: "Cyan" },
                        { color: "#f43f5e", label: "Rose" },
                      ].map((c) => (
                        <button
                          key={c.color}
                          onClick={() => setHighlightColor(c.color)}
                          style={{ backgroundColor: c.color }}
                          className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                            highlightColor === c.color ? "scale-125 ring-2 ring-white" : "opacity-80"
                          }`}
                          title={`Marker: ${c.label}`}
                        />
                      ))}
                      <button
                        onClick={handleUndoHighlight}
                        disabled={currentPageHighlights.length === 0}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer ml-1"
                        title="Undo Last Highlight"
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        onClick={handleClearHighlights}
                        disabled={currentPageHighlights.length === 0}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] disabled:opacity-40 cursor-pointer"
                        title="Clear Page Highlights"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQaZoom((z) => Math.max(0.5, z - 0.2))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="font-mono text-[11px] w-9 text-center text-slate-300">
                      {Math.round(qaZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setQaZoom((z) => Math.min(3.0, z + 0.2))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      onClick={handleResetPanZoom}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold ml-1 cursor-pointer"
                      title="Reset Zoom & Pan to Center"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Scanned Image Viewer (Mouse Drag Pan & Highlight Layer) */}
                <div
                  className="flex-1 overflow-hidden relative flex items-center justify-center bg-slate-950/90 select-none cursor-default"
                  onMouseDown={handleImageMouseDown}
                  onMouseMove={handleImageMouseMove}
                  onMouseUp={handleImageMouseUp}
                  onMouseLeave={handleImageMouseUp}
                >
                  {currentImageSrc ? (
                    <div
                      style={{
                        transform: `translate(${qaPan.x}px, ${qaPan.y}px) scale(${qaZoom})`,
                        transformOrigin: "center center",
                        transition: isPanning || currentDrawingStroke ? "none" : "transform 0.1s ease-out",
                        cursor:
                          activeTool === "highlight"
                            ? "crosshair"
                            : isPanning
                            ? "grabbing"
                            : "grab",
                      }}
                      className="relative inline-block select-none shadow-2xl rounded-lg overflow-hidden border border-slate-700 max-w-full"
                    >
                      {/* Scanned JPEG Image */}
                      <img
                        ref={imgElementRef}
                        src={currentImageSrc.startsWith("data:") ? currentImageSrc : `data:image/jpeg;base64,${currentImageSrc}`}
                        alt={`Scanned Page ${effectivePageNumber}`}
                        draggable={false}
                        className="w-full h-auto block select-none pointer-events-none"
                      />

                      {/* SVG Highlighting Overlay */}
                      <svg
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        style={{ mixBlendMode: "multiply" }}
                      >
                        {currentPageHighlights.map((stroke) => (
                          <polyline
                            key={stroke.id}
                            points={stroke.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                            fill="none"
                            stroke={stroke.color}
                            strokeWidth={stroke.width || 14}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.65}
                          />
                        ))}

                        {currentDrawingStroke && (
                          <polyline
                            points={currentDrawingStroke.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                            fill="none"
                            stroke={currentDrawingStroke.color}
                            strokeWidth={currentDrawingStroke.width || 14}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.65}
                          />
                        )}
                      </svg>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-slate-500 text-center">
                      <FileText size={40} className="mb-3 text-slate-600" />
                      <p className="text-sm font-bold text-slate-300">No Image Scan for Page {effectivePageNumber}</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        This page was not included in cached scan images. You can still inspect and edit questions extracted from this page.
                      </p>
                      <button
                        onClick={() => handleOpenAddQuestionModal(effectivePageNumber)}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} /> Add Question on Page {effectivePageNumber}
                      </button>
                    </div>
                  )}

                  {/* Bottom Tool Hint */}
                  <div className="absolute bottom-2 left-2 pointer-events-none bg-slate-900/80 backdrop-blur border border-slate-800 px-2 py-1 rounded-lg text-[10px] text-slate-400">
                    {activeTool === "pan" ? "Drag mouse to pan freely • Hold Shift or use buttons to zoom" : "Drag mouse over text to highlight • Press H to switch to Pan"}
                  </div>
                </div>
              </div>

              {/* ── RIGHT 50%: Rapid Question Editor & Solution QA ── */}
              <div className="bg-slate-900/60 flex flex-col overflow-hidden">
                {activeQuestion ? (
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Header: Question Number, Approval Status, Type Switcher */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white font-mono bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                          Q #{qaActiveIndex + 1}
                        </span>
                        {activeQuestion.pageNumber && (
                          <span className="text-xs font-bold text-slate-400 font-mono bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                            Page {activeQuestion.pageNumber}
                          </span>
                        )}
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeQuestion.questionType !== "combination"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Ordinary MCQ
                        </button>
                        <button
                          onClick={() => handleToggleType(activeQuestion.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeQuestion.questionType === "combination"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Combination MCQ
                        </button>
                      </div>
                    </div>

                    {/* 1-Click Smart Fixes Toolbar */}
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
                        onClick={() => handleOpenAddQuestionModal(activeQuestion.pageNumber)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Add missing question right after this on Page"
                      >
                        <Plus size={12} /> Add Question Here
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

                    {/* ── PHASE 4: SOLUTION & EXPLANATION VERIFICATION PANEL ── */}
                    {(activeQuestion.solveStatus === "solved" || activeQuestion.clinicalExplanation || activeQuestion.modelAnswer) && (
                      <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-800/40 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen size={14} /> Solution & Clinical Explanation QA
                          </span>
                          {activeQuestion.confidenceScore && (
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[11px] font-bold">
                              Confidence: {Math.round(activeQuestion.confidenceScore * 100)}%
                            </span>
                          )}
                        </div>

                        {/* Model Answer Option */}
                        <div>
                          <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                            Verified Correct Answer Option
                          </label>
                          <div className="flex items-center gap-2">
                            {["A", "B", "C", "D", "E"].map((letter) => (
                              <button
                                key={letter}
                                onClick={() => {
                                  setCurrentQuestions((prev) =>
                                    prev.map((q) => (q.id === activeQuestion.id ? { ...q, modelAnswer: letter } : q))
                                  );
                                }}
                                className={`w-9 h-9 rounded-xl font-mono font-black text-xs transition-all cursor-pointer ${
                                  activeQuestion.modelAnswer?.toUpperCase() === letter
                                    ? "bg-purple-500 text-white shadow-lg shadow-purple-500/30 scale-105"
                                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
                                }`}
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Clinical Explanation */}
                        <div>
                          <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                            Clinical Explanation
                          </label>
                          <textarea
                            value={activeQuestion.clinicalExplanation || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCurrentQuestions((prev) =>
                                prev.map((q) => (q.id === activeQuestion.id ? { ...q, clinicalExplanation: val } : q))
                              );
                            }}
                            rows={4}
                            className="w-full bg-slate-950 border border-purple-900/50 focus:border-purple-400 rounded-xl p-3 text-xs text-white focus:outline-none transition-colors leading-relaxed font-sans"
                            placeholder="Clinical explanation rationale for the correct answer..."
                          />
                        </div>
                      </div>
                    )}

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
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm p-6 text-center">
                    <CheckCircle2 size={40} className="text-emerald-400 mb-2" />
                    <span className="font-bold text-slate-300">All questions in this view are approved!</span>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Switch filter to "All" or click below to add a question on this page.
                    </p>
                    <button
                      onClick={() => handleOpenAddQuestionModal(effectivePageNumber)}
                      className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={13} /> Add Question on Page {effectivePageNumber}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MODAL: DUPLICATE QUESTIONS REVIEW ───────────────────────────── */}
          {isDuplicatesModalOpen && (
            <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <header className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-400" />
                    <h3 className="text-base font-black text-white">
                      Duplicate Questions Review ({duplicateClusters.length} Groups)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRemoveAllDuplicates}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} /> Remove All Duplicates
                    </button>
                    <button
                      onClick={() => setIsDuplicatesModalOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {duplicateClusters.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      No duplicates detected in this batch.
                    </div>
                  ) : (
                    duplicateClusters.map((group, gIdx) => (
                      <div key={group.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                            Duplicate Cluster #{gIdx + 1} ({group.questions.length} Copies)
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Stem: "{group.stemSnippet}"
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.questions.map((q, qIdx) => (
                            <div
                              key={q.id}
                              className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between text-xs space-y-2"
                            >
                              <div>
                                <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 mb-1">
                                  <span>Question #{q.number || qIdx + 1}</span>
                                  <span>Page {q.pageNumber || "N/A"}</span>
                                  {q.isApproved && (
                                    <span className="text-emerald-400 font-bold">✓ Approved</span>
                                  )}
                                </div>
                                <p className="text-slate-200 line-clamp-2">{q.stem}</p>
                                <div className="mt-2 space-y-0.5 text-slate-400 text-[11px]">
                                  {q.options?.map((opt) => (
                                    <div key={opt.letter} className="truncate">
                                      <strong className="text-slate-300">{opt.letter}:</strong> {opt.text}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <button
                                onClick={() => handleKeepOnlyOneInGroup(group.id, q.id)}
                                className="w-full mt-2 px-2.5 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer"
                              >
                                Keep This One & Discard Others
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── MODAL: MANUAL ADD QUESTION ON THIS PAGE ─────────────────────── */}
          {isAddQuestionModalOpen && (
            <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <header className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={18} className="text-cyan-400" />
                    <h3 className="text-base font-black text-white">
                      Add Missed Question on Page {addFormPage}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsAddQuestionModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Page & Type Selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                        Target Page Number
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={addFormPage}
                        onChange={(e) => setAddFormPage(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                        Question Format
                      </label>
                      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setAddFormType("ordinary")}
                          className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            addFormType === "ordinary" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400"
                          }`}
                        >
                          Ordinary
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddFormType("combination")}
                          className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            addFormType === "combination" ? "bg-amber-500/20 text-amber-300" : "text-slate-400"
                          }`}
                        >
                          Combination
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stem */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Question Prompt / Stem
                    </label>
                    <textarea
                      value={addFormStem}
                      onChange={(e) => setAddFormStem(e.target.value)}
                      rows={3}
                      placeholder="e.g. 15. The characteristic sign of meningococcal meningitis is:"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl p-3 text-xs text-white focus:outline-none"
                    />
                  </div>

                  {/* Numbered Statements (if combination) */}
                  {addFormType === "combination" && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                        Premise Statements (1, 2, 3...)
                      </label>
                      <div className="space-y-2">
                        {addFormStatements.map((st, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded bg-slate-800 text-amber-300 font-mono text-xs flex items-center justify-center shrink-0">
                              {st.number}
                            </span>
                            <input
                              type="text"
                              value={st.text}
                              placeholder={`Statement ${st.number}...`}
                              onChange={(e) => {
                                const copy = [...addFormStatements];
                                copy[sIdx].text = e.target.value;
                                setAddFormStatements(copy);
                              }}
                              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Options */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Answer Choices (A, B, C, D)
                    </label>
                    <div className="space-y-2">
                      {addFormOptions.map((opt, oIdx) => (
                        <div key={opt.letter} className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded bg-slate-800 text-slate-200 font-mono text-xs flex items-center justify-center shrink-0">
                            {opt.letter}
                          </span>
                          <input
                            type="text"
                            value={opt.text}
                            placeholder={`Choice ${opt.letter}...`}
                            onChange={(e) => {
                              const copy = [...addFormOptions];
                              copy[oIdx].text = e.target.value;
                              setAddFormOptions(copy);
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <footer className="p-4 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950">
                  <button
                    onClick={() => setIsAddQuestionModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateManualQuestion}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg cursor-pointer"
                  >
                    Add Question to Batch
                  </button>
                </footer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminFinalApproval;
