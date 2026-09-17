import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldAlert, ShieldCheck, Lock, Unlock, Key, Cpu, Sparkles, FileText, CheckCircle2,
  AlertTriangle, ArrowRight, RefreshCw, Upload, Eye, Trash2, Check, X, Layers,
  BookOpen, ListFilter, Copy, HelpCircle, Terminal, Flame, Database, ChevronRight,
  ExternalLink, ChevronDown, ChevronUp, Search, PlusCircle, Wrench
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
  detectDuplicates124,
  solveAndExplain124,
  importQuestions124,
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

type Stage = "extract" | "solve" | "import";
type ComboMode = "mode1_keep_original" | "mode2_convert_multiple";
type SolveSource = "ai" | "source_material" | "answer_key";

interface SolvedQuestionState extends ExtractedQuestion {
  selectedAnswer?: string;
  concept?: string;
  explanation?: string;
  summaryTable?: string;
  solveStatus: "unsolved" | "solving" | "solved" | "error";
  solveError?: string;
  isIgnored?: boolean;
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
  const [comboMode, setComboMode] = useState<ComboMode>("mode1_keep_original");
  const [useBatch50, setUseBatch50] = useState<boolean>(true);
  const [customInstructions, setCustomInstructions] = useState<string>("");
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

  // Missing options modal/drawer
  const [resolvingMissingQ, setResolvingMissingQ] = useState<SolvedQuestionState | null>(null);
  const [manualOptionText, setManualOptionText] = useState<string>("");

  // ── Stage 2: Solving State ────────────────────────────────────────────────
  const [solveSource, setSolveSource] = useState<SolveSource>("ai");
  const [studyMaterialText, setStudyMaterialText] = useState<string>("");
  const [studyMaterialName, setStudyMaterialName] = useState<string>("");
  const [answerKeyText, setAnswerKeyText] = useState<string>("");
  const [isSolving, setIsSolving] = useState<boolean>(false);
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

  // Inspector Preview Modal
  const [inspectingQuestion, setInspectingQuestion] = useState<SolvedQuestionState | null>(null);

