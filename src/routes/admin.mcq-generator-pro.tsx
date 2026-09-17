import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldAlert, Upload, Cpu, CheckCircle2, XCircle, Clock, Trash2,
  Loader2, ChevronDown, ChevronUp, RefreshCw, BookOpen, Edit3,
  AlertTriangle, Copy, Eye, EyeOff, Filter, Import, Key,
  FileText, Layers, MoreHorizontal, RotateCcw, Save, X,
  ChevronsUpDown, AlertCircle, Star,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadPdfForRenderPreferWorker } from "@/lib/pdf-page-render";
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
} from "@/lib/mcq-generator-pro.functions";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/admin/mcq-generator-pro")({
  head: () => ({
    meta: [
      { title: "MCQ Generator Pro — AquaQBank Admin" },
      { name: "description", content: "Restricted admin tool to extract MCQ questions from scanned PDF exams using AI vision." },
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
};

type FilterTab = "all" | "duplicates" | "needs_options" | "accepted" | "rejected" | "pending";

type Course = { id: string; title: string; year?: number | null };
type Group = { id: string; name: string; course_id: string };
type SubjectRow = { id: string; name: string; group_id: string };

type Step = "configure" | "processing" | "review" | "import";

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

  // ── Configuration ──
  const [file, setFile]                 = useState<File | null>(null);
  const [modelId, setModelId]           = useState("gemini-2.5-flash");
  const [combinationMode, setCombinationMode] = useState<"keep" | "convert">("keep");
  const [missingOptsMode, setMissingOptsMode] = useState<"manual" | "ai_generate">("manual");
  const [aiNotes, setAiNotes]           = useState("");
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // ── Processing ──
  const [processing, setProcessing]     = useState(false);
  const [processLog, setProcessLog]     = useState<string[]>([]);
  const [currentPage, setCurrentPage]   = useState(0);
  const [totalPages, setTotalPages]     = useState(0);
  const cancelledRef                    = useRef(false);
  const [pagesQCount, setPagesQCount]   = useState<Record<number, number>>({});

  // ── Review ──
  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editStem, setEditStem]         = useState("");
  const [editOptions, setEditOptions]   = useState<McqOption[]>([]);
  const [editType, setEditType]         = useState<"single_choice" | "multiple_answer">("single_choice");
  const [savingEdit, setSavingEdit]     = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [rejectingDupes, setRejectingDupes] = useState(false);

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

  // ─── Start processing ────────────────────────────────────────────────────

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
      // Load PDF
      log("📄 Loading PDF…");
      pdf = await loadPdfForRenderPreferWorker(file);
      numPages = pdf.numPages ?? 0;
      setTotalPages(numPages);
      log(`📄 PDF loaded — ${numPages} page${numPages === 1 ? "" : "s"}`);

      // Create session
      const sess = await createMcqSession({
        data: {
          pdfName: file.name,
          totalPages: numPages,
          model: modelId,
          combinationMode,
          missingOptsMode,
          aiNotes: aiNotes || undefined,
        },
      });
      sessionId = sess.sessionId;
      log(`✅ Session created (${sessionId.slice(0, 8)}…)`);
      await loadSessions();

      // Process each page
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
        // Finalize
        log("⚙️ Running duplicate detection…");
        const fin = await finalizeSession({ data: { sessionId } });
        log(`✅ Done! Duplicates found: ${fin.duplicatesFound}`);

        // Load the full session + questions for review
        const fullData = await getMcqSession({ data: { sessionId } });
        setActiveSession(fullData.session as Session);
        setActiveQuestions(fullData.questions as McqQuestion[]);
        setStep("review");
        await loadSessions();
        toast.success("Extraction complete! Review your questions below.");
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

  async function handleCancel() {
    cancelledRef.current = true;
    toast.info("Cancelling after current page…");
  }

  // ─── Review actions ──────────────────────────────────────────────────────

  function filteredQuestions(): McqQuestion[] {
    switch (filterTab) {
      case "duplicates":    return activeQuestions.filter((q) => q.is_duplicate);
      case "needs_options": return activeQuestions.filter((q) => q.needs_manual_options);
      case "accepted":      return activeQuestions.filter((q) => q.review_status === "accepted");
      case "rejected":      return activeQuestions.filter((q) => q.review_status === "rejected");
      case "pending":       return activeQuestions.filter((q) => q.review_status === "pending");
      default:              return activeQuestions;
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

  // ── Inline editing ──

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
    total:      activeQuestions.length,
    accepted:   activeQuestions.filter((q) => q.review_status === "accepted").length,
    rejected:   activeQuestions.filter((q) => q.review_status === "rejected").length,
    pending:    activeQuestions.filter((q) => q.review_status === "pending").length,
    duplicates: activeQuestions.filter((q) => q.is_duplicate).length,
    needsOpts:  activeQuestions.filter((q) => q.needs_manual_options).length,
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
            <p className="text-sm text-red-600 mt-0.5">Admin-only tool — Extract MCQ questions from scanned PDFs using AI Vision</p>
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
                    <p className="font-bold text-sm truncate">{s.pdf_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(s.created_at)} · {s.total_pages} pages · {s.questions_extracted} Qs extracted · {s.duplicates_found} dupes
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusColor(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{MODEL_OPTIONS.find((m) => m.id === s.model)?.label ?? s.model}</span>
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
        <div className="flex gap-1 rounded-xl border-2 border-border bg-card p-1 w-fit">
          {(["configure", "processing", "review", "import"] as Step[]).map((s, i) => {
            const labels = ["⚙️ Configure", "⚡ Process", "🔍 Review", "📥 Import"];
            const enabled = s === "configure" || s === step ||
              (s === "review" && !!activeSession) ||
              (s === "import" && !!activeSession);
            return (
              <button
                key={s}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  if (enabled && s !== "processing") setStep(s);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            STEP 1 — CONFIGURE
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
                  <Cpu size={18} className="text-primary" /> AI Model
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
                <Edit3 size={18} className="text-primary" /> AI Notes
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Extra instructions injected into every page prompt. The AI will follow these strictly.</p>
              <textarea
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                placeholder="e.g. This is a pharmacology exam. Questions always have exactly 5 options (A–E). Ignore any header text that says 'Model Exam'. If a question has 2 options, keep only those 2..."
                rows={4}
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
            STEP 2 — PROCESSING
        ══════════════════════════════════════════════════════════════════ */}
        {step === "processing" && (
          <div className="space-y-6">
            {/* Progress */}
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-base flex items-center gap-2">
                  <Cpu size={18} className="text-primary" />
                  {processing ? "Extracting Questions…" : "Extraction Complete"}
                </h2>
                {processing && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-red-600 font-bold text-sm hover:bg-red-100"
                  >
                    <X size={14} /> Cancel
                  </button>
                )}
              </div>

              {/* Progress bar */}
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

              {/* Stats */}
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

              {/* Log */}
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
            STEP 3 — REVIEW
        ══════════════════════════════════════════════════════════════════ */}
        {step === "review" && activeSession && (
          <div className="space-y-4">

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total",      value: stats.total,      color: "text-foreground" },
                { label: "Accepted",   value: stats.accepted,   color: "text-emerald-600" },
                { label: "Rejected",   value: stats.rejected,   color: "text-red-600" },
                { label: "Pending",    value: stats.pending,    color: "text-amber-600" },
                { label: "Duplicates", value: stats.duplicates, color: "text-purple-600" },
                { label: "Needs Opts", value: stats.needsOpts,  color: "text-orange-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border-2 border-border bg-card p-3 text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap gap-2 items-center">
              {stats.duplicates > 0 && (
                <button
                  type="button"
                  onClick={handleRejectDuplicates}
                  disabled={rejectingDupes}
                  className="flex items-center gap-2 rounded-xl border-2 border-purple-300 bg-purple-50 px-4 py-2 text-purple-700 font-bold text-sm hover:bg-purple-100 disabled:opacity-50"
                >
                  {rejectingDupes ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                  Reject All Duplicates ({stats.duplicates})
                </button>
              )}
              <button
                type="button"
                onClick={() => setBulkSelecting((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2 font-bold text-sm transition-colors ${
                  bulkSelecting ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 size={14} /> Bulk Select
              </button>
              {bulkSelecting && selectedIds.size > 0 && (
                <>
                  <button type="button" onClick={() => handleBulkStatus("accepted")} className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700 font-bold text-xs hover:bg-emerald-100">
                    <CheckCircle2 size={12} /> Accept ({selectedIds.size})
                  </button>
                  <button type="button" onClick={() => handleBulkStatus("rejected")} className="flex items-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-red-700 font-bold text-xs hover:bg-red-100">
                    <XCircle size={12} /> Reject ({selectedIds.size})
                  </button>
                  <button type="button" onClick={() => handleBulkStatus("pending")} className="flex items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3 py-2 text-muted-foreground font-bold text-xs hover:bg-muted">
                    <RotateCcw size={12} /> Reset ({selectedIds.size})
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setStep("import")}
                className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-primary-foreground font-black text-sm hover:opacity-90"
              >
                <Import size={14} /> Go to Import
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1">
              {(["all", "pending", "accepted", "rejected", "duplicates", "needs_options"] as FilterTab[]).map((tab) => {
                const counts: Record<FilterTab, number> = {
                  all: stats.total, pending: stats.pending, accepted: stats.accepted,
                  rejected: stats.rejected, duplicates: stats.duplicates, needs_options: stats.needsOpts,
                };
                const labels: Record<FilterTab, string> = {
                  all: "All", pending: "Pending", accepted: "Accepted",
                  rejected: "Rejected", duplicates: "Duplicates", needs_options: "Needs Options",
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      filterTab === tab ? "bg-primary text-primary-foreground" : "bg-card border-2 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labels[tab]} <span className="opacity-70">({counts[tab]})</span>
                  </button>
                );
              })}
            </div>

            {/* Question List */}
            <div className="space-y-2">
              {filteredQuestions().length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                  No questions in this filter.
                </div>
              ) : (
                filteredQuestions().map((q, idx) => {
                  const isEditing = editingId === q.id;
                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border-2 bg-card transition-colors ${
                        q.review_status === "accepted" ? "border-emerald-300 bg-emerald-50/30" :
                        q.review_status === "rejected" ? "border-red-200 bg-red-50/20 opacity-60" :
                        q.is_duplicate ? "border-purple-300 bg-purple-50/20" :
                        "border-border"
                      }`}
                    >
                      {/* Question header */}
                      <div className="flex items-start gap-3 px-4 py-3">
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
                            className="mt-1 accent-primary shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            <span className="text-xs font-mono text-muted-foreground">P{q.page_number}{q.question_number ? ` Q${q.question_number}` : ""}</span>
                            {q.is_duplicate && <span className="text-xs font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-md">DUPLICATE</span>}
                            {q.needs_manual_options && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-md">NEEDS OPTIONS</span>}
                            {q.options_generated_by_ai && <span className="text-xs font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-md">AI OPTIONS</span>}
                            {q.question_type === "multiple_answer" && <span className="text-xs font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded-md">MULTI-ANSWER</span>}
                          </div>

                          {isEditing ? (
                            <div className="space-y-3">
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
                            <>
                              <p className="text-sm font-medium text-foreground leading-relaxed">{q.stem}</p>
                              <div className="mt-2 space-y-1">
                                {q.options.map((o) => (
                                  <p key={o.letter} className="text-xs text-muted-foreground">
                                    <span className="font-mono font-bold text-foreground/70">{o.letter}.</span> {o.body}
                                  </p>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              title="Accept"
                              onClick={() => setReviewStatus(q.id, q.review_status === "accepted" ? "pending" : "accepted")}
                              className={`p-1.5 rounded-lg transition-colors ${q.review_status === "accepted" ? "text-emerald-600 bg-emerald-100" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"}`}
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button
                              type="button"
                              title="Reject"
                              onClick={() => setReviewStatus(q.id, q.review_status === "rejected" ? "pending" : "rejected")}
                              className={`p-1.5 rounded-lg transition-colors ${q.review_status === "rejected" ? "text-red-600 bg-red-100" : "text-muted-foreground hover:text-red-600 hover:bg-red-50"}`}
                            >
                              <XCircle size={18} />
                            </button>
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => startEdit(q)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Edit3 size={16} />
                            </button>
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
            STEP 4 — IMPORT
        ══════════════════════════════════════════════════════════════════ */}
        {step === "import" && activeSession && (
          <div className="space-y-6">

            {/* Summary */}
            <div className="rounded-2xl border-2 border-border bg-card p-6">
              <h2 className="font-black text-base mb-4 flex items-center gap-2">
                <Import size={18} className="text-primary" /> Import to Course
              </h2>
              <div className="flex flex-wrap gap-4 text-sm mb-4">
                <p><span className="font-bold text-emerald-600">{stats.accepted}</span> questions will be imported (accepted)</p>
                <p><span className="font-bold text-red-500">{stats.rejected}</span> rejected (skipped)</p>
                <p><span className="font-bold text-amber-500">{stats.pending}</span> pending (will be skipped)</p>
              </div>
              {stats.accepted === 0 && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} /> No accepted questions yet. Go back to Review and accept some questions first.
                </div>
              )}

              {/* Course selector */}
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
                  <p><span className="font-black text-emerald-700 text-xl">{importResult.inserted}</span> inserted</p>
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
