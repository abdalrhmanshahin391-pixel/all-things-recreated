import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldAlert, ShieldCheck, Lock, Unlock, Key, Cpu, Sparkles, FileText, CheckCircle2,
  AlertTriangle, ArrowRight, RefreshCw, Upload, Eye, Trash2, Check, X, Layers,
  BookOpen, ListFilter, Copy, HelpCircle, Terminal, Flame, Database, ChevronRight,
  ExternalLink, ChevronDown, ChevronUp, Search, PlusCircle, Wrench, Square,
  Clock, Bookmark, Download, FolderArchive, Play, Radio, Edit3
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ENGINE_NAME,
  SUPPORTED_MODELS,
  SupportedModelId,
  ExtractedQuestion,
  extractPageQuestions124,
  fillMissingOptions124,
  fillAllMissingOptions124,
  detectDuplicates124,
  solveAndExplain124,
  importQuestions124,
  createOpenAiBatchExtraction124,
  checkOpenAiBatchStatus124,
  retrieveOpenAiBatchExtractionResults124,
  createOpenAiBatchSolving124,
  retrieveOpenAiBatchSolvingResults124,
} from "@/lib/mcq-generator-124-pro.functions";
import { renderPageToCanvas, canvasToJpegBase64 } from "@/lib/pdf-page-image";

