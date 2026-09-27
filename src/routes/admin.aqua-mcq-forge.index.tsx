import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Wand2,
  CheckCheck,
  ShieldCheck,
  Sliders,
  Play,
  UploadCloud,
  KeyRound,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  amfListJobs,
  amfCreateJob,
  amfDeleteJob,
  amfListKeys,
  amfSaveKey,
} from "@/lib/aqua-mcq-forge.functions";
import { AMF_MODELS } from "@/lib/aqua-mcq-forge.prompts";

export const Route = createFileRoute("/admin/aqua-mcq-forge/")({
  head: () => ({
    meta: [
      { title: "Aqua MCQ Forge — AI Textbook Question Generator" },
      { name: "description", content: "Author board-standard medical MCQs directly from textbook PDFs." },
    ],
  }),
  component: AquaMcqForgeDashboard,
});

function AquaMcqForgeDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) guardRedirect(navigate);
  }, [loading, user, navigate]);

  const listJobs = useServerFn(amfListJobs);
  const createJob = useServerFn(amfCreateJob);
  const deleteJob = useServerFn(amfDeleteJob);
  const listKeys = useServerFn(amfListKeys);
  const saveKey = useServerFn(amfSaveKey);

  const [jobs, setJobs] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState({ google: "", openai: "" });
  const [keyStatus, setKeyStatus] = useState<Record<string, string | null>>({});

  // New Job Form State
  const [form, setForm] = useState({
    name: "",
    provider: "google" as "google" | "openai",
    model: "gemini-3.5-flash",
    sourceMode: "strict" as "strict" | "reasoning",
    styleMode: "ai" as "ai" | "course" | "pdf",
    difficultyEasy: 34,
    difficultyMedium: 33,
    difficultyHard: 33,
    typeStandard: 50,
    typeCombined: 50,
    aiDecidesType: false,
    totalQuestions: 20,
    coverageMode: false,
    dupThreshold: 87,
    includeImages: false,
    imageCount: 0,
    sourceFidelityEnabled: true,
  });

  const refresh = useCallback(async () => {
    try {
      setFetching(true);
      const [jobsRes, keysRes]: any = await Promise.all([listJobs(), listKeys()]);
      setJobs(jobsRes as any[]);
      setKeyStatus(keysRes ?? {});
    } catch (e: any) {
      toast.error(e?.message || "Failed to load jobs");
    } finally {
      setFetching(false);
    }
  }, [listJobs, listKeys]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    const jobTitle = form.name.trim() || "Cell Injury — Pathophysiology Generation";
    try {
      setSaving(true);
      const newJob: any = await createJob({
        data: {
          name: jobTitle,
          provider: form.provider,
          model: form.model,
          sourceMode: form.sourceMode,
          styleMode: form.styleMode,
          difficultyEasy: form.difficultyEasy,
          difficultyMedium: form.difficultyMedium,
          difficultyHard: form.difficultyHard,
          typeStandard: form.typeStandard,
          typeCombined: form.typeCombined,
          aiDecidesType: form.aiDecidesType,
          totalQuestions: form.totalQuestions,
          coverageMode: form.coverageMode,
          dupThreshold: form.dupThreshold,
          includeImages: form.includeImages,
          imageCount: form.imageCount,
          sourceFidelityEnabled: form.sourceFidelityEnabled,
        },
      });
      toast.success("Generation job created!");
      setModalOpen(false);
      await refresh();
      if (newJob?.id) {
        navigate({ to: "/admin/aqua-mcq-forge/$jobId", params: { jobId: String(newJob.id) } });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not create job.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey(provider: "google" | "openai") {
    const val = keyInput[provider]?.trim();
    if (!val) {
      toast.error("Please enter a valid key.");
      return;
    }
    try {
      await saveKey({ data: { provider, apiKey: val } });
      toast.success(`${provider === "google" ? "Google AI Studio" : "OpenAI"} API Key saved!`);
      setKeyInput({ ...keyInput, [provider]: "" });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save key.");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete generation job "${name}" and all its questions?`)) return;
    try {
      await deleteJob({ data: { jobId: id } });
      toast.success("Job deleted.");
      void refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete job.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Top Breadcrumb & Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              <Link to="/admin" className="hover:text-indigo-600 transition">
                Admin Hub
              </Link>
              <span>/</span>
              <span>Question Authoring</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
                <Wand2 size={24} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Aqua MCQ Forge
                  <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 text-xs py-0.5">
                    AI Textbook Author
                  </Badge>
                </h1>
                <p className="text-sm text-slate-500">
                  Generate board-standard medical questions from textbook PDFs with 7-point validation & strict source fidelity.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/admin">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft size={16} /> Back
              </Button>
            </Link>

            <Dialog open={keyModalOpen} onOpenChange={setKeyModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-slate-300">
                  <KeyRound size={15} className="text-amber-600" />
                  API Keys
                  {keyStatus.google && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                    <KeyRound className="text-amber-600" size={20} />
                    AI Studio API Keys
                  </DialogTitle>
                  <DialogDescription>
                    Saved keys power Aqua MCQ Forge and Aqua MCQ Gen Pro automatically.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="space-y-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">Google AI Studio API Key</span>
                      {keyStatus.google ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-400 text-[10px]">Not Saved</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Paste AIzaSy... key"
                        value={keyInput.google}
                        onChange={(e) => setKeyInput({ ...keyInput, google: e.target.value })}
                        className="text-xs font-mono h-8 bg-white"
                      />
                      <Button size="sm" onClick={() => handleSaveKey("google")} className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">OpenAI API Key</span>
                      {keyStatus.openai ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-400 text-[10px]">Not Saved</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Paste sk-... key"
                        value={keyInput.openai}
                        onChange={(e) => setKeyInput({ ...keyInput, openai: e.target.value })}
                        className="text-xs font-mono h-8 bg-white"
                      />
                      <Button size="sm" onClick={() => handleSaveKey("openai")} className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm gap-2">
                  <Plus size={16} /> New Generation Job
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <Wand2 className="text-indigo-600" size={22} />
                    Create MCQ Generation Job
                  </DialogTitle>
                  <DialogDescription>
                    Configure source fidelity, question styles, difficulty ratios, and AI models.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Job Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Job Title</Label>
                    <Input
                      placeholder="e.g. Guyton Medical Physiology — Cardiovascular Chapter"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  {/* Provider & Model */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">AI Provider</Label>
                      <Select
                        value={form.provider}
                        onValueChange={(val: "google" | "openai") =>
                          setForm({
                            ...form,
                            provider: val,
                            model: val === "google" ? "gemini-2.5-flash" : "gpt-4.1",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">Google AI Studio</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Model</Label>
                      <Select
                        value={form.model}
                        onValueChange={(val) => setForm({ ...form, model: val })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AMF_MODELS[form.provider].map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Source Fidelity Mode */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                      <span>Source Fidelity System</span>
                      <Badge className={form.sourceMode === "strict" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"}>
                        {form.sourceMode === "strict" ? "🔒 Strict Source Mode" : "🧠 Source + Reasoning"}
                      </Badge>
                    </Label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, sourceMode: "strict" })}
                        className={`p-2.5 rounded-lg border text-left transition ${
                          form.sourceMode === "strict"
                            ? "border-emerald-500 bg-emerald-50/60 font-semibold text-emerald-950"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <div className="font-bold">🔒 Strict Source Mode</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Zero outside claims. Model only uses direct facts from your textbook.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, sourceMode: "reasoning" })}
                        className={`p-2.5 rounded-lg border text-left transition ${
                          form.sourceMode === "reasoning"
                            ? "border-blue-500 bg-blue-50/60 font-semibold text-blue-950"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <div className="font-bold">🧠 Source + AI Reasoning</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Textbook remains authoritative, but AI adds clinical synthesis.
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Difficulty Distribution Sliders */}
                  <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Difficulty Ratio (Must equal 100%)
                      </Label>
                      <span className="text-xs font-mono font-bold text-indigo-600">
                        Total: {form.difficultyEasy + form.difficultyMedium + form.difficultyHard}%
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-emerald-700">Easy (Direct Recall, 1-step):</span>
                          <span>{form.difficultyEasy}%</span>
                        </div>
                        <Slider
                          value={[form.difficultyEasy]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={([val]) => setForm({ ...form, difficultyEasy: val })}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-amber-700">Medium (Understanding, 2-step):</span>
                          <span>{form.difficultyMedium}%</span>
                        </div>
                        <Slider
                          value={[form.difficultyMedium]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={([val]) => setForm({ ...form, difficultyMedium: val })}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between font-semibold mb-1">
                          <span className="text-rose-700">Hard (Multi-step Clinical Reasoning):</span>
                          <span>{form.difficultyHard}%</span>
                        </div>
                        <Slider
                          value={[form.difficultyHard]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={([val]) => setForm({ ...form, difficultyHard: val })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Question Type Distribution */}
                  <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Question Shape Split
                      </Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="ai-type" className="text-xs text-slate-600 cursor-pointer">
                          Let AI decide split
                        </Label>
                        <Switch
                          id="ai-type"
                          checked={form.aiDecidesType}
                          onCheckedChange={(checked) => setForm({ ...form, aiDecidesType: checked })}
                        />
                      </div>
                    </div>

                    {!form.aiDecidesType && (
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold text-slate-700">Standard (Form A):</span>
                            <span>{form.typeStandard}%</span>
                          </div>
                          <Slider
                            value={[form.typeStandard]}
                            min={0}
                            max={100}
                            step={10}
                            onValueChange={([val]) => setForm({ ...form, typeStandard: val, typeCombined: 100 - val })}
                          />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold text-slate-700">Combined (Form B):</span>
                            <span>{form.typeCombined}%</span>
                          </div>
                          <Slider
                            value={[form.typeCombined]}
                            min={0}
                            max={100}
                            step={10}
                            onValueChange={([val]) => setForm({ ...form, typeCombined: val, typeStandard: 100 - val })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Total Questions & Coverage Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Total Questions
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={300}
                        value={form.totalQuestions}
                        disabled={form.coverageMode}
                        onChange={(e) => setForm({ ...form, totalQuestions: parseInt(e.target.value) || 20 })}
                      />
                    </div>
                    <div className="space-y-1.5 pt-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="coverage-mode"
                          checked={form.coverageMode}
                          onCheckedChange={(checked) => setForm({ ...form, coverageMode: checked })}
                        />
                        <Label htmlFor="coverage-mode" className="text-xs font-semibold cursor-pointer">
                          Full Chapter Coverage Mode
                        </Label>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Automatically authors questions until all major concepts are covered.
                      </p>
                    </div>
                  </div>

                  {/* Images in questions & Duplication Threshold */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="include-img" className="text-xs font-bold cursor-pointer">
                          Include Image Questions
                        </Label>
                        <Switch
                          id="include-img"
                          checked={form.includeImages}
                          onCheckedChange={(c) => setForm({ ...form, includeImages: c, imageCount: c ? 3 : 0 })}
                        />
                      </div>
                      {form.includeImages && (
                        <div>
                          <Label className="text-[11px] text-slate-500">Number of image questions:</Label>
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            className="h-8 mt-1 text-xs"
                            value={form.imageCount}
                            onChange={(e) => setForm({ ...form, imageCount: parseInt(e.target.value) || 1 })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <Label className="font-bold">Dedup Rejection Threshold</Label>
                        <span className="font-mono text-indigo-600 font-bold">{form.dupThreshold}%</span>
                      </div>
                      <Slider
                        value={[form.dupThreshold]}
                        min={50}
                        max={100}
                        step={1}
                        onValueChange={([val]) => setForm({ ...form, dupThreshold: val })}
                      />
                      <p className="text-[11px] text-slate-500">
                        Auto-rejects if similarity to existing questions is ≥ {form.dupThreshold}%.
                      </p>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    Create & Open Studio
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Jobs List Grid */}
        <div className="mt-8">
          {fetching ? (
            <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
              <Loader2 className="animate-spin" size={20} />
              <span>Loading generation jobs...</span>
            </div>
          ) : jobs.length === 0 ? (
            <Card className="border-dashed border-2 bg-white/70 py-16 text-center">
              <CardContent className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
                  <Wand2 size={30} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">No MCQ generation jobs yet</h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                    Upload your first medical textbook PDF and create high-yield questions with verified explanations.
                  </p>
                </div>
                <Button onClick={() => setModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  <Plus size={16} /> Create First Job
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {jobs.map((job) => (
                <Card
                  key={job.id}
                  className="bg-white border-slate-200/90 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className={
                          job.source_mode === "strict"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                            : "bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                        }
                      >
                        {job.source_mode === "strict" ? "🔒 Strict Source" : "🧠 Source + Reasoning"}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-mono capitalize">
                        {job.provider}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg font-black text-slate-900 mt-2 line-clamp-1">
                      {job.name}
                    </CardTitle>
                    <CardDescription className="text-xs line-clamp-1">
                      Model: <span className="font-semibold text-slate-700">{job.model}</span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    {/* Stats pills */}
                    <div className="grid grid-cols-4 gap-1.5 py-2 px-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs">
                      <div>
                        <div className="font-black text-slate-900">{job.total ?? 0}</div>
                        <div className="text-[10px] text-slate-500">Total</div>
                      </div>
                      <div>
                        <div className="font-black text-amber-600">{job.pending ?? 0}</div>
                        <div className="text-[10px] text-slate-500">Pending</div>
                      </div>
                      <div>
                        <div className="font-black text-emerald-600">{job.approved ?? 0}</div>
                        <div className="text-[10px] text-slate-500">Approved</div>
                      </div>
                      <div>
                        <div className="font-black text-indigo-600">{job.imported ?? 0}</div>
                        <div className="text-[10px] text-slate-500">Imported</div>
                      </div>
                    </div>

                    {/* Progress / Status banner */}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Sources: {job.sourcesCount || 0} PDF(s)</span>
                      <span className="font-semibold capitalize text-slate-700">Status: {job.status}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <Link to="/admin/aqua-mcq-forge/$jobId" params={{ jobId: job.id }} className="flex-1">
                        <Button variant="default" size="sm" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5">
                          <Sliders size={14} /> Open Studio
                        </Button>
                      </Link>

                      <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId: job.id }}>
                        <Button variant="outline" size="sm" className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 gap-1">
                          <CheckCheck size={14} /> Review
                        </Button>
                      </Link>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-rose-600"
                        onClick={() => handleDelete(job.id, job.name)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
