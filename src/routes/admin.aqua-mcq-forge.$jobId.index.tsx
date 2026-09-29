import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  FileUp,
  Trash2,
  Sparkles,
  Sliders,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Wand2,
  Layers,
  CheckCheck,
  RefreshCw,
  FolderPlus,
  Compass,
  FileText,
  ExternalLink,
  Zap,
  Globe,
  Image as ImageIcon,
} from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  amfGetJob,
  amfUpdateJob,
  amfAddPdfSource,
  amfDeletePdfSource,
  amfDiscoverTopics,
  amfUpdateTopic,
  amfGenerateBatch,
} from "@/lib/aqua-mcq-forge.functions";

const SOURCE_BUCKET = "amf-sources";

export const Route = createFileRoute("/admin/aqua-mcq-forge/$jobId/")({
  head: () => ({
    meta: [
      { title: "MCQ Forge Studio — AquaQBank" },
      { name: "description", content: "Author and configure textbook MCQ generation." },
    ],
  }),
  component: AquaMcqForgeStudio,
});

function AquaMcqForgeStudio() {
  const { jobId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) guardRedirect(navigate);
  }, [loading, user, navigate]);

  const getJob = useServerFn(amfGetJob);
  const updateJob = useServerFn(amfUpdateJob);
  const addPdfSource = useServerFn(amfAddPdfSource);
  const deletePdfSource = useServerFn(amfDeletePdfSource);
  const discoverTopics = useServerFn(amfDiscoverTopics);
  const updateTopic = useServerFn(amfUpdateTopic);
  const generateBatch = useServerFn(amfGenerateBatch);

  const [job, setJob] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, pending: 0, approved: 0, rejected: 0, needsReview: 0, imported: 0 });
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("sources");

  // Runner state
  const [running, setRunning] = useState(false);
  const [runnerLog, setRunnerLog] = useState<string[]>([]);
  const stopRunnerRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const res: any = await getJob({ data: { jobId } });
      setJob(res.job);
      setSources(res.sources ?? []);
      setTopics(res.topics ?? []);
      setStats(res.stats ?? {});
    } catch (e: any) {
      toast.error(e?.message || "Failed to load job details.");
    } finally {
      setBusy(false);
    }
  }, [getJob, jobId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // PDF Text Extraction & Upload
  async function handleSourceUpload(file: File) {
    if (file.size > 80 * 1024 * 1024) {
      toast.error("File is too large. Please select a PDF smaller than 80 MB.");
      return;
    }
    setBusy(true);
    const storagePath = `${jobId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    try {
      toast.info("Extracting text from PDF in browser...");
      const { loadPdfForText, getPageText, clearPdfRenderCache } = await import("@/lib/pdf-page-render");
      const doc = await loadPdfForText(file);
      const pages: string[] = [];
      for (let p = 1; p <= Number(doc.numPages || 0); p++) {
        pages.push(await getPageText(doc, p));
      }
      clearPdfRenderCache();

      if (!pages.some((page) => page.trim())) {
        throw new Error("No readable text found in this PDF. Please ensure it is not scanned images only.");
      }

      toast.info("Uploading PDF to private storage...");
      let uploadError: any = null;
      const res1 = await supabase.storage.from("amf-sources").upload(storagePath, file, { contentType: "application/pdf" });
      if (res1.error) {
        const res2 = await supabase.storage.from("amg-sources").upload(storagePath, file, { contentType: "application/pdf" });
        if (res2.error) uploadError = res2.error;
      }
      if (uploadError) throw uploadError;

      await addPdfSource({
        data: {
          jobId,
          fileName: file.name,
          storagePath,
          pages,
        },
      });

      toast.success(`Textbook added (${pages.length} pages).`);
      await refresh();
      setActiveTab("topics");
    } catch (err: any) {
      await Promise.allSettled([
        supabase.storage.from("amf-sources").remove([storagePath]),
        supabase.storage.from("amg-sources").remove([storagePath]),
      ]);
      toast.error(err?.message || "Failed to extract PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSource(sourceId: string) {
    if (!confirm("Remove this textbook source?")) return;
    setBusy(true);
    try {
      await deletePdfSource({ data: { sourceId } });
      toast.success("Source removed.");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove source.");
    } finally {
      setBusy(false);
    }
  }

  // Topic Auto-Detection
  async function handleDiscoverTopics() {
    setBusy(true);
    try {
      toast.info("Analyzing textbook chapters with AI...");
      const res: any = await discoverTopics({ data: { jobId } });
      toast.success(`Identified ${res.length} topics!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Topic discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  // Live Generator Runner
  async function startGeneration() {
    if (!sources || sources.length === 0) {
      toast.error("Please upload at least one textbook PDF before starting generation.");
      return;
    }
    stopRunnerRef.current = false;
    setRunning(true);
    const modeLabel = topics.length === 0 ? "Full Document Mode (Single Topic)" : `${topics.length} Sub-Topic Mode`;
    const apiLabel = job?.api_mode === "batch" ? "💰 50% Batch API (Cost Saver)" : "⚡ Standard Realtime API";
    setRunnerLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Generation started [${modeLabel} • ${apiLabel}]...`,
      ...prev,
    ]);

    try {
      const targetCount = job.coverageMode ? 50 : (job.total_questions ?? 20);
      const batchSize = job?.api_mode === "batch" ? 3 : 2;

      while (!stopRunnerRef.current) {
        setRunnerLog((prev) => [`[${new Date().toLocaleTimeString()}] Authoring next question batch...`, ...prev.slice(0, 50)]);
        const res: any = await generateBatch({ data: { jobId, batchSize } });

        if (res.failures?.length) {
          for (const f of res.failures) {
            setRunnerLog((prev) => [`⚠️ ${f}`, ...prev.slice(0, 50)]);
          }
        }

        if (res.newItems?.length) {
          for (const item of res.newItems) {
            const imgBadge = item.hasImage ? " 🎨 [Pure AI Medical Diagram]" : "";
            setRunnerLog((prev) => [
              `✅ Authored #${item.order}: [${item.form === "B" ? "Combined" : "Standard"}] ${item.difficulty.toUpperCase()} — "${item.stem.slice(0, 60)}..."${imgBadge}`,
              ...prev.slice(0, 50),
            ]);
          }
          await refresh();
        } else if (res.generatedCount > 0) {
          setRunnerLog((prev) => [`✅ Authored ${res.generatedCount} question(s) — Total in job: ${res.totalItems}`, ...prev.slice(0, 50)]);
          await refresh();
        }

        if (res.totalItems >= targetCount) {
          setRunnerLog((prev) => [`🎉 Target of ${targetCount} questions reached!`, ...prev.slice(0, 50)]);
          toast.success("Target question count reached!");
          break;
        }

        if (res.generatedCount === 0 && res.failures?.length > 2) {
          setRunnerLog((prev) => [`[${new Date().toLocaleTimeString()}] Pausing due to repeated issues.`, ...prev.slice(0, 50)]);
          break;
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Generation error.");
      setRunnerLog((prev) => [`❌ Error: ${err?.message}`, ...prev.slice(0, 50)]);
    } finally {
      setRunning(false);
      await refresh();
    }
  }

  function stopGeneration() {
    stopRunnerRef.current = true;
    setRunning(false);
    setRunnerLog((prev) => [`[${new Date().toLocaleTimeString()}] Generation paused by user.`, ...prev.slice(0, 50)]);
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={30} />
      </div>
    );
  }

  const targetCount = job.coverageMode ? "Coverage Mode" : (job.total_questions ?? 20);
  const progressPct = job.total_questions ? Math.min(100, Math.round(((stats.total ?? 0) / job.total_questions) * 100)) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Studio Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              <Link to="/admin/aqua-mcq-forge" className="hover:text-indigo-600 transition flex items-center gap-1">
                <ArrowLeft size={13} /> All Jobs
              </Link>
              <span>/</span>
              <span>Studio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2.5">
              <span>{job.name}</span>
              <Badge
                variant="secondary"
                className={
                  job.source_mode === "strict"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }
              >
                {job.source_mode === "strict" ? "🔒 Strict Source" : "🧠 Source + Reasoning"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  job.api_mode === "batch"
                    ? "bg-amber-50 text-amber-700 border-amber-300 font-bold"
                    : "bg-slate-50 text-slate-700 border-slate-300 font-medium"
                }
              >
                {job.api_mode === "batch" ? "💰 50% Batch API (Cost Saver)" : "⚡ Standard Realtime API"}
              </Badge>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                {topics.length === 0 ? "📄 Full Document Mode (Single Topic)" : `📑 ${topics.length} Sub-Topics`}
              </Badge>
              {job.include_images && (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  🎨 Pure AI Diagrams
                </Badge>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
              <span>
                Model: <strong className="text-slate-700">{job.model}</strong>
              </span>
              <span>•</span>
              <span>
                Difficulty: {job.difficulty_easy}% E / {job.difficulty_medium}% M / {job.difficulty_hard}% H
              </span>
              <span>•</span>
              <span>
                Shape: {job.ai_decides_type ? "AI Decides" : `${job.type_standard}% Std / ${job.type_combined}% Comb`}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId }}>
              <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2">
                <CheckCheck size={16} /> Review Questions ({stats.total ?? 0})
              </Button>
            </Link>
            <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId }}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <ExternalLink size={16} /> Open Review & Import
              </Button>
            </Link>
          </div>
        </div>

        {/* Global Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          <Card className="bg-white border-slate-200/80 shadow-none">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-black text-slate-900">{stats.total ?? 0}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Authored</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200/80 shadow-none">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-black text-amber-600">{stats.pending ?? 0}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Review</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200/80 shadow-none">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-black text-emerald-600">{stats.approved ?? 0}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Approved</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200/80 shadow-none">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-black text-rose-600">{stats.needsReview ?? 0}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Needs Review</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200/80 shadow-none">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-black text-indigo-600">{stats.imported ?? 0}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Imported to Course</div>
            </CardContent>
          </Card>
        </div>

        {/* Studio Tabs */}
        <div className="mt-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-white p-1 border border-slate-200 rounded-2xl grid grid-cols-4 max-w-2xl">
              <TabsTrigger value="sources" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 text-xs font-bold">
                <BookOpen size={15} /> 1. Sources ({sources.length})
              </TabsTrigger>
              <TabsTrigger value="topics" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 text-xs font-bold">
                <Compass size={15} /> 2. Topics ({topics.length})
              </TabsTrigger>
              <TabsTrigger value="tuning" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 text-xs font-bold">
                <Sliders size={15} /> 3. Tuning
              </TabsTrigger>
              <TabsTrigger value="generator" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 text-xs font-bold">
                <Play size={15} /> 4. Generator
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: SOURCES */}
            <TabsContent value="sources" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <FileUp className="text-indigo-600" size={20} />
                    Textbook PDF Knowledge Sources
                  </CardTitle>
                  <CardDescription>
                    Upload medical textbooks or chapter PDFs. Text is extracted directly in your browser.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Upload input */}
                  <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-8 text-center transition bg-slate-50/50">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                      <FileUp size={24} />
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">Upload Textbook or Lecture PDF</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Selectable text PDF (up to 80 MB). Fast in-browser extraction.
                    </p>
                    <div className="mt-4 inline-block">
                      <Label htmlFor="pdf-upload" className="cursor-pointer">
                        <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 pointer-events-none">
                          <span>Browse PDF</span>
                        </Button>
                      </Label>
                      <Input
                        id="pdf-upload"
                        type="file"
                        accept="application/pdf"
                        disabled={busy}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleSourceUpload(f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>

                  {/* List of uploaded sources */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Uploaded Textbooks ({sources.length})
                    </Label>
                    {sources.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No textbooks uploaded yet. Upload one above.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                        {sources.map((s) => (
                          <div key={s.id} className="p-3.5 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                <BookOpen size={18} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-slate-900 truncate">{s.file_name}</div>
                                <div className="text-xs text-slate-500">
                                  {s.page_count} pages • Added {new Date(s.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-400 hover:text-rose-600"
                              onClick={() => handleRemoveSource(s.id)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: TOPICS & DISTRIBUTION */}
            <TabsContent value="topics" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Compass className="text-indigo-600" size={20} />
                      Topic & Chapter Distribution <span className="text-xs font-semibold text-slate-400 font-normal">(Optional)</span>
                    </CardTitle>
                    <CardDescription>
                      Control quotas per topic, or skip to author across the whole document directly.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("generator")}
                      className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      Skip to Generator →
                    </Button>
                    <Button
                      onClick={handleDiscoverTopics}
                      disabled={busy || sources.length === 0}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-xs"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      AI Auto-Detect Topics
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {topics.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50/50">
                      <div className="inline-flex p-3 rounded-full bg-indigo-50 text-indigo-600 mb-3">
                        <Compass size={28} />
                      </div>
                      <p className="text-sm font-bold text-slate-800">Single Topic or Entire Textbook Mode</p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                        Topic division is <strong>completely optional</strong>. If your PDF is for a single topic (e.g. <em>Cell Injury</em>), you can proceed directly to the generator to author questions across the entire document.
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        <Button
                          onClick={() => setActiveTab("generator")}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-bold"
                        >
                          <Play size={14} /> Proceed in Single-Topic Mode
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleDiscoverTopics}
                          disabled={busy || sources.length === 0}
                          className="text-xs gap-1.5 border-slate-300"
                        >
                          <Sparkles size={14} /> Detect Topics Anyway
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topics.map((t) => (
                        <div
                          key={t.id}
                          className={`p-4 rounded-xl border transition ${
                            t.enabled ? "bg-white border-slate-200" : "bg-slate-50/70 border-slate-200 opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={t.enabled}
                                  onCheckedChange={async (val) => {
                                    await updateTopic({ data: { topicId: t.id, patch: { enabled: val } } });
                                    await refresh();
                                  }}
                                />
                                <span className="font-bold text-sm text-slate-900">{t.name}</span>
                              </div>
                              {t.description && <p className="text-xs text-slate-500 pl-8">{t.description}</p>}
                            </div>

                            {t.enabled && (
                              <div className="flex items-center gap-4 text-xs font-semibold">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Min:</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={50}
                                    className="w-14 h-7 text-xs text-center p-1"
                                    value={t.min_questions}
                                    onChange={async (e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      await updateTopic({ data: { topicId: t.id, patch: { min_questions: val } } });
                                      await refresh();
                                    }}
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Target:</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={50}
                                    className="w-14 h-7 text-xs text-center p-1"
                                    value={t.target_questions}
                                    onChange={async (e) => {
                                      const val = parseInt(e.target.value) || 1;
                                      await updateTopic({ data: { topicId: t.id, patch: { target_questions: val } } });
                                      await refresh();
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: TUNING */}
            <TabsContent value="tuning" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Sliders className="text-indigo-600" size={20} />
                    Parameters & Authoring Rules
                  </CardTitle>
                  <CardDescription>
                    Adjust difficulty splits, deduplication sensitivity, and question formats.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* API Mode Selector: Standard vs 50% Batch */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                          <Zap size={14} className="text-indigo-600" /> API Generation Mode
                        </Label>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Choose between interactive real-time generation or 50% discounted batch processing.
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          job.api_mode === "batch"
                            ? "bg-amber-50 text-amber-700 border-amber-300 font-bold"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {job.api_mode === "batch" ? "💰 50% Batch Active" : "⚡ Standard Realtime"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await updateJob({ data: { jobId, patch: { api_mode: "standard" } } });
                          await refresh();
                        }}
                        className={`p-3.5 rounded-xl border text-left transition ${
                          job.api_mode !== "batch"
                            ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <Zap size={16} className="text-indigo-600" /> Standard API
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Interactive real-time execution with live terminal logs. Ideal for rapid testing.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await updateJob({ data: { jobId, patch: { api_mode: "batch" } } });
                          await refresh();
                        }}
                        className={`p-3.5 rounded-xl border text-left transition ${
                          job.api_mode === "batch"
                            ? "border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="font-bold text-sm text-amber-900 flex items-center gap-2">
                          <span className="text-base">💰</span> 50% Batch API Mode
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Token-efficient batch authoring with multi-question sharing to save 50% on API costs.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Pure AI Medical Diagrams */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                          <ImageIcon size={14} className="text-indigo-600" /> Pure AI Medical Diagrams
                        </Label>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Synthesizes original anatomical diagrams and clinical pathways from scratch using Flux / SDXL.
                        </p>
                      </div>
                      <Switch
                        checked={job.include_images}
                        onCheckedChange={async (val) => {
                          await updateJob({ data: { jobId, patch: { include_images: val } } });
                          await refresh();
                        }}
                      />
                    </div>

                    {job.include_images && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="text-slate-600 font-bold">How many questions should have an image?</span>
                            <p className="text-slate-400 mt-0.5">
                              Set a target count. Questions stop getting images once this number is reached.
                              Set to 0 to use the frequency mode below instead.
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={500}
                            className="w-20 h-8 text-sm text-center font-bold border-indigo-300 focus:ring-indigo-500"
                            value={job.image_target_count ?? 0}
                            onChange={async (e) => {
                              const val = parseInt(e.target.value) || 0;
                              await updateJob({ data: { jobId, patch: { image_target_count: val } } });
                              await refresh();
                            }}
                          />
                        </div>

                        {(job.image_target_count ?? 0) === 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                            <span className="text-slate-600 font-medium">Fallback Frequency:</span>
                            <div className="flex items-center gap-2">
                              {(["every", "half", "auto"] as const).map((mode) => (
                                <Button
                                  key={mode}
                                  type="button"
                                  size="sm"
                                  variant={job.image_frequency === mode ? "default" : "outline"}
                                  className={
                                    job.image_frequency === mode
                                      ? "bg-indigo-600 text-white text-xs h-7 font-bold"
                                      : "text-xs h-7 border-slate-300"
                                  }
                                  onClick={async () => {
                                    await updateJob({ data: { jobId, patch: { image_frequency: mode } } });
                                    await refresh();
                                  }}
                                >
                                  {mode === "every" ? "Every Question" : mode === "half" ? "Every 2nd" : "AI Decides"}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* External Medical Literature & Web Questions */}
                  <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Globe size={14} className="text-indigo-600" /> External Web &amp; Book Sourced Questions
                        </Label>
                        <p className="text-slate-500 mt-0.5">
                          How many questions should be sourced &amp; adapted from medical board question banks (USMLE Step 1, Robbins, PreTest) on this topic?
                          Set to 0 to only synthesize from the uploaded PDF text.
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={500}
                        className="w-20 h-8 text-sm text-center font-bold border-indigo-300 focus:ring-indigo-500"
                        value={job.external_questions_count ?? 0}
                        onChange={async (e) => {
                          const val = parseInt(e.target.value) || 0;
                          await updateJob({ data: { jobId, patch: { external_questions_count: val } } });
                          await refresh();
                        }}
                      />
                    </div>
                  </div>

                  {/* Difficulty Ratios */}
                  <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50">

                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Difficulty Ratios</Label>
                      <span className="text-xs font-mono font-bold text-indigo-600">
                        Total: {job.difficulty_easy + job.difficulty_medium + job.difficulty_hard}%
                      </span>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-emerald-700">Easy (Direct Recall, 1-step):</span>
                          <span>{job.difficulty_easy}%</span>
                        </div>
                        <Slider
                          value={[job.difficulty_easy]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={async ([val]) => {
                            await updateJob({ data: { jobId, patch: { difficulty_easy: val } } });
                            await refresh();
                          }}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-amber-700">Medium (Understanding, 2-step):</span>
                          <span>{job.difficulty_medium}%</span>
                        </div>
                        <Slider
                          value={[job.difficulty_medium]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={async ([val]) => {
                            await updateJob({ data: { jobId, patch: { difficulty_medium: val } } });
                            await refresh();
                          }}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-rose-700">Hard (Multi-step Clinical Reasoning):</span>
                          <span>{job.difficulty_hard}%</span>
                        </div>
                        <Slider
                          value={[job.difficulty_hard]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={async ([val]) => {
                            await updateJob({ data: { jobId, patch: { difficulty_hard: val } } });
                            await refresh();
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dedup threshold */}
                  <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="font-bold">Dedup Rejection Threshold</Label>
                      <span className="font-mono text-indigo-600 font-bold">{job.dup_threshold}%</span>
                    </div>
                    <Slider
                      value={[job.dup_threshold]}
                      min={50}
                      max={100}
                      step={1}
                      onValueChange={async ([val]) => {
                        await updateJob({ data: { jobId, patch: { dup_threshold: val } } });
                        await refresh();
                      }}
                    />
                    <p className="text-xs text-slate-500">
                      Questions with similarity ≥ {job.dup_threshold}% are automatically rejected to avoid duplicates.
                    </p>
                  </div>

                  {/* Question Type Ratios */}
                  <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Wand2 size={14} className="text-indigo-600" /> Question Type Ratios
                        </Label>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Control what % of questions are clinical vignettes, tricky, recall, etc.
                          Set all to 0 for fully random. Values are relative (auto-normalized).
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-indigo-600">
                        Total:{" "}
                        {Object.values(job.objective_ratios ?? {}).reduce(
                          (a: number, b: unknown) => a + (Number(b) || 0),
                          0,
                        )}
                        %
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      {[
                        { id: "recall", label: "Direct Recall", color: "text-slate-700" },
                        { id: "understanding", label: "Understanding / Mechanism", color: "text-blue-700" },
                        { id: "clinical_vignette", label: "🏥 Clinical Vignette (Case Scenario)", color: "text-emerald-700" },
                        { id: "tricky", label: "🪤 Tricky / Red-Herring", color: "text-rose-700" },
                        { id: "comparison", label: "Comparison / Differentiation", color: "text-purple-700" },
                        { id: "application", label: "Application of Concepts", color: "text-amber-700" },
                        { id: "identification", label: "Identification / Diagnosis", color: "text-indigo-700" },
                        { id: "clinical_reasoning", label: "Clinical Case Reasoning", color: "text-teal-700" },
                        { id: "sequence", label: "Sequence / Step Progression", color: "text-orange-700" },
                        { id: "classification", label: "Classification / Taxonomy", color: "text-cyan-700" },
                      ].map(({ id, label, color }) => {
                        const currentVal = Number((job.objective_ratios ?? {})[id] ?? 0);
                        return (
                          <div key={id}>
                            <div className="flex justify-between font-semibold mb-1">
                              <span className={color}>{label}:</span>
                              <span>{currentVal}%</span>
                            </div>
                            <Slider
                              value={[currentVal]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={async ([val]) => {
                                const newRatios = { ...(job.objective_ratios ?? {}), [id]: val };
                                await updateJob({ data: { jobId, patch: { objective_ratios: newRatios } } });
                                await refresh();
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4: GENERATOR RUNNER */}
            <TabsContent value="generator" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Play className="text-indigo-600" size={20} />
                    Live Question Authoring Engine
                  </CardTitle>
                  <CardDescription>
                    Runs source extraction, question authoring, deduplication, and 7-point validation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Progress display */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Authored: {stats.total ?? 0}</span>
                      <span>Target: {targetCount}</span>
                    </div>
                    <Progress value={progressPct} className="h-3 rounded-full" />
                  </div>

                  {/* Generator Quick Configuration Bar */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-700">Generation Setup:</span>
                      <Badge variant="outline" className="bg-white border-slate-300 font-semibold text-slate-800">
                        {topics.length === 0 ? "📄 Full Document (Single Topic)" : `📑 ${topics.length} Sub-Topics`}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          job.api_mode === "batch"
                            ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200 font-medium"
                        }
                      >
                        {job.api_mode === "batch" ? "💰 50% Batch API" : "⚡ Standard Realtime"}
                      </Badge>
                      {job.include_images && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold">
                          🎨 AI Diagrams Active
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`text-xs h-7 gap-1 font-semibold ${
                          job.api_mode === "batch" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-slate-700"
                        }`}
                        onClick={async () => {
                          const next = job.api_mode === "batch" ? "standard" : "batch";
                          await updateJob({ data: { jobId, patch: { api_mode: next } } });
                          await refresh();
                        }}
                      >
                        {job.api_mode === "batch" ? "💰 Mode: 50% Batch" : "⚡ Mode: Standard"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`text-xs h-7 gap-1 font-semibold ${
                          job.include_images ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white text-slate-700"
                        }`}
                        onClick={async () => {
                          await updateJob({ data: { jobId, patch: { include_images: !job.include_images } } });
                          await refresh();
                        }}
                      >
                        <ImageIcon size={13} />
                        {job.include_images ? "AI Diagrams: ON" : "AI Diagrams: OFF"}
                      </Button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3">
                    {!running ? (
                      <Button
                        onClick={startGeneration}
                        disabled={busy || sources.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold px-6 shadow-sm"
                      >
                        <Play size={16} /> Start Generation
                      </Button>
                    ) : (
                      <Button onClick={stopGeneration} variant="destructive" className="gap-2 font-bold px-6">
                        <Pause size={16} /> Pause Generation
                      </Button>
                    )}

                    <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId }}>
                      <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2">
                        <CheckCheck size={16} /> Open Review Screen ({stats.total ?? 0})
                      </Button>
                    </Link>
                  </div>

                  {/* Live Activity Terminal */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Generation Activity Log
                    </Label>
                    <div className="h-64 rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300 overflow-y-auto space-y-1.5 border border-slate-800">
                      {runnerLog.length === 0 ? (
                        <span className="text-slate-600">Ready to start. Click 'Start Generation' above.</span>
                      ) : (
                        runnerLog.map((log, i) => (
                          <div key={i} className="leading-relaxed">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