  // ── Server Functions ──────────────────────────────────────────────────────
  const extractPageFn = useServerFn(extractPageQuestions124);
  const fillMissingFn = useServerFn(fillMissingOptions124);
  const solveQuestionFn = useServerFn(solveAndExplain124);
  const importFn = useServerFn(importQuestions124);

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
      toast.success(`PDF Loaded: ${file.name} (${doc.numPages} pages)`);
    } catch (err: any) {
      toast.error(`Failed to load PDF: ${err?.message || err}`);
    }
  }

  // ── Render Page Thumbnail ─────────────────────────────────────────────────
  async function getPageJpeg(pageNum: number): Promise<string> {
    if (pageThumbnails[pageNum]) return pageThumbnails[pageNum];
    if (!pdfDoc) throw new Error("PDF Document not loaded");
    const canvas = await renderPageToCanvas(pdfDoc, pageNum, 1600);
    const jpeg = canvasToJpegBase64(canvas, 0.82);
    setPageThumbnails((prev) => ({ ...prev, [pageNum]: jpeg }));
    return jpeg;
  }

  // ── Start Stage 1 Extraction ──────────────────────────────────────────────
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

    setIsExtracting(true);
    setStage1Done(false);

    // Calculate pages to process (all pages, or 50% batch chunk if toggled)
    const pagesToRun = useBatch50 ? Math.ceil(totalPages * 0.5) : totalPages;
    setExtractProgress({ current: 0, total: pagesToRun });

    const collected: SolvedQuestionState[] = [];

    try {
      for (let p = 1; p <= pagesToRun; p++) {
        setExtractProgress({ current: p, total: pagesToRun });
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

      // Automatically run deduplication
      const { cleaned, duplicateCount } = detectDuplicates124(collected);
      setExtractedQuestions(cleaned);
      setStage1Done(true);

      if (duplicateCount > 0) {
        toast.info(`Extracted ${cleaned.length} questions. Found ${duplicateCount} duplicate questions.`);
      } else {
        toast.success(`Extracted ${cleaned.length} questions successfully across ${pagesToRun} pages!`);
      }
    } catch (err: any) {
      toast.error(`Extraction failed on page: ${err?.message || err}`);
    } finally {
      setIsExtracting(false);
    }
  }

  // Purge duplicates
  function purgeDuplicates() {
    const withoutDups = extractedQuestions.filter((q) => !q.isDuplicate);
    setExtractedQuestions(withoutDups);
    toast.success("Duplicates purged!");
  }

  // AI Fill Missing Options
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

  // Manual Add Option
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

  // ── Start Stage 2 Solving & Explaining ────────────────────────────────────
  async function startSolving() {
    const active = extractedQuestions.filter((q) => !q.isIgnored && !q.isDuplicate);
    if (active.length === 0) {
      toast.error("No active questions to solve.");
      return;
    }

    setIsSolving(true);
    setStage2Done(false);
    setSolveProgress({ current: 0, total: active.length });

    let currentIdx = 0;
    const updated = [...extractedQuestions];

    for (let i = 0; i < updated.length; i++) {
      const q = updated[i];
      if (q.isIgnored || q.isDuplicate) continue;

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
    toast.success("Solving & Explanation Generation complete!");
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

  // ── Restricted Clearance Lock Barrier ─────────────────────────────────────
  if (!clearanceUnlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-mono">
        {/* Ambient Grid Background */}
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
              <span className="text-slate-500">Isolation Sandbox:</span>
              <span className="text-amber-400 font-bold">SECURE SEPARATED</span>
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
                <ShieldCheck size={12} /> Restricted Level 4 Console
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-400">
                ● Active Sandbox
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <Terminal className="text-amber-400" size={26} /> {ENGINE_NAME}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Autonomous 3-stage pipeline: Vision extraction of rotated/blurred exam pages, Mode 1/2 combination solving, AquavisionX clinical explanations, and direct course bank integration.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 shadow-sm transition-all"
            >
              <Key size={14} className="text-amber-400" /> Dedicated API Keys & Models
              {showConfigPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Collapsible Engine Settings & API Keys Panel ───────────────────── */}
      {showConfigPanel && (
        <div className="border-b border-slate-800 bg-slate-900/90 px-6 py-6 transition-all">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* OpenAI Key */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                <span>OpenAI Engine Key</span>
                <span className="text-[10px] text-emerald-400 font-mono">Dedicated Storage</span>
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Pre-loaded with authorized engine testing key. Isolated from website global keys.
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
                Active Neural Model (All 5 Integrated)
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
                Choose model dynamically before each batch extraction or solve step.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3-Stage Progress Nav ───────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-3">
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
              Page-by-page vision, Mode 1/2 combos, missing options
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
              AI / Material / Key solve, AquavisionX explanations
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
              Target subject selection & error question inspector
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
                    {totalPages > 0 ? `${totalPages} pages ready for vision scan` : "Accepts high-res or photo PDFs"}
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
                    <span>Document: <strong className="text-white">{pdfFile?.name}</strong></span>
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
                    <Flame size={16} className="text-amber-400" /> Batch & Rate Control
                  </h3>

                  <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={useBatch50}
                      onChange={(e) => setUseBatch50(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">50% Batch Execution</div>
                      <div className="text-[10px] text-slate-400">
                        Process first 50% chunk to preserve quota and allow inspection before proceeding.
                      </div>
                    </div>
                  </label>
                </div>

                <button
                  disabled={!pdfDoc || isExtracting}
                  onClick={startExtraction}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-950/40 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Scanning Page {extractProgress.current} / {extractProgress.total}...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Run Process 1 (Vision Extraction)
                    </>
                  )}
                </button>
              </div>
            </div>

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

                  <div className="flex items-center gap-3">
                    {extractedQuestions.some((q) => q.isDuplicate) && (
                      <button
                        onClick={purgeDuplicates}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-all flex items-center gap-1.5"
                      >
                        <Trash2 size={14} /> Purge Duplicates ({extractedQuestions.filter((q) => q.isDuplicate).length})
                      </button>
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
                          : q.hasMissingOptions
                          ? "bg-amber-950/20 border-amber-700/50"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
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
                        </div>

                        <div className="flex items-center gap-2">
                          {q.hasMissingOptions && (
                            <button
                              onClick={() => setResolvingMissingQ(q)}
                              className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 flex items-center gap-1"
                            >
                              <Wrench size={12} /> Fix Missing Choices
                            </button>
                          )}
                          <button
                            onClick={() => setInspectingQuestion(q)}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
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
                <div className="mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-xs font-bold text-slate-300 block mb-2">
                    Paste Authority Study Material Text (or Book Chapter)
                  </label>
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

                <button
                  disabled={isSolving || extractedQuestions.length === 0}
                  onClick={startSolving}
                  className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md disabled:opacity-50 flex items-center gap-2 transition-all"
                >
                  {isSolving ? (
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
              </div>
            </div>

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
      </div>

      {/* ── Missing Options Modal ──────────────────────────────────────────── */}
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
