import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldAlert, Upload, Cpu, CheckCircle2, XCircle, Clock, Trash2,
  Loader2, ChevronDown, ChevronUp, RefreshCw, BookOpen, Edit3,
  AlertTriangle, Copy, Eye, EyeOff, Filter, Import, Key,
  FileText, Layers, MoreHorizontal, RotateCcw, Save, X,
  ChevronsUpDown, AlertCircle, Star, Sparkles, Check, HelpCircle,
  Play, Pause, ArrowRight, BookMarked, KeyRound, ListOrdered,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadPdfForRenderPreferWorker, getPdfPageTexts } from "@/lib/pdf-page-render";
import { renderPageToCanvas, canvasToJpegBase64 } from "@/lib/pdf-page-image";
import {
  createMcqSession,
  processPageImage,
  finalizeSession,
  cancelMcqSession,
  listMcqSessions,
  getMcqSession,
  deleteMcqSession,
  updateMcqQuestion,
  bulkUpdateReviewStatus,
  rejectAllDuplicates,
  importSessionQuestions,
  getMcqKeyStatus,
  MODEL_OPTIONS,
  ModelIdSchema,
  // Phase 2
  initiateAnsweringSession,
  solveSingleQuestion,
  parseAnswerKeyPdf,
  parseAnswerKeyEntries,
  applyAnswerKeyBatch,
  updateQuestionAnswerManual,
  clearSessionAnswers,
  completeAnsweringSession,
} from "@/lib/mcq-generator-pro.functions";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/admin/mcq-generator-pro")({
  head: () => ({
    meta: [
      { title: "MCQ Generator Pro — AquaQBank Admin" },
      { name: "description", content: "Restricted admin tool to extract and solve MCQ questions from scanned PDF exams." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: McqGeneratorPro,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  pdf_name: string;
  total_pages: number;
  pages_processed: number;
  questions_extracted: number;
  duplicates_found: number;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  model: string;
  created_at: string;
  updated_at: string;
  // Phase 2
  answering_method?: "ai" | "study_material" | "user_answer_key" | null;
  answering_model?: string | null;
  answering_provider?: string | null;
  answering_instructions?: string | null;
  study_material_name?: string | null;
  study_material_text?: string | null;
  answering_status?: "idle" | "running" | "completed" | "failed" | "cancelled";
  total_answered?: number;
  total_needs_review?: number;
};

type McqOption = { letter: string; body: string };

type McqQuestion = {
  id: string;
  page_number: number;
  question_number: number | null;
  stem: string;
  options: McqOption[];
  question_type: "single_choice" | "multiple_answer";
  needs_manual_options: boolean;
  options_generated_by_ai: boolean;
  is_duplicate: boolean;
  duplicate_of_id: string | null;
  review_status: "pending" | "accepted" | "rejected";
  sort_order: number;
  // Phase 2
  answer_source?: "ai" | "study_material" | "user_answer_key" | null;
  selected_answer?: any; // string or string[]
  answer_text?: any;
  confidence?: "high" | "medium" | "low" | null;
  needs_review?: boolean;
  review_reason?: string | null;
  source_reference?: string | null;
  answering_model?: string | null;
  answering_provider?: string | null;
  answering_instructions?: string | null;
  answering_status?: "unanswered" | "answered" | "failed" | "needs_review";
  internal_reasoning?: string | null;
  answered_at?: string | null;
};

type FilterTab =
  | "all"
  | "needs_review"
  | "answered"
  | "unanswered"
  | "duplicates"
  | "needs_options"
  | "accepted"
  | "rejected"
  | "pending";

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type SubjectRow = { id: string; name: string; group_id: string };

type Step =
  | "configure"
  | "processing"
  | "review"
  | "solve_setup"
  | "solve_progress"
  | "solve_complete"
  | "import";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function statusColor(s: Session["status"]) {
  switch (s) {
    case "done":      return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "running":   return "text-blue-600 bg-blue-50 border-blue-200";
    case "failed":    return "text-red-600 bg-red-50 border-red-200";
    case "cancelled": return "text-amber-600 bg-amber-50 border-amber-200";
    default:          return "text-muted-foreground bg-muted border-border";
  }
}

function statusLabel(s: Session["status"]) {
  switch (s) {
    case "done":      return "Done";
    case "running":   return "Running";
    case "failed":    return "Failed";
    case "cancelled": return "Cancelled";
    default:          return "Pending";
  }
}

function formatSelectedAnswer(ans: any): string {
  if (ans == null) return "None";
  if (Array.isArray(ans)) return ans.join(", ");
  return String(ans);
}

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

// ─── Main Component ───────────────────────────────────────────────────────────

function McqGeneratorPro() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  // ── Global state ──
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<McqQuestion[]>([]);
  const [step, setStep]                 = useState<Step>("configure");

  // ── Configuration (Phase 1) ──
  const [file, setFile]                 = useState<File | null>(null);
  const [modelId, setModelId]           = useState("gemini-2.5-flash-lite");
  const [combinationMode, setCombinationMode] = useState<"keep" | "convert">("keep");
  const [missingOptsMode, setMissingOptsMode] = useState<"manual" | "ai_generate">("manual");
  const [aiNotes, setAiNotes]           = useState("");
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // ── Processing (Phase 1) ──
  const [processing, setProcessing]     = useState(false);
  const [processLog, setProcessLog]     = useState<string[]>([]);
  const [currentPage, setCurrentPage]   = useState(0);
  const [totalPages, setTotalPages]     = useState(0);
  const cancelledRef                    = useRef(false);
  const [pagesQCount, setPagesQCount]   = useState<Record<number, number>>({});

  // ── Phase 2 Solving State ──
  const [solveMethod, setSolveMethod]   = useState<"ai" | "study_material" | "user_answer_key">("ai");
  const [solveModel, setSolveModel]     = useState("gemini-2.5-flash-lite");
  const [solveInstructions, setSolveInstructions] = useState("");
  const [studyMaterialFile, setStudyMaterialFile] = useState<File | null>(null);
  const [studyMaterialText, setStudyMaterialText] = useState("");
  const [studyMaterialLoading, setStudyMaterialLoading] = useState(false);
  const [answerKeyMode, setAnswerKeyMode] = useState<"text" | "pdf">("text");
  const [answerKeyText, setAnswerKeyText] = useState("");
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [answerKeyBusy, setAnswerKeyBusy] = useState(false);

  // Phase 2 Live Progress
  const [solvingActive, setSolvingActive] = useState(false);
  const [solvingPaused, setSolvingPaused] = useState(false);
  const solvingPausedRef                = useRef(false);
  const solvingCancelledRef             = useRef(false);
  const [solveCurrentIndex, setSolveCurrentIndex] = useState(0);
  const [solveTotalToRun, setSolveTotalToRun] = useState(0);
  const [solveLog, setSolveLog]         = useState<string[]>([]);
  const [solveErrorCount, setSolveErrorCount] = useState(0);

  // ── Review & Overrides ──
  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editStem, setEditStem]         = useState("");
  const [editOptions, setEditOptions]   = useState<McqOption[]>([]);
  const [editType, setEditType]         = useState<"single_choice" | "multiple_answer">("single_choice");
  const [savingEdit, setSavingEdit]     = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [rejectingDupes, setRejectingDupes] = useState(false);

  // Manual Answer Override State
  const [overrideQId, setOverrideQId]   = useState<string | null>(null);
  const [overrideAnswer, setOverrideAnswer] = useState<string>("");
  const [overrideMulti, setOverrideMulti] = useState<string[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  // ── Import ──
  const [courses, setCourses]           = useState<Course[]>([]);
  const [groups, setGroups]             = useState<Group[]>([]);
  const [subjects, setSubjects]         = useState<SubjectRow[]>([]);
  const [importCourseId, setImportCourseId] = useState("");
  const [importGroupId, setImportGroupId]   = useState("");
  const [importSubjectId, setImportSubjectId] = useState("");
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{inserted:number;skipped:number;errors:string[]} | null>(null);

  // ── Key status ──
  const [keyStatus, setKeyStatus]       = useState<{hasGemini:boolean;hasOpenAI:boolean} | null>(null);

  // ─── Load sessions on mount ──────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await listMcqSessions();
      setSessions(data as Session[]);
    } catch (e: any) {
      toast.error("Could not load sessions: " + (e?.message ?? String(e)));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadKeyStatus = useCallback(async () => {
    try {
      const s = await getMcqKeyStatus();
      setKeyStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadSessions();
      loadKeyStatus();
    }
  }, [isAdmin, loadSessions, loadKeyStatus]);

  // ─── Load courses for import ─────────────────────────────────────────────

  const loadCourses = useCallback(async () => {
    const { data } = await supabase
      .from("courses")
      .select("id, title, year")
      .order("year", { ascending: true });
    setCourses(data ?? []);
  }, []);

  useEffect(() => { if (isAdmin) loadCourses(); }, [isAdmin, loadCourses]);

  useEffect(() => {
    if (!importCourseId) { setGroups([]); setImportGroupId(""); return; }
    supabase.from("groups").select("id,name,course_id").eq("course_id", importCourseId)
      .then(({ data }) => { setGroups(data ?? []); setImportGroupId(""); setSubjects([]); setImportSubjectId(""); });
  }, [importCourseId]);

  useEffect(() => {
    if (!importGroupId) { setSubjects([]); setImportSubjectId(""); return; }
    supabase.from("subjects").select("id,name,group_id").eq("group_id", importGroupId)
      .then(({ data }) => { setSubjects(data ?? []); setImportSubjectId(""); });
  }, [importGroupId]);

  // ─── Open a past session ─────────────────────────────────────────────────

  async function openSession(sessionId: string) {
    try {
      toast.loading("Loading session…", { id: "open-session" });
      const result = await getMcqSession({ data: { sessionId } });
      setActiveSession(result.session as Session);
      setActiveQuestions(result.questions as McqQuestion[]);
      setStep("review");
      setFilterTab("all");
      setSelectedIds(new Set());
      setEditingId(null);
      setOverrideQId(null);
      toast.dismiss("open-session");
    } catch (e: any) {
      toast.dismiss("open-session");
      toast.error("Could not open session: " + (e?.message ?? String(e)));
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm("Delete this session and all its extracted questions?")) return;
    try {
      await deleteMcqSession({ data: { sessionId } });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setActiveQuestions([]);
        setStep("configure");
      }
      toast.success("Session deleted.");
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message ?? String(e)));
    }
  }

  // ─── Phase 1: Start extraction processing ────────────────────────────────

  async function handleStartProcessing() {
    if (!file) { toast.error("Please upload a PDF first."); return; }
    if (keyStatus && !keyStatus.hasGemini && modelId !== "openai-gpt4o") {
      toast.error("No Gemini API key found. Add one in /admin/ai-keys.");
      return;
    }
    if (keyStatus && !keyStatus.hasOpenAI && modelId === "openai-gpt4o") {
      toast.error("No OpenAI API key found. Add one in /admin/ai-keys.");
      return;
    }

    setProcessing(true);
    setProcessLog([]);
    setPagesQCount({});
    cancelledRef.current = false;
    setStep("processing");

    let sessionId = "";
    let pdf: any = null;
    let numPages = 0;

    const log = (msg: string) => setProcessLog((prev) => [...prev, msg]);

    try {
      log("📄 Loading PDF…");
      pdf = await loadPdfForRenderPreferWorker(file);
      numPages = pdf.numPages ?? 0;
      setTotalPages(numPages);
      log(`📄 PDF loaded — ${numPages} page${numPages === 1 ? "" : "s"}`);

      const sess = await createMcqSession({
        data: {
          pdfName: file.name,
          totalPages: numPages,
          model: modelId as any,
          combinationMode,
          missingOptsMode,
          aiNotes: aiNotes || undefined,
        },
      });
      sessionId = sess.sessionId;
      log(`✅ Session created (${sessionId.slice(0, 8)}…)`);
      await loadSessions();

      for (let p = 1; p <= numPages; p++) {
        if (cancelledRef.current) {
          log("⛔ Cancelled by user.");
          await cancelMcqSession({ data: { sessionId } });
          break;
        }

        setCurrentPage(p);
        log(`🔍 Processing page ${p} of ${numPages}…`);

        try {
          const page = await pdf.getPage(p);
          const canvas = await renderPageToCanvas(page, 2.0);
          const base64 = await canvasToJpegBase64(canvas, 0.88);

          const result = await processPageImage({
            data: {
              sessionId,
              pageNumber: p,
              imageBase64: base64,
            },
          });

          setPagesQCount((prev) => ({ ...prev, [p]: result.questionsFound }));
          log(`  ✔ Page ${p}: ${result.questionsFound} question${result.questionsFound === 1 ? "" : "s"} found`);
        } catch (pageErr: any) {
          log(`  ⚠ Page ${p} error: ${pageErr?.message ?? String(pageErr)}`);
        }
      }

      if (!cancelledRef.current) {
        log("⚙️ Running duplicate detection…");
        const fin = await finalizeSession({ data: { sessionId } });
        log(`✅ Done! Duplicates found: ${fin.duplicatesFound}`);

        const fullData = await getMcqSession({ data: { sessionId } });
        setActiveSession(fullData.session as Session);
        setActiveQuestions(fullData.questions as McqQuestion[]);
        setStep("review");
        await loadSessions();
        toast.success("Extraction complete! Review your questions or proceed to Phase 2 Solving.");
      }
    } catch (err: any) {
      log(`❌ Fatal error: ${err?.message ?? String(err)}`);
      toast.error("Processing failed: " + (err?.message ?? String(err)));
      if (sessionId) {
        try { await finalizeSession({ data: { sessionId, failed: true } }); } catch {}
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleCancelExtraction() {
    cancelledRef.current = true;
    toast.info("Cancelling extraction after current page…");
  }

  // ─── Phase 2: Solving Methods & Execution ─────────────────────────────────

  async function handleStudyMaterialUpload(f: File) {
    setStudyMaterialFile(f);
    setStudyMaterialLoading(true);
    toast.loading("Extracting text from study material PDF…", { id: "sm-extract" });
    try {
      const texts = await getPdfPageTexts(f, 1, 100);
      const combined = texts.join("\n\n---\n\n").trim();
      setStudyMaterialText(combined);
      toast.dismiss("sm-extract");
      toast.success(`Loaded ${texts.length} pages of study material!`);
    } catch (e: any) {
      toast.dismiss("sm-extract");
      toast.error("Could not extract PDF text: " + (e?.message || String(e)));
    } finally {
      setStudyMaterialLoading(false);
    }
  }

  async function handleApplyAnswerKeyText() {
    if (!activeSession) return;
    const trimmed = answerKeyText.trim();
    if (!trimmed) { toast.error("Please paste an answer key first."); return; }

    const entries = parseAnswerKeyEntries(trimmed);
    if (entries.length === 0) {
      toast.error("No valid answers could be parsed. Check formatting (e.g. '1. A' or '1: C').");
      return;
    }

    setAnswerKeyBusy(true);
    try {
      const res = await applyAnswerKeyBatch({
        data: { sessionId: activeSession.id, entries },
      });
      toast.success(`Applied ${res.appliedCount} answers! (${res.needsReviewCount} need review)`);
      const updated = await getMcqSession({ data: { sessionId: activeSession.id } });
      setActiveSession(updated.session as Session);
      setActiveQuestions(updated.questions as McqQuestion[]);
      setStep("solve_complete");
    } catch (e: any) {
      toast.error("Failed to apply answer key: " + (e?.message || String(e)));
    } finally {
      setAnswerKeyBusy(false);
    }
  }

  async function handleApplyAnswerKeyPdf() {
    if (!activeSession) return;
    if (!answerKeyPdf) { toast.error("Please choose an answer-key PDF file."); return; }

    setAnswerKeyBusy(true);
    toast.loading("Reading answer key PDF via OCR…", { id: "ocr-key" });
    try {
      const b64 = await blobToBase64(answerKeyPdf);
      const parsed = await parseAnswerKeyPdf({ data: { pdfBase64: b64 } });
      if (parsed.entries.length === 0) {
        toast.dismiss("ocr-key");
        toast.error("No answers found in the uploaded PDF.");
        return;
      }

      toast.loading(`OCR found ${parsed.entries.length} items. Mapping to questions…`, { id: "ocr-key" });
      const res = await applyAnswerKeyBatch({
        data: { sessionId: activeSession.id, entries: parsed.entries },
      });
      toast.dismiss("ocr-key");
      toast.success(`Applied ${res.appliedCount} answers! (${res.needsReviewCount} need review)`);

      const updated = await getMcqSession({ data: { sessionId: activeSession.id } });
      setActiveSession(updated.session as Session);
      setActiveQuestions(updated.questions as McqQuestion[]);
      setStep("solve_complete");
    } catch (e: any) {
      toast.dismiss("ocr-key");
      toast.error("Failed to extract PDF key: " + (e?.message || String(e)));
    } finally {
      setAnswerKeyBusy(false);
    }
  }

  async function handleStartAnswering() {
    if (!activeSession) return;

    if (solveMethod === "user_answer_key") {
      if (answerKeyMode === "text") {
        await handleApplyAnswerKeyText();
      } else {
        await handleApplyAnswerKeyPdf();
      }
      return;
    }

    // Method A or B
    const questionsToSolve = activeQuestions.filter((q) => q.review_status !== "rejected");
    if (questionsToSolve.length === 0) {
      toast.error("No questions available to solve.");
      return;
    }

    setSolvingActive(true);
    setSolvingPaused(false);
    solvingPausedRef.current = false;
    solvingCancelledRef.current = false;
    setSolveLog([]);
    setSolveErrorCount(0);
    setSolveTotalToRun(questionsToSolve.length);
    setSolveCurrentIndex(0);
    setStep("solve_progress");

    const log = (msg: string) => setSolveLog((prev) => [...prev, msg]);

    try {
      await initiateAnsweringSession({
        data: {
          sessionId: activeSession.id,
          method: solveMethod,
          model: solveModel as any,
          instructions: solveInstructions || undefined,
          studyMaterialName: studyMaterialFile?.name || undefined,
          studyMaterialText: studyMaterialText || undefined,
        },
      });

      log(`🚀 Started answering with Method: ${solveMethod === "study_material" ? "Study Material" : "AI Independent"}`);
      log(`🧠 Model: ${MODEL_OPTIONS.find((m) => m.id === solveModel)?.label || solveModel}`);

      for (let i = 0; i < questionsToSolve.length; i++) {
        if (solvingCancelledRef.current) {
          log("⛔ Solving cancelled by user.");
          break;
        }

        while (solvingPausedRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }

        const q = questionsToSolve[i];
        setSolveCurrentIndex(i + 1);

        try {
          const res = await solveSingleQuestion({
            data: {
              sessionId: activeSession.id,
              questionId: q.id,
              method: solveMethod,
              model: solveModel as any,
              instructions: solveInstructions || undefined,
              studyMaterialText: studyMaterialText || undefined,
            },
          });

          // Update question in local state
          setActiveQuestions((prev) =>
            prev.map((item) =>
              item.id === q.id
                ? {
                    ...item,
                    answer_source: solveMethod,
                    selected_answer: res.selectedAnswer,
                    confidence: res.confidence,
                    needs_review: res.needsReview,
                    review_reason: res.reviewReason,
                    answering_status: res.needsReview ? "needs_review" : "answered",
                  }
                : item
            )
          );

          if (res.needsReview) {
            log(`  ⚠️ Q${q.question_number || i + 1}: ${formatSelectedAnswer(res.selectedAnswer)} (Flagged: ${res.reviewReason || "Uncertain"})`);
          } else {
            log(`  ✔ Q${q.question_number || i + 1}: Correct Answer: ${formatSelectedAnswer(res.selectedAnswer)} [${res.confidence}]`);
          }
        } catch (itemErr: any) {
          setSolveErrorCount((prev) => prev + 1);
          log(`  ❌ Q${q.question_number || i + 1} Error: ${itemErr?.message || String(itemErr)}`);
        }
      }

      if (!solvingCancelledRef.current) {
        await completeAnsweringSession({ data: { sessionId: activeSession.id } });
        const updated = await getMcqSession({ data: { sessionId: activeSession.id } });
        setActiveSession(updated.session as Session);
        setActiveQuestions(updated.questions as McqQuestion[]);
        setStep("solve_complete");
        toast.success("Answering complete! Review determined answers.");
      }
    } catch (e: any) {
      toast.error("Answering failed: " + (e?.message || String(e)));
    } finally {
      setSolvingActive(false);
    }
  }

  async function handleClearAllAnswers() {
    if (!activeSession) return;
    if (!confirm("Clear all determined answers for this session? Questions will be reset to unanswered.")) return;
    try {
      await clearSessionAnswers({ data: { sessionId: activeSession.id } });
      const updated = await getMcqSession({ data: { sessionId: activeSession.id } });
      setActiveSession(updated.session as Session);
      setActiveQuestions(updated.questions as McqQuestion[]);
      setStep("solve_setup");
      toast.success("Answers cleared.");
    } catch (e: any) {
      toast.error("Failed to clear answers: " + (e?.message || String(e)));
    }
  }

  // ─── Manual Answer Override ──────────────────────────────────────────────

  function openAnswerOverride(q: McqQuestion) {
    setOverrideQId(q.id);
    if (q.question_type === "multiple_answer") {
      setOverrideMulti(Array.isArray(q.selected_answer) ? q.selected_answer : []);
    } else {
      setOverrideAnswer(typeof q.selected_answer === "string" ? q.selected_answer : "");
    }
    setOverrideReason(q.review_reason || "");
  }

  async function saveAnswerOverride() {
    if (!overrideQId) return;
    const q = activeQuestions.find((item) => item.id === overrideQId);
    if (!q) return;

    setSavingOverride(true);
    try {
      const finalSelected = q.question_type === "multiple_answer" ? overrideMulti : overrideAnswer;
      await updateQuestionAnswerManual({
        data: {
          questionId: overrideQId,
          selected_answer: finalSelected,
          needs_review: false,
          review_reason: null,
        },
      });

      setActiveQuestions((prev) =>
        prev.map((item) =>
          item.id === overrideQId
            ? {
                ...item,
                selected_answer: finalSelected,
                needs_review: false,
                review_reason: null,
                answering_status: "answered",
              }
            : item
        )
      );
      setOverrideQId(null);
      toast.success("Answer updated.");
    } catch (e: any) {
      toast.error("Failed to update answer: " + (e?.message || String(e)));
    } finally {
      setSavingOverride(false);
    }
  }

  // ─── Review Filter Actions ───────────────────────────────────────────────

  function filteredQuestions(): McqQuestion[] {
    switch (filterTab) {
      case "needs_review": return activeQuestions.filter((q) => q.needs_review);
      case "answered":     return activeQuestions.filter((q) => q.answering_status === "answered");
      case "unanswered":   return activeQuestions.filter((q) => !q.answering_status || q.answering_status === "unanswered");
      case "duplicates":   return activeQuestions.filter((q) => q.is_duplicate);
      case "needs_options":return activeQuestions.filter((q) => q.needs_manual_options);
      case "accepted":     return activeQuestions.filter((q) => q.review_status === "accepted");
      case "rejected":     return activeQuestions.filter((q) => q.review_status === "rejected");
      case "pending":      return activeQuestions.filter((q) => q.review_status === "pending");
      default:             return activeQuestions;
    }
  }

  async function setReviewStatus(id: string, status: "accepted" | "rejected" | "pending") {
    try {
      await updateMcqQuestion({ data: { questionId: id, review_status: status } });
      setActiveQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, review_status: status } : q))
      );
    } catch (e: any) {
      toast.error("Update failed: " + (e?.message ?? String(e)));
    }
  }

  async function handleBulkStatus(status: "accepted" | "rejected" | "pending") {
    if (selectedIds.size === 0) return;
    try {
      await bulkUpdateReviewStatus({ data: { questionIds: [...selectedIds], review_status: status } });
      setActiveQuestions((prev) =>
        prev.map((q) => selectedIds.has(q.id) ? { ...q, review_status: status } : q)
      );
      setSelectedIds(new Set());
      setBulkSelecting(false);
      toast.success(`${selectedIds.size} questions marked as ${status}.`);
    } catch (e: any) {
      toast.error("Bulk update failed: " + (e?.message ?? String(e)));
    }
  }

  async function handleRejectDuplicates() {
    if (!activeSession) return;
    if (!confirm("Reject all flagged duplicate questions? This can be undone.")) return;
    setRejectingDupes(true);
    try {
      const { rejectedCount } = await rejectAllDuplicates({ data: { sessionId: activeSession.id } });
      setActiveQuestions((prev) =>
        prev.map((q) => q.is_duplicate ? { ...q, review_status: "rejected" } : q)
      );
      toast.success(`${rejectedCount} duplicate${rejectedCount === 1 ? "" : "s"} rejected.`);
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? String(e)));
    } finally {
      setRejectingDupes(false);
    }
  }

  // ── Inline Stem & Options Editing ──

  function startEdit(q: McqQuestion) {
    setEditingId(q.id);
    setEditStem(q.stem);
    setEditOptions([...q.options]);
    setEditType(q.question_type);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await updateMcqQuestion({
        data: {
          questionId: editingId,
          stem: editStem,
          options: editOptions,
          question_type: editType,
        },
      });
      setActiveQuestions((prev) =>
        prev.map((q) =>
          q.id === editingId
            ? { ...q, stem: editStem, options: editOptions, question_type: editType }
            : q
        )
      );
      setEditingId(null);
      toast.success("Question updated.");
    } catch (e: any) {
      toast.error("Save failed: " + (e?.message ?? String(e)));
    } finally {
      setSavingEdit(false);
    }
  }

  // ─── Import ──────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!importSubjectId) { toast.error("Please select a subject."); return; }
    if (!activeSession) return;
    const acceptedCount = activeQuestions.filter((q) => q.review_status === "accepted").length;
    if (acceptedCount === 0) {
      toast.error("No accepted questions to import. Accept some questions first.");
      return;
    }
    if (!confirm(`Import ${acceptedCount} accepted question${acceptedCount === 1 ? "" : "s"} to the selected subject?`)) return;

    setImporting(true);
    setImportResult(null);
    try {
      const result = await importSessionQuestions({
        data: { sessionId: activeSession.id, subjectId: importSubjectId },
      });
      setImportResult(result);
      if (result.inserted > 0) {
        toast.success(`${result.inserted} question${result.inserted === 1 ? "" : "s"} imported successfully!`);
      } else {
        toast.warning("No questions were imported. They may already exist in the subject.");
      }
    } catch (e: any) {
      toast.error("Import failed: " + (e?.message ?? String(e)));
    } finally {
      setImporting(false);
    }
  }

  // ─── Stats derived from active questions ─────────────────────────────────

  const stats = {
    total:       activeQuestions.length,
    accepted:    activeQuestions.filter((q) => q.review_status === "accepted").length,
    rejected:    activeQuestions.filter((q) => q.review_status === "rejected").length,
    pending:     activeQuestions.filter((q) => q.review_status === "pending").length,
    duplicates:  activeQuestions.filter((q) => q.is_duplicate).length,
    needsOpts:   activeQuestions.filter((q) => q.needs_manual_options).length,
    // Phase 2 stats
    answered:    activeQuestions.filter((q) => q.answering_status === "answered").length,
    needsReview: activeQuestions.filter((q) => q.needs_review).length,
    unanswered:  activeQuestions.filter((q) => !q.answering_status || q.answering_status === "unanswered").length,
  };

  // ─── Guard ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={36} />
      </div>
    );
  }
  if (!isAdmin) return null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <FloatingMedicalBackdrop />

      <main className="relative mx-auto max-w-6xl px-4 py-8 space-y-8">

        {/* ── Restricted Area Banner ───────────────────────────────────────── */}
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-6 py-4 flex items-center gap-4">
          <ShieldAlert size={32} className="text-red-600 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-500">Restricted Area</p>
            <h1 className="text-2xl font-black text-red-800 tracking-tight">MCQ Generator Pro</h1>
            <p className="text-sm text-red-600 mt-0.5">Admin Engine — Phase 1: Extraction & Phase 2: Answering / Solving</p>
          </div>
        </div>

        {/* ── Key Warning ──────────────────────────────────────────────────── */}
        {keyStatus && !keyStatus.hasGemini && !keyStatus.hasOpenAI && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-3 flex items-center gap-3 text-amber-800 text-sm">
            <Key size={18} className="shrink-0" />
            <span>No AI API keys configured. Go to <a href="/admin/ai-keys" className="underline font-bold">/admin/ai-keys</a> to add a Gemini or OpenAI key.</span>
          </div>
        )}

        {/* ── Session History ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Layers size={18} className="text-primary" />
              Extraction Sessions
            </h2>
            <button
              type="button"
              onClick={loadSessions}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {sessionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" /> Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
              No sessions yet. Upload a PDF below to start extracting questions.
            </div>
          ) : (
            <div className="grid gap-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-xl border-2 bg-card px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors ${
                    activeSession?.id === s.id ? "border-primary/60 bg-primary/5" : "border-border"
                  }`}
                  onClick={() => openSession(s.id)}
                >
                  <FileText size={20} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm truncate">{s.pdf_name}</p>
                      {s.answering_status === "completed" && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                          Phase 2 Solved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(s.created_at)} · {s.total_pages} pages · {s.questions_extracted} Qs · {s.total_answered || 0} answered · {s.duplicates_found} dupes
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusColor(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                      className="p-1 rounded-lg hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors"
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Step Tabs ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1 rounded-xl border-2 border-border bg-card p-1 w-fit">
          {[
            { id: "configure", label: "⚙️ 1. Extract Setup" },
            { id: "processing", label: "⚡ Extract Running", hidden: step !== "processing" },
            { id: "review", label: `🔍 2. Review MCQs (${stats.total})`, disabled: !activeSession },
            { id: "solve_setup", label: "🧠 3. Solve Answers (Phase 2)", disabled: !activeSession },
            { id: "import", label: "📥 4. Import to Course", disabled: !activeSession },
          ]
            .filter((tab) => !tab.hidden)
            .map((tab) => {
              const isCurrent =
                step === tab.id ||
                (tab.id === "solve_setup" && (step === "solve_progress" || step === "solve_complete"));
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={tab.disabled}
                  onClick={() => {
                    if (tab.disabled || step === "processing" || step === "solve_progress") return;
                    setStep(tab.id as Step);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            STEP 1 — CONFIGURE (PHASE 1)
        ══════════════════════════════════════════════════════════════════ */}
        {step === "configure" && (
          <div className="space-y-6">

            {/* Upload */}
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <h2 className="font-black text-base mb-4 flex items-center gap-2">
                <Upload size={18} className="text-primary" /> Upload Scanned PDF
              </h2>
              <div
                className={`rounded-xl border-2 border-dashed ${file ? "border-primary/60 bg-primary/5" : "border-border bg-muted/30"} p-8 text-center cursor-pointer hover:border-primary/50 transition-colors`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.type === "application/pdf") setFile(f);
                  else toast.error("Please drop a PDF file.");
                }}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <FileText size={24} className="text-primary" />
                    <div className="text-left">
                      <p className="font-bold text-foreground">{file.name}</p>
                      <p className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      className="ml-4 p-1 rounded-lg hover:bg-red-50 hover:text-red-600 text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm space-y-1">
                    <Upload size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-bold">Drag & drop a PDF here, or click to browse</p>
                    <p className="text-xs">Scanned / image-based PDFs supported. Every page is processed as an image.</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>

            {/* Model + Mode selections */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Model */}
              <div className="rounded-2xl border-2 border-border bg-card p-6">
                <h2 className="font-black text-base mb-4 flex items-center gap-2">
                  <Cpu size={18} className="text-primary" /> Extraction AI Model
                </h2>
                <div className="space-y-2">
                  {MODEL_OPTIONS.map((m) => {
                    const needsKey = m.provider === "openai" ? keyStatus && !keyStatus.hasOpenAI : keyStatus && !keyStatus.hasGemini;
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                          modelId === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        } ${needsKey ? "opacity-50" : ""}`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={m.id}
                          checked={modelId === m.id}
                          onChange={() => setModelId(m.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-sm">{m.label}</p>
                          {needsKey && <p className="text-xs text-amber-600">No {m.provider === "openai" ? "OpenAI" : "Gemini"} key — add in /admin/ai-keys</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                {/* Combination mode */}
                <div className="rounded-2xl border-2 border-border bg-card p-6">
                  <h2 className="font-black text-sm mb-3 flex items-center gap-2">
                    <Layers size={16} className="text-primary" /> Combination Questions
                  </h2>
                  <div className="space-y-2">
                    {[
                      { v: "keep", label: "Keep original format", hint: "1,2,3 → stays as single_choice with A/B/C/D combos" },
                      { v: "convert", label: "Convert to multiple-answer", hint: "Each numbered statement → separate checkbox option" },
                    ].map((opt) => (
                      <label key={opt.v} className={`flex gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${combinationMode === opt.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                        <input type="radio" name="combMode" value={opt.v} checked={combinationMode === opt.v} onChange={() => setCombinationMode(opt.v as "keep" | "convert")} className="accent-primary mt-0.5" />
                        <div>
                          <p className="font-bold text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.hint}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Missing options mode */}
                <div className="rounded-2xl border-2 border-border bg-card p-6">
                  <h2 className="font-black text-sm mb-3 flex items-center gap-2">
                    <AlertCircle size={16} className="text-primary" /> Missing Answer Options
                  </h2>
                  <div className="space-y-2">
                    {[
                      { v: "manual", label: "Mark for manual input", hint: "Flag the question — don't invent options" },
                      { v: "ai_generate", label: "AI generates missing options", hint: "AI creates plausible medical distractors" },
                    ].map((opt) => (
                      <label key={opt.v} className={`flex gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${missingOptsMode === opt.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                        <input type="radio" name="missingMode" value={opt.v} checked={missingOptsMode === opt.v} onChange={() => setMissingOptsMode(opt.v as "manual" | "ai_generate")} className="accent-primary mt-0.5" />
                        <div>
                          <p className="font-bold text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.hint}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Notes */}
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <h2 className="font-black text-base mb-2 flex items-center gap-2">
                <Edit3 size={18} className="text-primary" /> AI Notes for Extraction
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Extra instructions injected into every page extraction prompt. Followed strictly.</p>
              <textarea
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                placeholder="e.g. This is a pharmacology exam. Questions always have exactly 5 options (A–E). If a question has 2 options, keep only those 2..."
                rows={3}
                className="w-full rounded-xl border-2 border-border bg-muted/30 px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>

            {/* Start button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleStartProcessing}
                disabled={!file}
                className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-primary-foreground font-black text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Cpu size={18} /> Start Extraction
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 2 — PROCESSING (PHASE 1)
        ══════════════════════════════════════════════════════════════════ */}
        {step === "processing" && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-base flex items-center gap-2">
                  <Cpu size={18} className="text-primary" />
                  {processing ? "Extracting Questions…" : "Extraction Complete"}
                </h2>
                {processing && (
                  <button
                    type="button"
                    onClick={handleCancelExtraction}
                    className="flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-red-600 font-bold text-sm hover:bg-red-100"
                  >
                    <X size={14} /> Cancel
                  </button>
                )}
              </div>

              {totalPages > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Page {Math.min(currentPage, totalPages)} of {totalPages}</span>
                    <span>{Math.round((Math.min(currentPage, totalPages) / totalPages) * 100)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${(Math.min(currentPage, totalPages) / totalPages) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Pages Processed", value: Math.min(currentPage, totalPages), icon: FileText },
                  {
                    label: "Questions Found",
                    value: Object.values(pagesQCount).reduce((a, b) => a + b, 0),
                    icon: BookOpen,
                  },
                  {
                    label: "Model",
                    value: MODEL_OPTIONS.find((m) => m.id === modelId)?.label ?? modelId,
                    icon: Cpu,
                    text: true,
                  },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border-2 border-border bg-muted/30 p-4 text-center">
                    <stat.icon size={20} className="mx-auto mb-1 text-primary" />
                    <p className={`font-black text-foreground ${stat.text ? "text-sm" : "text-2xl"}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                {processLog.map((line, i) => (
                  <p key={i} className={
                    line.startsWith("❌") || line.startsWith("⚠") ? "text-red-600" :
                    line.startsWith("✅") || line.startsWith("  ✔") ? "text-emerald-600" :
                    line.startsWith("⛔") ? "text-amber-600" :
                    "text-foreground/70"
                  }>{line}</p>
                ))}
                {processing && <p className="text-primary animate-pulse">▌</p>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            PHASE 2 — SOLVE / ANSWER SETUP
        ══════════════════════════════════════════════════════════════════ */}
        {step === "solve_setup" && activeSession && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                    <BrainIcon className="text-primary" /> Phase 2 — MCQ Answering & Solving
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Determine the correct answer for each extracted question. No explanations are generated in this phase.
                  </p>
                </div>
                {stats.answered > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllAnswers}
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg"
                  >
                    <RotateCcw size={13} /> Reset Answers ({stats.answered})
                  </button>
                )}
              </div>

              {/* Method Selector */}
              <div className="mt-6 space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block">
                  Select Answering Method
                </label>
                <div className="grid md:grid-cols-3 gap-3">
                  {[
                    {
                      id: "ai",
                      title: "Method A: AI Solves",
                      desc: "The AI independently solves the MCQ using its stem and extracted options. Chooses strictly from existing options.",
                      icon: Sparkles,
                    },
                    {
                      id: "study_material",
                      title: "Method B: Study Material",
                      desc: "Solves using uploaded reference PDF/notes. Captures source citations. Flags review if not covered.",
                      icon: BookMarked,
                    },
                    {
                      id: "user_answer_key",
                      title: "Method C: Answer Key",
                      desc: "Direct mapping from your manual text or answer-key PDF. Completely bypasses AI re-solving.",
                      icon: KeyRound,
                    },
                  ].map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSolveMethod(m.id as any)}
                      className={`rounded-2xl border-2 p-4 cursor-pointer transition-all ${
                        solveMethod === m.id
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40 bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <m.icon size={18} className={solveMethod === m.id ? "text-primary" : "text-muted-foreground"} />
                        <p className="font-black text-sm">{m.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Method B Inputs: Study Material */}
              {solveMethod === "study_material" && (
                <div className="mt-6 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
                  <h3 className="font-black text-sm flex items-center gap-2">
                    <BookMarked size={16} className="text-primary" /> Study Material / Textbook
                  </h3>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground block mb-1">
                      Upload PDF Book/Lecture (text will be extracted):
                    </label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleStudyMaterialUpload(f);
                      }}
                      className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-primary-foreground cursor-pointer"
                    />
                    {studyMaterialLoading && (
                      <p className="text-xs text-primary flex items-center gap-1 mt-1">
                        <Loader2 size={12} className="animate-spin" /> Extracting pages…
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground block mb-1">
                      Or Paste Reference Notes / Chapter Text:
                    </label>
                    <textarea
                      value={studyMaterialText}
                      onChange={(e) => setStudyMaterialText(e.target.value)}
                      placeholder="Paste textbook excerpt, lecture summary, or clinical guidelines here…"
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:border-primary resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Characters loaded: {studyMaterialText.length.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Method C Inputs: User Answer Key */}
              {solveMethod === "user_answer_key" && (
                <div className="mt-6 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm flex items-center gap-2">
                      <KeyRound size={16} className="text-primary" /> Provide Answer Key
                    </h3>
                    <div className="flex gap-1 rounded-lg border border-border bg-background p-0.5">
                      <button
                        type="button"
                        onClick={() => setAnswerKeyMode("text")}
                        className={`px-3 py-1 text-xs font-bold rounded-md ${answerKeyMode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        Paste Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnswerKeyMode("pdf")}
                        className={`px-3 py-1 text-xs font-bold rounded-md ${answerKeyMode === "pdf" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        Upload PDF Key
                      </button>
                    </div>
                  </div>

                  {answerKeyMode === "text" ? (
                    <div>
                      <label className="text-xs font-bold text-muted-foreground block mb-1">
                        Paste Answer Key text (e.g. "1. A", "2. C", "3. 1,2,3" or "A B C D"):
                      </label>
                      <textarea
                        value={answerKeyText}
                        onChange={(e) => setAnswerKeyText(e.target.value)}
                        placeholder="1. C&#10;2. A&#10;3. 1,2,3&#10;4. D..."
                        rows={5}
                        className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono focus:outline-none focus:border-primary resize-none"
                      />
                      {answerKeyText.trim() && (
                        <p className="text-xs text-primary font-bold mt-1">
                          ✓ Parsed {parseAnswerKeyEntries(answerKeyText).length} answer entries ready to apply.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-bold text-muted-foreground block mb-1">
                        Upload Answer Sheet / Table PDF:
                      </label>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setAnswerKeyPdf(e.target.files?.[0] || null)}
                        className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-primary-foreground cursor-pointer"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Gemini Vision OCR will scan the answer sheet and map answers without solving.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Model & Instructions (for Method A & B) */}
              {solveMethod !== "user_answer_key" && (
                <div className="mt-6 grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">
                      Answering AI Model
                    </label>
                    <div className="space-y-2">
                      {MODEL_OPTIONS.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer text-xs transition-colors ${
                            solveModel === m.id ? "border-primary bg-primary/5 font-bold" : "border-border hover:border-primary/40"
                          }`}
                        >
                          <input
                            type="radio"
                            name="solveModel"
                            value={m.id}
                            checked={solveModel === m.id}
                            onChange={() => setSolveModel(m.id)}
                            className="accent-primary"
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">
                      Additional Solving Instructions (Optional)
                    </label>
                    <textarea
                      value={solveInstructions}
                      onChange={(e) => setSolveInstructions(e.target.value)}
                      placeholder="e.g. Follow current medical guidelines. If the stem mentions 'most common', choose the statistical first choice. Pay close attention to negatives ('except', 'not')..."
                      rows={5}
                      className="w-full rounded-xl border-2 border-border bg-muted/30 p-3 text-xs focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted"
                >
                  ← Back to Review
                </button>
                <button
                  type="button"
                  onClick={handleStartAnswering}
                  disabled={answerKeyBusy || (solveMethod === "study_material" && !studyMaterialText.trim())}
                  className="flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-primary-foreground font-black text-sm hover:opacity-90 disabled:opacity-40"
                >
                  {answerKeyBusy ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing Key…</>
                  ) : solveMethod === "user_answer_key" ? (
                    <><CheckCircle2 size={16} /> Apply Answer Key</>
                  ) : (
                    <><Play size={16} /> Start Solving Answers ({stats.total - stats.rejected} Qs)</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            PHASE 2 — SOLVE PROGRESS
        ══════════════════════════════════════════════════════════════════ */}
        {step === "solve_progress" && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-black text-lg flex items-center gap-2">
                    <Loader2 className="animate-spin text-primary" size={20} />
                    {solvingPaused ? "Answering Paused" : "Determining Answers (Phase 2)…"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Model: {MODEL_OPTIONS.find((m) => m.id === solveModel)?.label || solveModel} · Method: {solveMethod}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !solvingPaused;
                      setSolvingPaused(next);
                      solvingPausedRef.current = next;
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                  >
                    {solvingPaused ? <Play size={14} /> : <Pause size={14} />}
                    {solvingPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      solvingCancelledRef.current = true;
                      toast.info("Stopping after current question…");
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 text-red-600 px-3 py-1.5 text-xs font-bold hover:bg-red-100"
                  >
                    <X size={14} /> Stop
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {solveTotalToRun > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Question {solveCurrentIndex} of {solveTotalToRun}</span>
                    <span>{Math.round((solveCurrentIndex / solveTotalToRun) * 100)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${(solveCurrentIndex / solveTotalToRun) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Real-time counters */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                  <p className="text-xl font-black text-foreground">{solveCurrentIndex}</p>
                  <p className="text-[11px] text-muted-foreground">Processed</p>
                </div>
                <div className="rounded-xl border border-border bg-emerald-50/50 p-3 text-center">
                  <p className="text-xl font-black text-emerald-700">{stats.answered}</p>
                  <p className="text-[11px] text-emerald-800">Answered</p>
                </div>
                <div className="rounded-xl border border-border bg-amber-50/50 p-3 text-center">
                  <p className="text-xl font-black text-amber-700">{stats.needsReview}</p>
                  <p className="text-[11px] text-amber-800">Needs Review</p>
                </div>
                <div className="rounded-xl border border-border bg-red-50/50 p-3 text-center">
                  <p className="text-xl font-black text-red-700">{solveErrorCount}</p>
                  <p className="text-[11px] text-red-800">Errors</p>
                </div>
              </div>

              {/* Live Log */}
              <div className="rounded-xl border border-border bg-muted/30 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                {solveLog.map((line, i) => (
                  <p
                    key={i}
                    className={
                      line.includes("❌")
                        ? "text-red-600"
                        : line.includes("⚠️")
                        ? "text-amber-600"
                        : line.includes("✔")
                        ? "text-emerald-600"
                        : "text-foreground/70"
                    }
                  >
                    {line}
                  </p>
                ))}
                {solvingActive && !solvingPaused && <p className="text-primary animate-pulse">▌</p>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            PHASE 2 — SOLVE COMPLETE / SUMMARY
        ══════════════════════════════════════════════════════════════════ */}
        {step === "solve_complete" && activeSession && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" />
                <div>
                  <h2 className="text-xl font-black text-emerald-900 tracking-tight">
                    Phase 2 Answering Complete!
                  </h2>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    All questions have been evaluated. Review the answers or proceed to the next step.
                  </p>
                </div>
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-center">
                  <p className="text-2xl font-black text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Questions</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{stats.answered}</p>
                  <p className="text-xs text-muted-foreground">Confident Answers</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-center">
                  <p className="text-2xl font-black text-amber-600">{stats.needsReview}</p>
                  <p className="text-xs text-muted-foreground">Flagged for Review</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-center">
                  <p className="text-2xl font-black text-muted-foreground">{stats.unanswered}</p>
                  <p className="text-xs text-muted-foreground">Unanswered</p>
                </div>
              </div>

              <div className="rounded-xl bg-white/60 border border-emerald-200 p-3 text-xs space-y-1 text-emerald-900">
                <p><strong>Method Used:</strong> {activeSession.answering_method || solveMethod}</p>
                {activeSession.answering_model && (
                  <p><strong>Model:</strong> {MODEL_OPTIONS.find((m) => m.id === activeSession.answering_model)?.label || activeSession.answering_model}</p>
                )}
                {activeSession.answering_instructions && (
                  <p><strong>Instructions:</strong> {activeSession.answering_instructions}</p>
                )}
              </div>

              {/* Phase 3 Notice & Actions */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-primary-foreground font-black text-sm hover:opacity-90"
                >
                  <Eye size={15} /> Review Answers
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast.info(
                      "Phase 2 Complete! Phase 3 (Explanation Generation) will be integrated here in the next update.",
                      { duration: 5000 }
                    );
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-primary/40 bg-card px-5 py-2.5 text-sm font-bold hover:bg-muted"
                >
                  <Sparkles size={15} className="text-primary" /> Start Explanations (Phase 3)
                </button>
                <button
                  type="button"
                  onClick={() => setStep("solve_setup")}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Re-Solve / Change Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 3 — REVIEW (WITH PHASE 2 ANSWERS)
        ══════════════════════════════════════════════════════════════════ */}
        {step === "review" && activeSession && (
          <div className="space-y-4">

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: "Total",      value: stats.total,      color: "text-foreground" },
                { label: "Answered",   value: stats.answered,   color: "text-emerald-600 font-black" },
                { label: "Needs Rev",  value: stats.needsReview, color: "text-amber-600 font-black" },
                { label: "Unanswered", value: stats.unanswered, color: "text-muted-foreground" },
                { label: "Accepted",   value: stats.accepted,   color: "text-emerald-600" },
                { label: "Rejected",   value: stats.rejected,   color: "text-red-600" },
                { label: "Duplicates", value: stats.duplicates, color: "text-purple-600" },
                { label: "Needs Opts", value: stats.needsOpts,  color: "text-orange-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border-2 border-border bg-card p-2 text-center">
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => setStep("solve_setup")}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-primary-foreground font-black text-xs hover:opacity-90 shadow-sm"
              >
                <BrainIcon size={14} /> Solve Answers (Phase 2)
              </button>
              {stats.duplicates > 0 && (
                <button
                  type="button"
                  onClick={handleRejectDuplicates}
                  disabled={rejectingDupes}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-purple-300 bg-purple-50 px-3 py-2 text-purple-700 font-bold text-xs hover:bg-purple-100 disabled:opacity-50"
                >
                  {rejectingDupes ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
                  Reject Duplicates ({stats.duplicates})
                </button>
              )}
              <button
                type="button"
                onClick={() => setBulkSelecting((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 font-bold text-xs transition-colors ${
                  bulkSelecting ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 size={13} /> Bulk Select
              </button>
              {bulkSelecting && selectedIds.size > 0 && (
                <>
                  <button type="button" onClick={() => handleBulkStatus("accepted")} className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-700 font-bold text-xs hover:bg-emerald-100">
                    <CheckCircle2 size={12} /> Accept ({selectedIds.size})
                  </button>
                  <button type="button" onClick={() => handleBulkStatus("rejected")} className="flex items-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-1.5 text-red-700 font-bold text-xs hover:bg-red-100">
                    <XCircle size={12} /> Reject ({selectedIds.size})
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setStep("import")}
                className="ml-auto flex items-center gap-1.5 rounded-xl border-2 border-border bg-card px-4 py-2 font-bold text-xs hover:bg-muted"
              >
                <Import size={13} /> Go to Import →
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: "All", count: stats.total },
                { id: "needs_review", label: "⚠️ Needs Review", count: stats.needsReview, highlight: stats.needsReview > 0 },
                { id: "answered", label: "✓ Answered", count: stats.answered },
                { id: "unanswered", label: "Unanswered", count: stats.unanswered },
                { id: "accepted", label: "Accepted", count: stats.accepted },
                { id: "rejected", label: "Rejected", count: stats.rejected },
                { id: "duplicates", label: "Duplicates", count: stats.duplicates },
                { id: "needs_options", label: "Needs Options", count: stats.needsOpts },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id as FilterTab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    filterTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : tab.highlight
                      ? "bg-amber-100 border-2 border-amber-300 text-amber-900"
                      : "bg-card border-2 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label} <span className="opacity-70">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Question List */}
            <div className="space-y-3">
              {filteredQuestions().length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                  No questions found in this filter.
                </div>
              ) : (
                filteredQuestions().map((q) => {
                  const isEditing = editingId === q.id;
                  const isOverriding = overrideQId === q.id;

                  return (
                    <div
                      key={q.id}
                      className={`rounded-2xl border-2 bg-card transition-colors ${
                        q.review_status === "accepted" ? "border-emerald-300/80 bg-emerald-50/15" :
                        q.review_status === "rejected" ? "border-red-200 bg-red-50/15 opacity-60" :
                        q.needs_review ? "border-amber-300 bg-amber-50/20" :
                        q.is_duplicate ? "border-purple-300 bg-purple-50/15" :
                        "border-border"
                      }`}
                    >
                      <div className="p-4 space-y-3">

                        {/* Top Meta Line */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {bulkSelecting && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(q.id)}
                                onChange={() => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                                    return next;
                                  });
                                }}
                                className="accent-primary mr-1 shrink-0"
                              />
                            )}
                            <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                              P{q.page_number}{q.question_number ? ` · Q${q.question_number}` : ""}
                            </span>
                            {q.question_type === "multiple_answer" && (
                              <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md">
                                Multi-Answer
                              </span>
                            )}
                            {q.is_duplicate && (
                              <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                                Duplicate
                              </span>
                            )}
                            {q.needs_manual_options && (
                              <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
                                Needs Options
                              </span>
                            )}
                          </div>

                          {/* Accept / Reject Status controls */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Accept question"
                              onClick={() => setReviewStatus(q.id, q.review_status === "accepted" ? "pending" : "accepted")}
                              className={`p-1.5 rounded-lg transition-colors ${
                                q.review_status === "accepted" ? "text-emerald-600 bg-emerald-100" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              type="button"
                              title="Reject question"
                              onClick={() => setReviewStatus(q.id, q.review_status === "rejected" ? "pending" : "rejected")}
                              className={`p-1.5 rounded-lg transition-colors ${
                                q.review_status === "rejected" ? "text-red-600 bg-red-100" : "text-muted-foreground hover:text-red-600 hover:bg-red-50"
                              }`}
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              type="button"
                              title="Edit stem & options"
                              onClick={() => startEdit(q)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Edit3 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Phase 2 Determined Answer Banner */}
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {q.selected_answer != null ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <Check size={13} />
                                  Correct: Option {formatSelectedAnswer(q.selected_answer)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 bg-muted rounded">
                                  Not yet answered (Phase 2)
                                </span>
                              )}

                              {q.answer_source && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  Source: {q.answer_source === "study_material" ? "Study Material" : q.answer_source === "user_answer_key" ? "Answer Key" : "AI Solved"}
                                </span>
                              )}
                              {q.confidence && (
                                <span className="text-[11px] font-bold text-muted-foreground">
                                  [{q.confidence} confidence]
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => openAnswerOverride(q)}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                              <Edit3 size={12} /> Override Answer
                            </button>
                          </div>

                          {/* Needs Review Warning Banner */}
                          {q.needs_review && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold">Needs Review</p>
                                <p className="text-[11px] text-amber-800">{q.review_reason || "Uncertain or unverified answer."}</p>
                              </div>
                            </div>
                          )}

                          {/* Source Reference Tag */}
                          {q.source_reference && (
                            <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                              <BookOpen size={12} className="text-primary" /> {q.source_reference}
                            </p>
                          )}
                        </div>

                        {/* Inline Override Form */}
                        {isOverriding && (
                          <div className="rounded-xl border-2 border-primary bg-primary/5 p-3 space-y-2">
                            <p className="text-xs font-bold text-foreground">Change Correct Option:</p>
                            {q.question_type === "multiple_answer" ? (
                              <div className="flex flex-wrap gap-2">
                                {q.options.map((opt) => {
                                  const checked = overrideMulti.includes(opt.letter);
                                  return (
                                    <label key={opt.letter} className="flex items-center gap-1 text-xs cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          setOverrideMulti((prev) =>
                                            checked ? prev.filter((l) => l !== opt.letter) : [...prev, opt.letter]
                                          );
                                        }}
                                        className="accent-primary"
                                      />
                                      <span className="font-bold">{opt.letter}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {q.options.map((opt) => (
                                  <label key={opt.letter} className="flex items-center gap-1 text-xs cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`override-${q.id}`}
                                      value={opt.letter}
                                      checked={overrideAnswer === opt.letter}
                                      onChange={() => setOverrideAnswer(opt.letter)}
                                      className="accent-primary"
                                    />
                                    <span className="font-bold">{opt.letter})</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={saveAnswerOverride}
                                disabled={savingOverride}
                                className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg"
                              >
                                {savingOverride ? <Loader2 size={12} className="animate-spin" /> : "Save Answer"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOverrideQId(null)}
                                className="px-3 py-1 border border-border text-xs font-bold rounded-lg hover:bg-muted"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Stem & Options Display */}
                        {isEditing ? (
                          <div className="space-y-3 pt-2">
                            <textarea
                              value={editStem}
                              onChange={(e) => setEditStem(e.target.value)}
                              rows={3}
                              className="w-full rounded-xl border-2 border-primary px-3 py-2 text-sm focus:outline-none resize-none"
                            />
                            <div className="space-y-1.5">
                              {editOptions.map((o, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-muted-foreground w-6 text-center">{o.letter}</span>
                                  <input
                                    type="text"
                                    value={o.body}
                                    onChange={(e) => {
                                      const next = [...editOptions];
                                      next[oi] = { ...next[oi], body: e.target.value };
                                      setEditOptions(next);
                                    }}
                                    className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                                  />
                                  <button type="button" onClick={() => setEditOptions((prev) => prev.filter((_, i) => i !== oi))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextLetter = String.fromCharCode(65 + editOptions.length);
                                  setEditOptions([...editOptions, { letter: nextLetter, body: "" }]);
                                }}
                                className="text-xs text-primary font-bold hover:underline"
                              >
                                + Add option
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={saveEdit} disabled={savingEdit} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-primary-foreground text-xs font-bold disabled:opacity-50">
                                {savingEdit ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                              </button>
                              <button type="button" onClick={() => setEditingId(null)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground leading-relaxed">{q.stem}</p>
                            <div className="space-y-1 pl-1">
                              {q.options.map((o) => {
                                const isThisCorrect =
                                  q.selected_answer != null &&
                                  (Array.isArray(q.selected_answer)
                                    ? q.selected_answer.includes(o.letter)
                                    : String(q.selected_answer).toUpperCase() === o.letter.toUpperCase());

                                return (
                                  <p
                                    key={o.letter}
                                    className={`text-xs rounded-lg px-2.5 py-1 transition-colors ${
                                      isThisCorrect
                                        ? "font-bold text-emerald-900 bg-emerald-100/70 border border-emerald-300"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    <span className="font-mono font-bold">{o.letter}.</span> {o.body}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 4 — IMPORT TO LIVE COURSE
        ══════════════════════════════════════════════════════════════════ */}
        {step === "import" && activeSession && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <h2 className="font-black text-base mb-4 flex items-center gap-2">
                <Import size={18} className="text-primary" /> Import Accepted MCQs to Course
              </h2>

              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-3">
                  <p className="text-xl font-black text-emerald-700">{stats.accepted}</p>
                  <p className="text-xs text-emerald-900">Accepted (will be imported)</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xl font-black text-foreground">{stats.answered}</p>
                  <p className="text-xs text-muted-foreground">With Correct Answers</p>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3">
                  <p className="text-xl font-black text-amber-700">{stats.needsReview}</p>
                  <p className="text-xs text-amber-900">Flagged Needs Review</p>
                </div>
              </div>

              {stats.accepted === 0 && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} /> No accepted questions yet. Go back to Review and accept questions to import.
                </div>
              )}

              {/* Course dropdowns */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Course</label>
                  <select
                    value={importCourseId}
                    onChange={(e) => setImportCourseId(e.target.value)}
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}{c.year ? ` (Year ${c.year})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Group</label>
                  <select
                    value={importGroupId}
                    onChange={(e) => setImportGroupId(e.target.value)}
                    disabled={!importCourseId}
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Select group…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Subject</label>
                  <select
                    value={importSubjectId}
                    onChange={(e) => setImportSubjectId(e.target.value)}
                    disabled={!importGroupId}
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Select subject…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Import result */}
            {importResult && (
              <div className={`rounded-2xl border-2 p-6 ${importResult.inserted > 0 ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                <h3 className="font-black text-base mb-3 flex items-center gap-2">
                  <CheckCircle2 size={18} className={importResult.inserted > 0 ? "text-emerald-600" : "text-amber-600"} />
                  Import Result
                </h3>
                <div className="flex flex-wrap gap-4 text-sm mb-2">
                  <p><span className="font-black text-emerald-700 text-xl">{importResult.inserted}</span> inserted into live course</p>
                  <p><span className="font-black text-amber-700 text-xl">{importResult.skipped}</span> skipped (already exist)</p>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-bold text-red-600 mb-1">{importResult.errors.length} error{importResult.errors.length === 1 ? "" : "s"}:</p>
                    <div className="rounded-lg bg-red-50 border border-red-200 p-2 max-h-32 overflow-y-auto">
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-700 font-mono">{e}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Import button */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("review")}
                className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-5 py-3 text-sm font-bold hover:bg-muted"
              >
                ← Back to Review
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !importSubjectId || stats.accepted === 0}
                className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-primary-foreground font-black text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <><Loader2 size={18} className="animate-spin" /> Importing…</>
                ) : (
                  <><Import size={18} /> Import {stats.accepted} Questions</>
                )}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function BrainIcon(props: any) {
  return <Cpu {...props} />;
}