export const Route = createFileRoute("/admin/mcq-generator-124-pro")({
  head: () => ({
    meta: [
      { title: "MCQ Generator 1.24 Pro [RESTRICTED] — AquaQBank" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: McqGenerator124ProPage,
});

const DEFAULT_OPENAI_KEY = "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";

type Stage = "extract" | "solve" | "import" | "archive";
type ProcessingMode = "standard" | "batch";
type ComboMode = "mode1_keep_original" | "mode2_convert_multiple";
type SolveSource = "ai" | "source_material" | "answer_key";

export interface SolvedQuestionState extends ExtractedQuestion {
  selectedAnswer?: string;
  concept?: string;
  sourceReference?: string;
  explanation?: string;
  summaryTable?: string;
  solveStatus: "unsolved" | "solving" | "solved" | "error";
  solveError?: string;
  isIgnored?: boolean;
}

export interface SavedEngineSession {
  id: string;
  name: string;
  createdAt: string;
  pdfName: string;
  totalPages: number;
  model: string;
  comboMode: ComboMode;
  questions: SolvedQuestionState[];
  isSolved: boolean;
  isImported?: boolean;
}

export function McqGenerator124ProPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  // ── Clearance Gate State ──────────────────────────────────────────────────
  const [clearanceUnlocked, setClearanceUnlocked] = useState(false);

  // ── Engine Configuration ──────────────────────────────────────────────────
  const [openaiKey, setOpenaiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mcq_124_pro_openai_key") || DEFAULT_OPENAI_KEY;
    }
    return DEFAULT_OPENAI_KEY;
  });
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mcq_124_pro_gemini_key") || "";
    }
    return "";
  });
  const [selectedModel, setSelectedModel] = useState<SupportedModelId>("gpt-4o-mini");
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("standard");
  const [comboMode, setComboMode] = useState<ComboMode>("mode1_keep_original");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [includeSourceCitation, setIncludeSourceCitation] = useState<boolean>(true);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);

  // ── Pipeline Stage ────────────────────────────────────────────────────────
  const [currentStage, setCurrentStage] = useState<Stage>("extract");

  // ── Stage 1: Extraction State ─────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [extractedQuestions, setExtractedQuestions] = useState<SolvedQuestionState[]>([]);
  const [stage1Done, setStage1Done] = useState<boolean>(false);
  const [isBulkFillingOptions, setIsBulkFillingOptions] = useState<boolean>(false);

  // Stop flag ref for emergency halt
  const stopRequestedRef = useRef<boolean>(false);
  const [isStopRequested, setIsStopRequested] = useState<boolean>(false);

  // Batch Job State
  const [batchJob, setBatchJob] = useState<{
    batchId: string;
    status: string;
    totalPages: number;
    requestCounts: { total: number; completed: number; failed: number };
    outputFileId?: string | null;
  } | null>(null);

  // Missing options modal/drawer
  const [resolvingMissingQ, setResolvingMissingQ] = useState<SolvedQuestionState | null>(null);
  const [manualOptionText, setManualOptionText] = useState<string>("");

  // ── Stage 2: Solving State ────────────────────────────────────────────────
  const [solveProcessingMode, setSolveProcessingMode] = useState<ProcessingMode>("standard");
  const [solveSource, setSolveSource] = useState<SolveSource>("ai");
  const [studyMaterialText, setStudyMaterialText] = useState<string>("");
  const [studyMaterialName, setStudyMaterialName] = useState<string>("");
  const [answerKeyText, setAnswerKeyText] = useState<string>("");
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [isCreatingBatchSolve, setIsCreatingBatchSolve] = useState<boolean>(false);
  const [batchSolveJob, setBatchSolveJob] = useState<{
    batchId: string;
    status: string;
    totalQuestions: number;
    requestCounts: { total: number; completed: number; failed: number };
    outputFileId?: string | null;
  } | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("mcq_124_pro_batch_solve_job");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [solveProgress, setSolveProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [stage2Done, setStage2Done] = useState<boolean>(false);

  // ── Stage 3: Import State ─────────────────────────────────────────────────
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  // ── Saved Sessions Archive ────────────────────────────────────────────────
  const [savedSessions, setSavedSessions] = useState<SavedEngineSession[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("mcq_124_pro_saved_sessions");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [sessionSaveName, setSessionSaveName] = useState<string>("");

  // Inspector Preview Modal
  const [inspectingQuestion, setInspectingQuestion] = useState<SolvedQuestionState | null>(null);

  // ── Server Functions ──────────────────────────────────────────────────────
  const extractPageFn = useServerFn(extractPageQuestions124);
  const fillMissingFn = useServerFn(fillMissingOptions124);
  const fillAllMissingFn = useServerFn(fillAllMissingOptions124);
  const solveQuestionFn = useServerFn(solveAndExplain124);
  const importFn = useServerFn(importQuestions124);
  const createBatchExtractFn = useServerFn(createOpenAiBatchExtraction124);
  const checkBatchStatusFn = useServerFn(checkOpenAiBatchStatus124);
  const retrieveBatchResultsFn = useServerFn(retrieveOpenAiBatchExtractionResults124);
  const createBatchSolveFn = useServerFn(createOpenAiBatchSolving124);
  const retrieveBatchSolveResultsFn = useServerFn(retrieveOpenAiBatchSolvingResults124);

  // Persist batch solve job
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (batchSolveJob) {
        localStorage.setItem("mcq_124_pro_batch_solve_job", JSON.stringify(batchSolveJob));
      } else {
        localStorage.removeItem("mcq_124_pro_batch_solve_job");
      }
    }
  }, [batchSolveJob]);

  // Save keys to local storage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcq_124_pro_openai_key", openaiKey);
    }
  }, [openaiKey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcq_124_pro_gemini_key", geminiKey);
    }
  }, [geminiKey]);

  // Persist saved sessions
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mcq_124_pro_saved_sessions", JSON.stringify(savedSessions));
    }
  }, [savedSessions]);

  // Load courses
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("id,title").order("created_at", { ascending: false });
      setCourses(data ?? []);
    })();
  }, []);

  // Load groups when course changes
  useEffect(() => {
    if (!selectedCourseId) {
      setGroups([]);
      setSelectedGroupId("");
      return;
    }
    (async () => {
      const { data } = await supabase.from("subject_groups").select("id,name").eq("course_id", selectedCourseId).order("sort_order");
      setGroups(data ?? []);
      setSelectedGroupId("");
    })();
  }, [selectedCourseId]);

  // Load subjects when group changes
  useEffect(() => {
    if (!selectedGroupId) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }
    (async () => {
      const { data } = await supabase.from("subjects").select("id,name").eq("group_id", selectedGroupId).order("sort_order");
      setSubjects(data ?? []);
      setSelectedSubjectId("");
    })();
  }, [selectedGroupId]);

  // ── PDF Handler ───────────────────────────────────────────────────────────
  async function handlePdfSelect(file: File) {
    try {
      setPdfFile(file);
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setSessionSaveName(file.name.replace(/\.[^/.]+$/, ""));
      toast.success(`PDF Loaded: ${file.name} (${doc.numPages} pages)`);
    } catch (err: any) {
      toast.error(`Failed to load PDF: ${err?.message || err}`);
    }
  }

  // ── Render Page Thumbnail ─────────────────────────────────────────────────
  async function getPageJpeg(pageNum: number): Promise<string> {
    if (pageThumbnails[pageNum]) return pageThumbnails[pageNum];
    if (!pdfDoc) throw new Error("PDF Document not loaded");
    const canvas = await renderPageToCanvas(pdfDoc, pageNum, 2000);
    const jpeg = canvasToJpegBase64(canvas, 0.90);
    setPageThumbnails((prev) => ({ ...prev, [pageNum]: jpeg }));
    return jpeg;
  }

  // ── Start Stage 1 Extraction (All Pages) ──────────────────────────────────
  async function startExtraction() {
    if (!pdfDoc) {
      toast.error("Please upload an exam PDF first.");
      return;
    }
    const activeKey = selectedModel.startsWith("gemini") ? geminiKey : openaiKey;
    if (!activeKey?.trim()) {
      toast.error(`Please provide an API key for ${selectedModel}.`);
      setShowConfigPanel(true);
      return;
    }

    stopRequestedRef.current = false;
    setIsStopRequested(false);
    setIsExtracting(true);
    setStage1Done(false);

    // Standard Mode: Process ALL pages from 1 to totalPages
    if (processingMode === "standard") {
      setExtractProgress({ current: 0, total: totalPages });
      const collected: SolvedQuestionState[] = [];

      try {
        for (let p = 1; p <= totalPages; p++) {
          if (stopRequestedRef.current) {
            toast.info(`Extraction halted on page ${p - 1}. Keeping all extracted questions.`);
            break;
          }

          setExtractProgress({ current: p, total: totalPages });
          const jpegBase64 = await getPageJpeg(p);

          const res: any = await extractPageFn({
            data: {
              pageNumber: p,
              imageJpegBase64: jpegBase64,
              combinationMode: comboMode,
              model: selectedModel,
              openaiApiKey: openaiKey,
              geminiApiKey: geminiKey,
              customInstructions,
            },
          });

          const pageQs: SolvedQuestionState[] = (res.questions || []).map((q: ExtractedQuestion) => ({
            ...q,
            solveStatus: "unsolved",
          }));
          collected.push(...pageQs);
          setExtractedQuestions([...collected]);
        }

        const { cleaned, duplicateCount } = detectDuplicates124(collected);
        setExtractedQuestions(cleaned);
        setStage1Done(true);

        if (duplicateCount > 0) {
          toast.info(`Extracted ${cleaned.length} questions across all ${totalPages} pages. Purged ${duplicateCount} duplicate questions.`);
        } else {
          toast.success(`Extracted ${cleaned.length} questions successfully across all ${totalPages} pages!`);
        }
      } catch (err: any) {
        toast.error(`Extraction failed: ${err?.message || err}`);
      } finally {
        setIsExtracting(false);
      }
    } else {
      // ── BATCH API MODE (50% Price Discount) ─────────────────────────────────
      try {
        toast.loading("Rendering all pages and creating Batch API job...", { id: "batch-create" });
        const pagesPayload: Array<{ pageNumber: number; imageJpegBase64: string }> = [];

        for (let p = 1; p <= totalPages; p++) {
          const jpeg = await getPageJpeg(p);
          pagesPayload.push({ pageNumber: p, imageJpegBase64: jpeg });
        }

        const res: any = await createBatchExtractFn({
          data: {
            pages: pagesPayload,
            combinationMode: comboMode,
            model: selectedModel,
            openaiApiKey: openaiKey,
            customInstructions,
          },
        });

        setBatchJob({
          batchId: res.batchId,
          status: res.status,
          totalPages: res.totalPages,
          requestCounts: { total: res.totalPages, completed: 0, failed: 0 },
        });

        toast.success(`Batch Job Submitted! Batch ID: ${res.batchId} (50% Discount Applied)`, { id: "batch-create" });
      } catch (err: any) {
        toast.error(`Batch submission failed: ${err?.message || err}`, { id: "batch-create" });
      } finally {
        setIsExtracting(false);
      }
    }
  }

  // ── Poll / Check Batch Job Status ─────────────────────────────────────────
  async function checkBatchStatus() {
    if (!batchJob?.batchId) return;
    try {
      const res: any = await checkBatchStatusFn({
        data: {
          batchId: batchJob.batchId,
          openaiApiKey: openaiKey,
        },
      });

      setBatchJob((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              requestCounts: res.requestCounts,
              outputFileId: res.outputFileId,
            }
          : null
      );

      if (res.status === "completed") {
        toast.success("Batch Job Completed! Ready to download and view questions.");
      } else {
        toast.info(`Batch Status: ${res.status} (${res.requestCounts.completed}/${res.requestCounts.total} completed)`);
      }
    } catch (err: any) {
      toast.error(`Status check failed: ${err?.message || err}`);
    }
  }

  // ── Retrieve Batch Job Results ────────────────────────────────────────────
  async function retrieveBatchResults() {
    if (!batchJob?.outputFileId) {
      toast.error("No output file available yet. Batch is still processing.");
      return;
    }

    try {
      toast.loading("Retrieving and parsing batch results...", { id: "batch-load" });
      const res: any = await retrieveBatchResultsFn({
        data: {
          outputFileId: batchJob.outputFileId,
          openaiApiKey: openaiKey,
        },
      });

      const qs: SolvedQuestionState[] = (res.questions || []).map((q: ExtractedQuestion) => ({
        ...q,
        solveStatus: "unsolved",
      }));

      const { cleaned } = detectDuplicates124(qs);
      setExtractedQuestions(cleaned);
      setStage1Done(true);
      toast.success(`Loaded ${cleaned.length} questions from Batch API!`, { id: "batch-load" });
    } catch (err: any) {
      toast.error(`Failed to retrieve batch results: ${err?.message || err}`, { id: "batch-load" });
    }
  }

  // ── Emergency Stop Handler (Point 3) ──────────────────────────────────────
  function handleEmergencyStop() {
    stopRequestedRef.current = true;
    setIsStopRequested(true);
    toast.warning("Halt requested. Finishing current item then stopping...");
  }

  // ── Auto-Fill ALL Missing Options with AI (Point 2) ───────────────────────
  async function handleAutoFillAllMissing() {
    const incomplete = extractedQuestions.filter((q) => q.hasMissingOptions || q.options.length < 4);
    if (incomplete.length === 0) {
      toast.info("All questions already have 4 complete options.");
      return;
    }

    setIsBulkFillingOptions(true);
    toast.loading(`AI is generating plausible distractors for ${incomplete.length} questions...`, { id: "fill-all" });

    try {
      const res: any = await fillAllMissingFn({
        data: {
          questions: incomplete.map((q) => ({
            id: q.id,
            stem: q.stem,
            options: q.options,
          })),
          model: selectedModel,
          openaiApiKey: openaiKey,
          geminiApiKey: geminiKey,
        },
      });

      const updatedMap: Record<string, Array<{ letter: string; text: string }>> = res.updatedMap || {};

      setExtractedQuestions((prev) =>
        prev.map((item) => {
          if (updatedMap[item.id]) {
            return {
              ...item,
              options: updatedMap[item.id],
              hasMissingOptions: false,
              missingOptionsCount: 0,
            };
          }
          return item;
        })
      );

      toast.success(`All ${incomplete.length} questions completed with 4 options!`, { id: "fill-all" });
    } catch (err: any) {
      toast.error(`Bulk option generation failed: ${err?.message || err}`, { id: "fill-all" });
    } finally {
      setIsBulkFillingOptions(false);
    }
  }

  // Manual Add Option (Single)
  function handleManualAddOption(q: SolvedQuestionState) {
    if (!manualOptionText.trim()) return;
    const letters = ["A", "B", "C", "D", "E"];
    const nextLetter = letters[q.options.length] || "D";
    const updatedOptions = [...q.options, { letter: nextLetter, text: manualOptionText.trim() }];
    const stillMissing = updatedOptions.length < 4;

    setExtractedQuestions((prev) =>
      prev.map((item) =>
        item.id === q.id
          ? {
              ...item,
              options: updatedOptions,
              hasMissingOptions: stillMissing,
              missingOptionsCount: stillMissing ? 4 - updatedOptions.length : 0,
            }
          : item
      )
    );
    setManualOptionText("");
    if (!stillMissing) setResolvingMissingQ(null);
    toast.success(`Option ${nextLetter} added`);
  }

  // AI Fill Single Question
  async function handleAiFillMissing(q: SolvedQuestionState) {
    try {
      toast.loading("Generating plausible medical distractors with AI...", { id: "fill-ai" });
      const res: any = await fillMissingFn({
        data: {
          stem: q.stem,
          currentOptions: q.options,
          model: selectedModel,
          openaiApiKey: openaiKey,
          geminiApiKey: geminiKey,
        },
      });

      setExtractedQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id
            ? {
                ...item,
                options: res.options,
                hasMissingOptions: false,
                missingOptionsCount: 0,
              }
            : item
        )
      );
      toast.success("Options completed!", { id: "fill-ai" });
      setResolvingMissingQ(null);
    } catch (err: any) {
      toast.error(`AI distractor generation failed: ${err?.message || err}`, { id: "fill-ai" });
    }
  }

  // ── Question Editing, Deletion & Approval in Extraction Phase ──────────────
  const [editingQuestion, setEditingQuestion] = useState<SolvedQuestionState | null>(null);
  const [editNumber, setEditNumber] = useState<string>("");
  const [editType, setEditType] = useState<"ordinary" | "combination" | "multiple_answer">("ordinary");
  const [editStem, setEditStem] = useState<string>("");
  const [editOptions, setEditOptions] = useState<Array<{ letter: string; text: string }>>([]);

  function openEditQuestion(q: SolvedQuestionState) {
    setEditingQuestion(q);
    setEditNumber(q.number || "");
    setEditType((q.questionType as any) || "ordinary");
    setEditStem(q.stem || "");
    setEditOptions(q.options.map((o) => ({ letter: o.letter, text: o.text })));
  }

  function handleSaveEditedQuestion() {
    if (!editingQuestion) return;
    if (!editStem.trim()) {
      toast.error("Question stem cannot be empty.");
      return;
    }

    const cleanOptions = editOptions
      .map((o, idx) => ({
        letter: o.letter.trim() || String.fromCharCode(65 + idx),
        text: o.text.trim(),
      }))
      .filter((o) => o.text);

    const isTwoChoice = cleanOptions.length === 2 && cleanOptions.some((o) => /^(true|false|yes|no)$/i.test(o.text));
    const hasMissing = cleanOptions.length < 4 && !isTwoChoice;

    setExtractedQuestions((prev) =>
      prev.map((item) => {
        if (item.id === editingQuestion.id) {
          return {
            ...item,
            number: editNumber.trim() || item.number,
            questionType: editType,
            stem: editStem.trim(),
            options: cleanOptions,
            hasMissingOptions: hasMissing,
            missingOptionsCount: hasMissing ? 4 - cleanOptions.length : 0,
            needsReview: false,
            reviewReason: null,
            isApproved: true,
          };
        }
        return item;
      })
    );

    toast.success(`Question #${editNumber || editingQuestion.number} updated & approved!`);
    setEditingQuestion(null);
  }

  function handleDeleteQuestion(id: string) {
    setExtractedQuestions((prev) => prev.filter((item) => item.id !== id));
    if (editingQuestion?.id === id) setEditingQuestion(null);
    if (resolvingMissingQ?.id === id) setResolvingMissingQ(null);
    if (inspectingQuestion?.id === id) setInspectingQuestion(null);
    toast.success("Question deleted from workspace");
  }

  function handleApproveQuestion(id: string) {
    setExtractedQuestions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            needsReview: false,
            reviewReason: null,
            isApproved: true,
          };
        }
        return item;
      })
    );
    toast.success("Question approved!");
  }

  // ── Start Stage 2 Solving & Explaining ────────────────────────────────────
  async function startSolving() {
    if (solveProcessingMode === "batch") {
      await handleStartBatchSolving();
      return;
    }

    const unapproved = extractedQuestions.filter((q) => q.isApproved === false && !q.isIgnored && !q.isDuplicate);
    if (unapproved.length > 0) {
      toast.info(`Skipping ${unapproved.length} unapproved/fragmented question(s). You can review/approve them in Phase 1.`);
    }

    const active = extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate && q.isApproved !== false);
    if (active.length === 0) {
      toast.error("No approved active questions to solve. Please approve or complete any pending questions.");
      return;
    }

    stopRequestedRef.current = false;
    setIsStopRequested(false);
    setIsSolving(true);
    setStage2Done(false);
    setSolveProgress({ current: 0, total: active.length });

    let currentIdx = 0;
    const updated = [...extractedQuestions];

    for (let i = 0; i < updated.length; i++) {
      const q = updated[i];
      if (q.isIgnored || q.isDuplicate || q.isApproved === false) continue;

      if (stopRequestedRef.current) {
        toast.info(`Solving stopped on question #${q.number}. Retained all solved questions.`);
        break;
      }

      currentIdx++;
      setSolveProgress({ current: currentIdx, total: active.length });

      try {
        q.solveStatus = "solving";
        setExtractedQuestions([...updated]);

        const res: any = await solveQuestionFn({
          data: {
            question: {
              id: q.id,
              number: q.number,
              stem: q.stem,
              questionType: q.questionType,
              options: q.options,
              comboSets: q.comboSets,
              originalCombinations: q.originalCombinations,
              detectedAnswer: q.detectedAnswer,
            },
            sourceMethod: solveSource,
            studyMaterialText,
            studyMaterialName,
            includeSourceCitation,
            answerKeyText,
            combinationMode: comboMode,
            model: selectedModel,
            openaiApiKey: openaiKey,
            geminiApiKey: geminiKey,
          },
        });

        q.selectedAnswer = res.selectedAnswer;
        q.options = res.options;
        q.concept = res.concept;
        q.sourceReference = res.sourceReference;
        q.explanation = res.explanation;
        q.summaryTable = res.summaryTable;
        q.solveStatus = "solved";
        setExtractedQuestions([...updated]);
      } catch (err: any) {
        q.solveStatus = "error";
        q.solveError = err?.message || String(err);
        setExtractedQuestions([...updated]);
      }
    }

    setIsSolving(false);
    setStage2Done(true);
    toast.success("Solving & AquavisionX Explanations complete!");
  }

  // ── Stage 2 Batch Solving Handlers (50% Cost Savings) ─────────────────────
  async function handleStartBatchSolving() {
    const unapproved = extractedQuestions.filter((q) => q.isApproved === false && !q.isIgnored && !q.isDuplicate);
    if (unapproved.length > 0) {
      toast.info(`Skipping ${unapproved.length} unapproved/fragmented question(s). You can review/approve them in Phase 1.`);
    }

    const active = extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate && q.isApproved !== false);
    if (active.length === 0) {
      toast.error("No approved active questions to solve. Please approve or complete any pending questions.");
      return;
    }

    if (!openaiKey?.trim()) {
      toast.error("OpenAI API key required for Batch Solving API.");
      return;
    }

    setIsCreatingBatchSolve(true);
    toast.loading(`Creating OpenAI Batch Solving Job for ${active.length} questions (50% Cost Savings)...`, { id: "batch-solve-create" });

    try {
      const res: any = await createBatchSolveFn({
        data: {
          questions: active.map((q) => ({
            id: q.id,
            number: q.number,
            stem: q.stem,
            options: q.options,
            detectedAnswer: q.detectedAnswer,
          })),
          sourceMethod: solveSource,
          studyMaterialText,
          studyMaterialName,
          includeSourceCitation,
          answerKeyText,
          combinationMode: comboMode,
          model: selectedModel,
          openaiApiKey: openaiKey,
        },
      });

      setBatchSolveJob({
        batchId: res.batchId,
        status: res.status,
        totalQuestions: res.totalQuestions,
        requestCounts: { total: res.totalQuestions, completed: 0, failed: 0 },
      });

      toast.success(`Batch Solving Job Submitted! Batch ID: ${res.batchId} (50% Discount Applied)`, { id: "batch-solve-create" });
    } catch (err: any) {
      toast.error(`Batch solve submission failed: ${err?.message || err}`, { id: "batch-solve-create" });
    } finally {
      setIsCreatingBatchSolve(false);
    }
  }

  async function checkBatchSolveStatus() {
    if (!batchSolveJob?.batchId) return;
    try {
      toast.loading("Checking Batch Solving status...", { id: "batch-solve-check" });
      const res: any = await checkBatchStatusFn({
        data: {
          batchId: batchSolveJob.batchId,
          openaiApiKey: openaiKey,
        },
      });

      setBatchSolveJob((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              requestCounts: res.requestCounts,
              outputFileId: res.outputFileId,
            }
          : null
      );

      if (res.status === "completed") {
        toast.success("Batch Solving Job Completed! Click 'Apply Solved Answers' to update workspace (50% Cost Saved).", { id: "batch-solve-check" });
      } else {
        toast.info(`Batch Status: ${res.status} (${res.requestCounts.completed}/${res.requestCounts.total} completed)`, { id: "batch-solve-check" });
      }
    } catch (err: any) {
      toast.error(`Status check failed: ${err?.message || err}`, { id: "batch-solve-check" });
    }
  }

  async function handleApplyBatchSolveResults() {
    if (!batchSolveJob?.outputFileId) {
      toast.error("No output file available yet. Batch is still processing.");
      return;
    }

    try {
      toast.loading("Retrieving and parsing batch solving results...", { id: "batch-solve-apply" });
      const active = extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate && q.isApproved !== false);
      const res: any = await retrieveBatchSolveResultsFn({
        data: {
          outputFileId: batchSolveJob.outputFileId,
          openaiApiKey: openaiKey,
          questions: active.map((q) => ({ id: q.id, options: q.options })),
        },
      });

      const resultMap = new Map<string, any>();
      for (const r of res.results || []) {
        resultMap.set(r.questionId, r);
      }

      setExtractedQuestions((prev) =>
        prev.map((q) => {
          const solved = resultMap.get(q.id);
          if (!solved) return q;
          return {
            ...q,
            selectedAnswer: solved.selectedAnswer,
            options: solved.options,
            concept: solved.concept,
            sourceReference: solved.sourceReference,
            explanation: solved.explanation,
            summaryTable: solved.summaryTable,
            solveStatus: "solved",
          };
        })
      );

      setStage2Done(true);
      toast.success(`Successfully applied solved answers for ${res.results?.length || 0} questions (50% Cost Saved)!`, { id: "batch-solve-apply" });
    } catch (err: any) {
      toast.error(`Failed to apply batch results: ${err?.message || err}`, { id: "batch-solve-apply" });
    }
  }

  // ── Start Stage 3 Import ──────────────────────────────────────────────────
  async function handleImport() {
    if (!selectedSubjectId) {
      toast.error("Please select a target Subject first.");
      return;
    }

    const readyQuestions = extractedQuestions.filter(
      (q) => !q.isIgnored && !q.isDuplicate && q.solveStatus === "solved"
    );

    if (readyQuestions.length === 0) {
      toast.error("No solved questions ready for import.");
      return;
    }

    setIsImporting(true);
    try {
      const res: any = await importFn({
        data: {
          courseId: selectedCourseId,
          groupId: selectedGroupId,
          subjectId: selectedSubjectId,
          questions: readyQuestions.map((q) => ({
            id: q.id,
            stem: q.stem,
            questionType: q.questionType,
            options: q.options,
            explanation: q.explanation,
            summaryTable: q.summaryTable,
          })),
        },
      });

      setImportResult(res);
      toast.success(`Imported ${res.inserted} questions successfully into course subject!`);
    } catch (err: any) {
      toast.error(`Import failed: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  }

  // ── Session Archive Management (Point 6) ──────────────────────────────────
  function saveCurrentSession() {
    if (extractedQuestions.length === 0) {
      toast.error("No questions in current session to save.");
      return;
    }

    const title = sessionSaveName.trim() || `Session-${new Date().toLocaleDateString()} (${extractedQuestions.length} Qs)`;
    const newSession: SavedEngineSession = {
      id: `session-${Date.now()}`,
      name: title,
      createdAt: new Date().toISOString(),
      pdfName: pdfFile?.name || "Exam-Document.pdf",
      totalPages: totalPages || 1,
      model: selectedModel,
      comboMode,
      questions: extractedQuestions,
      isSolved: extractedQuestions.some((q) => q.solveStatus === "solved"),
      isImported: !!importResult,
    };

    setSavedSessions((prev) => [newSession, ...prev]);
    toast.success(`Session "${title}" saved to archive!`);
  }

  function loadSavedSession(s: SavedEngineSession) {
    setExtractedQuestions(s.questions);
    setTotalPages(s.totalPages);
    setComboMode(s.comboMode);
    setSelectedModel(s.model as SupportedModelId);
    setStage1Done(true);
    setStage2Done(s.isSolved);
    setCurrentStage(s.isSolved ? "solve" : "extract");
    toast.success(`Loaded session "${s.name}" with ${s.questions.length} questions! Zero AI tokens consumed.`);
  }

  function deleteSavedSession(id: string) {
    setSavedSessions((prev) => prev.filter((s) => s.id !== id));
    toast.info("Session removed from archive.");
  }

  function exportSessionJson(s: SavedEngineSession) {
    const jsonStr = JSON.stringify(s, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Restricted Clearance Lock Barrier ─────────────────────────────────────
  if (!clearanceUnlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-mono">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />

        <div className="relative z-10 max-w-md w-full bg-slate-900/90 border-2 border-red-500/40 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/40 flex items-center justify-center mb-6 text-red-400">
            <ShieldAlert size={32} />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-xs font-black text-red-400 uppercase tracking-widest mb-3">
            Restricted System // Level 4
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white mb-2">{ENGINE_NAME}</h1>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Medical Examination Extraction & Neural Synthesis Engine. Authorized administrative personnel only.
          </p>

          <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 text-left mb-6 text-xs text-slate-300 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Security Clearance:</span>
              <span className="text-emerald-400 font-bold">ALPHA-ADMIN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Batch API Gateway:</span>
              <span className="text-amber-400 font-bold">50% DISCOUNT ACTIVE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Neural Gateway:</span>
              <span className="text-cyan-400 font-bold">5 MODELS READY</span>
            </div>
          </div>

          <button
            onClick={() => {
              setClearanceUnlocked(true);
              toast.success("Security Clearance Verified — Console Initialized");
            }}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg shadow-red-950/50 transition-all flex items-center justify-center gap-2"
          >
            <Unlock size={18} /> Confirm Clearance & Enter Engine
          </button>
        </div>
      </div>
    );
  }

  // ── Main Console View ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <SiteHeader />

      {/* ── Console Header ─────────────────────────────────────────────────── */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md pt-24 pb-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[10px] font-mono font-bold text-red-400 uppercase tracking-wider">
                <ShieldCheck size={12} /> Level 4 Console
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-400">
                ● Sandbox Online
              </span>
              {processingMode === "batch" && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono font-bold text-amber-400">
                  <Flame size={10} /> Batch API (50% Off)
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <Terminal className="text-amber-400" size={26} /> {ENGINE_NAME}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Complete pipeline: 14-page vision scanning, Mode 1/2 combination solving, AquavisionX clinical explanations, Batch API 50% discount, and persistent session archiving.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {extractedQuestions.length > 0 && (
              <button
                onClick={saveCurrentSession}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-bold transition-all shadow-sm"
              >
                <Bookmark size={14} /> Save Session Archive
              </button>
            )}

            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 shadow-sm transition-all"
            >
              <Key size={14} className="text-amber-400" /> Dedicated API Keys & Models
              {showConfigPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Collapsible Engine Settings & API Keys Panel ───────────────────── */}
      {showConfigPanel && (
        <div className="border-b border-slate-800 bg-slate-900/95 px-6 py-6 transition-all">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* OpenAI Key */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                <span>OpenAI Engine Key</span>
                <span className="text-[10px] text-emerald-400 font-mono">Dedicated</span>
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Pre-loaded with authorized engine testing key. Supports Vision & Batch API.
              </p>
            </div>

            {/* Gemini Key */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                <span>Gemini Engine Key</span>
                <span className="text-[10px] text-cyan-400 font-mono">Google AI Studio</span>
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Required when choosing Gemini Flash / Pro models.
              </p>
            </div>

            {/* AI Model Selector */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 mb-2 block">
                Active Neural Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as SupportedModelId)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg text-amber-300 focus:outline-none focus:border-amber-500"
              >
                {SUPPORTED_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.tier})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Switch model at any time prior to execution.
              </p>
            </div>

            {/* Processing Mode (Standard vs Batch 50% Price) */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 mb-2 block">
                Processing Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setProcessingMode("standard")}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    processingMode === "standard"
                      ? "bg-amber-500/20 border-amber-500 text-amber-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  Standard
                  <div className="text-[9px] font-normal opacity-75">Immediate</div>
                </button>
                <button
                  onClick={() => setProcessingMode("batch")}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    processingMode === "batch"
                      ? "bg-amber-500/20 border-amber-500 text-amber-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  Batch API
                  <div className="text-[9px] font-normal text-emerald-400">50% Off</div>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Batch API executes asynchronously via OpenAI Batch at half price.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 4-Stage Navigation Toolbar ──────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Stage 1 Tab */}
          <button
            onClick={() => setCurrentStage("extract")}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentStage === "extract"
                ? "bg-slate-900 border-amber-500/70 shadow-lg shadow-amber-500/10"
                : "bg-slate-900/40 border-slate-800 hover:border-slate-700 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">Process 1</span>
              {stage1Done && <CheckCircle2 size={16} className="text-emerald-400" />}
            </div>
            <div className="text-sm font-bold text-white">Extract Questions</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              14-page vision, Mode 1/2 combos, missing options
            </div>
          </button>

          {/* Stage 2 Tab */}
          <button
            onClick={() => setCurrentStage("solve")}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentStage === "solve"
                ? "bg-slate-900 border-amber-500/70 shadow-lg shadow-amber-500/10"
                : "bg-slate-900/40 border-slate-800 hover:border-slate-700 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">Process 2</span>
              {stage2Done && <CheckCircle2 size={16} className="text-emerald-400" />}
            </div>
            <div className="text-sm font-bold text-white">Solve & Explain</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              AI / Material / Key solve, citations, AquavisionX
            </div>
          </button>

          {/* Stage 3 Tab */}
          <button
            onClick={() => setCurrentStage("import")}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentStage === "import"
                ? "bg-slate-900 border-amber-500/70 shadow-lg shadow-amber-500/10"
                : "bg-slate-900/40 border-slate-800 hover:border-slate-700 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">Process 3</span>
              {importResult && <CheckCircle2 size={16} className="text-emerald-400" />}
            </div>
            <div className="text-sm font-bold text-white">Course Bank Import</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Target subject bank & error question inspector
            </div>
          </button>

          {/* Stage 4: Saved Archive Tab */}
          <button
            onClick={() => setCurrentStage("archive")}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentStage === "archive"
                ? "bg-slate-900 border-amber-500/70 shadow-lg shadow-amber-500/10"
                : "bg-slate-900/40 border-slate-800 hover:border-slate-700 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Archive</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                {savedSessions.length}
              </span>
            </div>
            <div className="text-sm font-bold text-white">Saved Sessions</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Reload past runs with zero token expenditure
            </div>
          </button>
        </div>

        {/* ── STAGE 1: EXTRACT ─────────────────────────────────────────────── */}
        {currentStage === "extract" && (
          <div className="mt-6 space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* PDF Upload Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Upload size={16} className="text-amber-400" /> Upload Exam PDF
                </h3>

                <label className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-950/60 text-center">
                  <FileText size={36} className="text-slate-500 mb-2" />
                  <span className="text-xs font-bold text-slate-300">
                    {pdfFile ? pdfFile.name : "Drop PDF with scanned A4 questions"}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    {totalPages > 0 ? `${totalPages} pages detected (all will be scanned)` : "Supports multi-page scanned exams"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfSelect(f);
                    }}
                  />
                </label>

                {totalPages > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 flex justify-between items-center">
                    <span>File: <strong className="text-white">{pdfFile?.name}</strong></span>
                    <span className="text-emerald-400 font-bold">{totalPages} pages</span>
                  </div>
                )}
              </div>

              {/* Combination Mode Configuration */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Layers size={16} className="text-amber-400" /> Combination Questions Mode
                </h3>

                <div className="space-y-3">
                  <label
                    onClick={() => setComboMode("mode1_keep_original")}
                    className={`block p-3.5 rounded-xl border cursor-pointer transition-all ${
                      comboMode === "mode1_keep_original"
                        ? "bg-amber-500/10 border-amber-500 text-amber-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs mb-1">
                      <span>MODE 1 — Keep Original Combination</span>
                      {comboMode === "mode1_keep_original" && <Check size={14} className="text-amber-400" />}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-80">
                      Keeps 1, 2, 3, 4 statements in stem. Choices remain A) 1,2 B) 2,3 C) 1,2,3. Single choice question.
                    </p>
                  </label>

                  <label
                    onClick={() => setComboMode("mode2_convert_multiple")}
                    className={`block p-3.5 rounded-xl border cursor-pointer transition-all ${
                      comboMode === "mode2_convert_multiple"
                        ? "bg-amber-500/10 border-amber-500 text-amber-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs mb-1">
                      <span>MODE 2 — Convert to Multiple Answers</span>
                      {comboMode === "mode2_convert_multiple" && <Check size={14} className="text-amber-400" />}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-80">
                      Converts statements into individual independent checkboxes. Multi-answer question.
                    </p>
                  </label>
                </div>
              </div>

              {/* Execution Controls */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Flame size={16} className="text-amber-400" /> Mode & Execution
                  </h3>

                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl mb-4 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-400">Processing Mode:</span>
                      <strong className="text-amber-400 uppercase">
                        {processingMode === "batch" ? "Batch API (50% Off)" : "Standard (Immediate)"}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Target Scope:</span>
                      <strong className="text-white">All {totalPages || 0} Pages</strong>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={!pdfDoc || isExtracting}
                    onClick={startExtraction}
                    className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/40 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  >
                    {isExtracting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Scanning Page {extractProgress.current} / {extractProgress.total}...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Run Extraction (All {totalPages || 0} Pages)
                      </>
                    )}
                  </button>

                  {isExtracting && (
                    <button
                      onClick={handleEmergencyStop}
                      className="px-4 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
                      title="Stop after current page"
                    >
                      <Square size={14} /> Stop
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Batch Job Monitor (When in Batch Mode) */}
            {batchJob && (
              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold uppercase">
                      OpenAI Batch API Job Active
                    </span>
                    <h4 className="text-sm font-bold text-white mt-1">Batch ID: {batchJob.batchId}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Status: <strong className="text-amber-400 uppercase">{batchJob.status}</strong> · {batchJob.requestCounts.completed} of {batchJob.requestCounts.total} pages completed (50% price discount).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={checkBatchStatus}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                    >
                      <RefreshCw size={12} /> Check Status
                    </button>

                    {batchJob.status === "completed" && (
                      <button
                        onClick={retrieveBatchResults}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md"
                      >
                        <Download size={14} /> Load & View Questions
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Extraction Results & Quality Toolbar */}
            {extractedQuestions.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-400" /> Extracted Questions ({extractedQuestions.length})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Review stems, options, and combination structures before proceeding to solving.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Auto-fill all missing options button (Point 2) */}
                    {extractedQuestions.some((q) => q.hasMissingOptions || q.options.length < 4) && (
                      <button
                        disabled={isBulkFillingOptions}
                        onClick={handleAutoFillAllMissing}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isBulkFillingOptions ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        Auto-Fill All Missing Choices with AI ({extractedQuestions.filter((q) => q.hasMissingOptions || q.options.length < 4).length})
                      </button>
                    )}

                    {extractedQuestions.some((q) => q.isDuplicate) && (
                      <button
                        onClick={() => {
                          const withoutDups = extractedQuestions.filter((q) => !q.isDuplicate);
                          setExtractedQuestions(withoutDups);
                          toast.success("Duplicates purged!");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-all flex items-center gap-1.5"
                      >
                        <Trash2 size={12} /> Purge Duplicates ({extractedQuestions.filter((q) => q.isDuplicate).length})
                      </button>
                    )}

                    {extractedQuestions.some((q) => q.needsReview && !q.isApproved) && (
                      <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-bold text-amber-300 flex items-center gap-1.5 shadow-sm">
                        <AlertTriangle size={13} className="text-amber-400" />
                        {extractedQuestions.filter((q) => q.needsReview && !q.isApproved).length} Incomplete Fragment(s) Awaiting Review
                      </span>
                    )}

                    {stage1Done && (
                      <button
                        onClick={() => setCurrentStage("solve")}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                      >
                        Stage 1 Done: Proceed to Solve & Explain <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Question Cards List */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {extractedQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border transition-all ${
                        q.isDuplicate
                          ? "bg-red-950/20 border-red-800/40 opacity-50"
                          : q.needsReview && !q.isApproved
                          ? "bg-amber-950/30 border-amber-600/60"
                          : q.hasMissingOptions
                          ? "bg-amber-950/20 border-amber-700/50"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {/* Warning for unapproved incomplete fragments */}
                      {q.needsReview && !q.isApproved && (
                        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-xs font-bold text-amber-300">Requires Educator Review / Approval</div>
                              <div className="text-[11px] text-amber-200/80 mt-0.5">
                                {q.reviewReason || "Incomplete combination fragment missing statements or stem."}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleApproveQuestion(q.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-sm transition-all"
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              onClick={() => openEditQuestion(q)}
                              className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                            >
                              <Edit3 size={12} /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs flex items-center gap-1 transition-all"
                              title="Delete fragment"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 font-bold">
                            #{q.number || idx + 1}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                            Page {q.pageNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-400">
                            {q.questionType}
                          </span>
                          {q.isDuplicate && (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-[10px] font-bold text-red-400">
                              Duplicate
                            </span>
                          )}
                          {q.hasMissingOptions && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold text-amber-400">
                              Missing Options ({q.options.length}/4)
                            </span>
                          )}
                          {q.needsReview && !q.isApproved && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/30 text-[10px] font-bold text-amber-300 border border-amber-500/50">
                              Needs Approval
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {q.hasMissingOptions && (
                            <button
                              onClick={() => setResolvingMissingQ(q)}
                              className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 flex items-center gap-1"
                            >
                              <Wrench size={12} /> Fix Missing Choices
                            </button>
                          )}
                          <button
                            onClick={() => openEditQuestion(q)}
                            className="p-1.5 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"
                            title="Edit Question"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete Question"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            onClick={() => setInspectingQuestion(q)}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Inspect page image"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-semibold text-slate-200 mb-3 whitespace-pre-line leading-relaxed">
                        {q.stem}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2">
                        {q.options.map((o) => (
                          <div
                            key={o.letter}
                            className="p-2 rounded bg-slate-900 border border-slate-800 text-xs flex items-start gap-2"
                          >
                            <span className="font-mono font-bold text-amber-400">{o.letter})</span>
                            <span className="text-slate-300">{o.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STAGE 2: SOLVE & EXPLAIN ─────────────────────────────────────── */}
        {currentStage === "solve" && (
          <div className="mt-6 space-y-6">
            {/* Solver Configuration */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Cpu size={16} className="text-amber-400" /> Process 2: Answering & AquavisionX Explanation Engine
              </h3>

              {/* Execution Mode Selector (Standard vs Batch API 50% Off) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Solving Execution Pipeline</span>
                    {solveProcessingMode === "batch" && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                        50% Cost Savings
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {solveProcessingMode === "standard"
                      ? "Sequential real-time solving. Live progress with immediate question updates."
                      : "OpenAI Batch API (50% Cost Savings). Asynchronous background solving ideal for large exam banks."}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setSolveProcessingMode("standard")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      solveProcessingMode === "standard"
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Sparkles size={13} className="text-amber-400" /> Standard (Instant)
                  </button>
                  <button
                    onClick={() => setSolveProcessingMode("batch")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      solveProcessingMode === "batch"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Flame size={13} className="text-amber-400" /> Batch API (50% Off)
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {/* Method A */}
                <button
                  onClick={() => setSolveSource("ai")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    solveSource === "ai"
                      ? "bg-amber-500/10 border-amber-500 text-amber-200"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-bold text-xs mb-1 flex items-center justify-between">
                    <span>Method A: Pure AI Solving</span>
                    {solveSource === "ai" && <Check size={14} className="text-amber-400" />}
                  </div>
                  <p className="text-[11px] opacity-80 leading-relaxed">
                    AI independently diagnoses and selects the correct answer strictly from available choices.
                  </p>
                </button>

                {/* Method B */}
                <button
                  onClick={() => setSolveSource("source_material")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    solveSource === "source_material"
                      ? "bg-amber-500/10 border-amber-500 text-amber-200"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-bold text-xs mb-1 flex items-center justify-between">
                    <span>Method B: Reference Source</span>
                    {solveSource === "source_material" && <Check size={14} className="text-amber-400" />}
                  </div>
                  <p className="text-[11px] opacity-80 leading-relaxed">
                    Solves with absolute authority from a textbook, lecture, or syllabus document.
                  </p>
                </button>

                {/* Method C */}
                <button
                  onClick={() => setSolveSource("answer_key")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    solveSource === "answer_key"
                      ? "bg-amber-500/10 border-amber-500 text-amber-200"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-bold text-xs mb-1 flex items-center justify-between">
                    <span>Method C: Provided Answer Key</span>
                    {solveSource === "answer_key" && <Check size={14} className="text-amber-400" />}
                  </div>
                  <p className="text-[11px] opacity-80 leading-relaxed">
                    Matches answers from a pasted text key or key PDF and explains each choice.
                  </p>
                </button>
              </div>

              {/* Source Inputs if Method B or C */}
              {solveSource === "source_material" && (
                <div className="mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Paste Authority Study Material Text (or Book Chapter)
                    </label>
                    {/* Source citation toggle (Point 4) */}
                    <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSourceCitation}
                        onChange={(e) => setIncludeSourceCitation(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="font-semibold">Include Source Citation & Location</span>
                    </label>
                  </div>
                  <textarea
                    rows={4}
                    value={studyMaterialText}
                    onChange={(e) => setStudyMaterialText(e.target.value)}
                    placeholder="Paste textbook excerpts, diagnostic guidelines, or treatment protocols here..."
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {solveSource === "answer_key" && (
                <div className="mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-xs font-bold text-slate-300 block mb-2">
                    Paste Answer Key Text
                  </label>
                  <textarea
                    rows={3}
                    value={answerKeyText}
                    onChange={(e) => setAnswerKeyText(e.target.value)}
                    placeholder="e.g. 17: C, 18: C, 19: B, 20: B..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  Target: {extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate).length} questions
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isSolving || isCreatingBatchSolve || extractedQuestions.length === 0}
                    onClick={startSolving}
                    className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md disabled:opacity-50 flex items-center gap-2 transition-all"
                  >
                    {isCreatingBatchSolve ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Submitting Batch Solving Job (50% Off)...
                      </>
                    ) : solveProcessingMode === "batch" ? (
                      <>
                        <Flame size={14} /> Launch Batch Solving (50% Cost Savings)
                      </>
                    ) : isSolving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Solving Question {solveProgress.current} / {solveProgress.total}...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Run Process 2 (Solve & Generate Explanations)
                      </>
                    )}
                  </button>

                  {isSolving && solveProcessingMode === "standard" && (
                    <button
                      onClick={handleEmergencyStop}
                      className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
                      title="Stop after current question"
                    >
                      <Square size={14} /> Stop
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Batch Solving Job Monitor (When a batch solve job is active) */}
            {batchSolveJob && (
              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                        <Flame size={10} /> OpenAI Batch Solving Job Active
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                        50% Cost Savings
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mt-1.5 flex items-center gap-2">
                      Batch ID: <span className="font-mono text-amber-400">{batchSolveJob.batchId}</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Status:{" "}
                      <strong
                        className={`uppercase font-bold ${
                          batchSolveJob.status === "completed"
                            ? "text-emerald-400"
                            : batchSolveJob.status === "failed"
                            ? "text-red-400"
                            : "text-amber-400"
                        }`}
                      >
                        {batchSolveJob.status}
                      </strong>{" "}
                      · {batchSolveJob.requestCounts.completed} of {batchSolveJob.requestCounts.total} questions solved (50% price discount).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={checkBatchSolveStatus}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <RefreshCw size={12} /> Check Status
                    </button>

                    {batchSolveJob.status === "completed" && (
                      <button
                        onClick={handleApplyBatchSolveResults}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md transition-all"
                      >
                        <CheckCircle2 size={14} /> Apply Solved Answers (50% Cost Saved)
                      </button>
                    )}

                    <button
                      onClick={() => setBatchSolveJob(null)}
                      className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-slate-300 text-xs"
                      title="Dismiss monitor"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {batchSolveJob.requestCounts.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Batch Solving Progress</span>
                      <span>
                        {Math.round((batchSolveJob.requestCounts.completed / batchSolveJob.requestCounts.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          batchSolveJob.status === "completed" ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              5,
                              Math.round((batchSolveJob.requestCounts.completed / batchSolveJob.requestCounts.total) * 100)
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Solved Questions List with AquavisionX Explanations */}
            {extractedQuestions.some((q) => q.solveStatus === "solved") && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" /> Solved Questions & Explanations
                  </h3>

                  {stage2Done && (
                    <button
                      onClick={() => setCurrentStage("import")}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                    >
                      Stage 2 Done: Proceed to Import <ArrowRight size={14} />
                    </button>
                  )}
                </div>

                <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2">
                  {extractedQuestions
                    .filter((q) => !q.isIgnored && !q.isDuplicate)
                    .map((q, idx) => (
                      <div key={q.id} className="p-5 rounded-xl bg-slate-950 border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono font-bold text-slate-300">
                              #{q.number || idx + 1}
                            </span>
                            {q.concept && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold text-amber-300">
                                {q.concept}
                              </span>
                            )}
                            {q.sourceReference && (
                              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-[10px] font-mono font-bold text-cyan-300">
                                Ref: {q.sourceReference}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-emerald-400">
                            Answer: {q.selectedAnswer || "Solved"}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-200 mb-3 whitespace-pre-line leading-relaxed">
                          {q.stem}
                        </div>

                        {/* Options with correctness highlight */}
                        <div className="grid sm:grid-cols-2 gap-2 mb-4">
                          {q.options.map((o) => (
                            <div
                              key={o.letter}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                o.is_correct
                                  ? "bg-emerald-950/40 border-emerald-500/60 text-emerald-200 font-semibold"
                                  : "bg-slate-900 border-slate-800 text-slate-400"
                              }`}
                            >
                              <span className="font-mono font-bold">{o.letter})</span>
                              <span>{o.text}</span>
                              {o.is_correct && <Check size={14} className="ml-auto text-emerald-400 shrink-0" />}
                            </div>
                          ))}
                        </div>

                        {/* AquavisionX Explanation */}
                        {q.explanation && (
                          <div className="mt-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                              AquavisionX Clinical Explanation:
                            </div>
                            <div className="whitespace-pre-line prose prose-invert prose-xs max-w-none">
                              {q.explanation}
                            </div>
                            {q.summaryTable && (
                              <div className="mt-3 pt-3 border-t border-slate-800/80 overflow-x-auto">
                                <div className="font-mono text-[10px] uppercase text-slate-400 font-bold mb-1.5">
                                  Comparative Verdict Table:
                                </div>
                                <pre className="font-mono text-[11px] text-slate-300 bg-slate-950 p-2.5 rounded-lg overflow-x-auto whitespace-pre">
                                  {q.summaryTable}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STAGE 3: IMPORT & INSPECTOR ──────────────────────────────────── */}
        {currentStage === "import" && (
          <div className="mt-6 space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Target Selection Card */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Database size={16} className="text-amber-400" /> Target Course & Subject Bank
                </h3>

                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">1. Course</label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Select course...</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">2. Subject Group / Year</label>
                    <select
                      disabled={!selectedCourseId}
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    >
                      <option value="">Select group...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">3. Target Subject</label>
                    <select
                      disabled={!selectedGroupId}
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    >
                      <option value="">Select subject...</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    Ready to save:{" "}
                    <strong className="text-emerald-400">
                      {extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate && q.solveStatus === "solved").length}
                    </strong>{" "}
                    questions with AquavisionX explanations
                  </div>

                  <button
                    disabled={isImporting || !selectedSubjectId}
                    onClick={handleImport}
                    className="py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center gap-2 transition-all"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Importing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Import to Course Subject Now
                      </>
                    )}
                  </button>
                </div>

                {importResult && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
                    🎉 Successfully imported {importResult.inserted} questions!
                    {importResult.skipped > 0 && ` (${importResult.skipped} skipped).`}
                  </div>
                )}
              </div>

              {/* Flagged / Error Questions Inspector */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400" /> Error / Flagged Inspector
                </h3>
                <p className="text-[11px] text-slate-400 mb-4">
                  Review questions that couldn't be automatically solved or were flagged for review.
                </p>

                {extractedQuestions.filter((q) => q.solveStatus === "error" || q.hasMissingOptions).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
                    ✓ All questions are valid and clean!
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {extractedQuestions
                      .filter((q) => q.solveStatus === "error" || q.hasMissingOptions)
                      .map((q) => (
                        <div key={q.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[10px] text-amber-400 font-bold">
                              Q#{q.number} (Page {q.pageNumber})
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setInspectingQuestion(q)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                title="View page scan"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  q.isIgnored = !q.isIgnored;
                                  setExtractedQuestions([...extractedQuestions]);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  q.isIgnored
                                    ? "bg-slate-800 text-slate-400"
                                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                }`}
                              >
                                {q.isIgnored ? "Ignored" : "Ignore"}
                              </button>
                            </div>
                          </div>
                          <div className="line-clamp-2 text-slate-300 text-[11px]">{q.stem}</div>
                          {q.solveError && <div className="text-[10px] text-red-400 mt-1">{q.solveError}</div>}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STAGE 4: SAVED SESSIONS ARCHIVE (Point 6) ────────────────────── */}
        {currentStage === "archive" && (
          <div className="mt-6 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FolderArchive size={18} className="text-cyan-400" /> Saved Engine Sessions & Past Runs
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Saved runs remain stored so you can revisit, inspect, and import anytime without consuming AI tokens again.
                  </p>
                </div>

                {extractedQuestions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sessionSaveName}
                      onChange={(e) => setSessionSaveName(e.target.value)}
                      placeholder="Name this session..."
                      className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white w-48"
                    />
                    <button
                      onClick={saveCurrentSession}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md"
                    >
                      <Bookmark size={14} /> Save Current ({extractedQuestions.length} Qs)
                    </button>
                  </div>
                )}
              </div>

              {savedSessions.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Bookmark size={32} className="mx-auto mb-2 opacity-30" />
                  No saved sessions yet. Extract or solve questions, then click "Save Session Archive".
                </div>
              ) : (
                <div className="space-y-4">
                  {savedSessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{s.name}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-400 font-bold">
                            {s.questions.length} questions
                          </span>
                          {s.isSolved && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                              Solved & Explained
                            </span>
                          )}
                          {s.isImported && (
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-[10px] font-bold text-blue-400">
                              Imported
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>File: <strong className="text-slate-300">{s.pdfName}</strong> ({s.totalPages} pages)</span>
                          <span>Model: <strong className="text-slate-300">{s.model}</strong></span>
                          <span>Saved: {new Date(s.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadSavedSession(s)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
                        >
                          <Play size={12} /> Load into Workspace
                        </button>
                        <button
                          onClick={() => exportSessionJson(s)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Download JSON backup"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => deleteSavedSession(s.id)}
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                          title="Delete session"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Missing Options Modal (Manual vs AI) ────────────────────────────── */}
      {resolvingMissingQ && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wrench size={16} className="text-amber-400" /> Complete Question Options
              </h3>
              <button onClick={() => setResolvingMissingQ(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-slate-300 mb-4 whitespace-pre-line max-h-32 overflow-y-auto bg-slate-950 p-3 rounded-xl border border-slate-800">
              {resolvingMissingQ.stem}
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-[11px] font-mono text-slate-400">Current Options:</div>
              {resolvingMissingQ.options.map((o) => (
                <div key={o.letter} className="text-xs text-slate-200 bg-slate-950 p-2 rounded border border-slate-800">
                  <strong className="text-amber-400 font-mono">{o.letter})</strong> {o.text}
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Choice A: Type Missing Option Manually
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualOptionText}
                    onChange={(e) => setManualOptionText(e.target.value)}
                    placeholder="Enter missing option text..."
                    className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                  <button
                    onClick={() => handleManualAddOption(resolvingMissingQ)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="text-center text-[10px] font-mono text-slate-500">— OR —</div>

              <button
                onClick={() => handleAiFillMissing(resolvingMissingQ)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <Sparkles size={14} /> Let AI Auto-Generate Plausible Medical Distractor(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Question Modal (Phase 1) ────────────────────────────────── */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 size={16} className="text-blue-400" /> Edit Question #{editNumber} · Page {editingQuestion.pageNumber}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update stem, choices, or question type. Saving will mark this question as reviewed and approved.
                </p>
              </div>
              <button onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {editingQuestion.needsReview && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-bold">Original Notice:</span> {editingQuestion.reviewReason || "Incomplete combination fragment missing statements or stem."}
                    <div className="text-[11px] text-amber-200/80 mt-0.5">
                      You can complete the missing question stem or numbered statements below, or delete this question from the workspace.
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Question Number</label>
                  <input
                    type="text"
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                    placeholder="e.g. 6 or 4"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Question Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  >
                    <option value="ordinary">ordinary (Standard Single Choice)</option>
                    <option value="combination">combination (Numbered Statements)</option>
                    <option value="multiple_answer">multiple_answer (Multi-Select)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Question Stem / Premise</label>
                <textarea
                  value={editStem}
                  onChange={(e) => setEditStem(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white leading-relaxed resize-y font-mono"
                  placeholder="Enter or paste the complete question stem..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300">Answer Options ({editOptions.length})</label>
                  <button
                    type="button"
                    onClick={() => {
                      const letters = ["A", "B", "C", "D", "E", "F"];
                      const nextLetter = letters[editOptions.length] || String.fromCharCode(65 + editOptions.length);
                      setEditOptions([...editOptions, { letter: nextLetter, text: "" }]);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-amber-300 flex items-center gap-1"
                  >
                    <PlusCircle size={12} /> Add Option
                  </button>
                </div>

                <div className="space-y-2">
                  {editOptions.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.letter}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setEditOptions(editOptions.map((o, i) => (i === optIdx ? { ...o, letter: val } : o)));
                        }}
                        className="w-12 px-2 py-1.5 text-center text-xs font-mono font-bold bg-slate-950 border border-slate-700 rounded-lg text-amber-400"
                      />
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditOptions(editOptions.map((o, i) => (i === optIdx ? { ...o, text: val } : o)));
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                        placeholder={`Option ${opt.letter} text...`}
                      />
                      <button
                        type="button"
                        onClick={() => setEditOptions(editOptions.filter((_, i) => i !== optIdx))}
                        className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                        title="Remove Option"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedQuestion}
                className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
              >
                <Check size={14} /> Save Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Inspection Modal ─────────────────────────────────────────── */}
      {inspectingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye size={16} className="text-cyan-400" /> Page {inspectingQuestion.pageNumber} Inspection · Q#{inspectingQuestion.number}
                </h3>
              </div>
              <button onClick={() => setInspectingQuestion(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-center">
              {pageThumbnails[inspectingQuestion.pageNumber] ? (
                <img
                  src={`data:image/jpeg;base64,${pageThumbnails[inspectingQuestion.pageNumber]}`}
                  alt={`Page ${inspectingQuestion.pageNumber}`}
                  className="max-h-[70vh] rounded shadow-lg object-contain"
                />
              ) : (
                <div className="text-xs text-slate-500">Page image not yet cached in session.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
