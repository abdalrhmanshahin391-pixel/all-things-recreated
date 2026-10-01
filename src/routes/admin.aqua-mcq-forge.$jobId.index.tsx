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
  Minus,
  Plus,
  Save,
  Target,
  ShieldCheck,
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

function TopicQuestionCountEditor({
  topicId,
  minVal,
  targetVal,
  onUpdateTopic,
}: {
  topicId: string;
  minVal: number;
  targetVal: number;
  onUpdateTopic: (patch: Record<string, any>) => void;
}) {
  const [minText, setMinText] = useState(String(minVal));
  const [targetText, setTargetText] = useState(String(targetVal));
  const isMinFocused = useRef(false);
  const isTargetFocused = useRef(false);

  useEffect(() => {
    if (!isMinFocused.current) setMinText(String(minVal));
    if (!isTargetFocused.current) setTargetText(String(targetVal));
  }, [minVal, targetVal]);

  return (
    <div className="flex items-center gap-4 text-xs font-semibold">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Min:</span>
        <Input
          type="number"
          min={0}
          max={50}
          className="w-14 h-7 text-xs text-center p-1 font-bold border-slate-300"
          value={minText}
          onFocus={() => {
            isMinFocused.current = true;
          }}
          onChange={(e) => {
            setMinText(e.target.value);
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val >= 0) {
              onUpdateTopic({ min_questions: val });
            }
          }}
          onBlur={() => {
            isMinFocused.current = false;
            const val = parseInt(minText);
            const valid = isNaN(val) || val < 0 ? 0 : val;
            setMinText(String(valid));
            onUpdateTopic({ min_questions: valid });
          }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Target:</span>
        <Input
          type="number"
          min={1}
          max={50}
          className="w-14 h-7 text-xs text-center p-1 font-bold border-slate-300"
          value={targetText}
          onFocus={() => {
            isTargetFocused.current = true;
          }}
          onChange={(e) => {
            setTargetText(e.target.value);
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val >= 1) {
              onUpdateTopic({ target_questions: val });
            }
          }}
          onBlur={() => {
            isTargetFocused.current = false;
            const val = parseInt(targetText);
            const valid = isNaN(val) || val < 1 ? 1 : val;
            setTargetText(String(valid));
            onUpdateTopic({ target_questions: valid });
          }}
        />
      </div>
    </div>
  );
}

function ImageTargetEditor({
  job,
  onUpdate,
}: {
  job: any;
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const current = Number(job.image_target_count ?? 0);
  const [text, setText] = useState(String(current));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setText(String(job.image_target_count ?? 0));
  }, [job.image_target_count]);

  const commit = (num: number) => {
    const val = Math.max(0, Math.min(500, num));
    setText(String(val));
    onUpdate({ image_target_count: val });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 rounded-lg border-indigo-200 hover:bg-indigo-50 text-indigo-700"
        onClick={() => commit(current - 1)}
        disabled={current <= 0}
      >
        <Minus size={13} />
      </Button>
      <Input
        type="number"
        min={0}
        max={500}
        className="w-20 h-8 text-sm text-center font-bold border-indigo-300 focus:ring-indigo-500"
        value={text}
        onFocus={() => {
          isFocused.current = true;
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseInt(e.target.value);
          if (!isNaN(parsed) && parsed >= 0) {
            onUpdate({ image_target_count: parsed });
          }
        }}
        onBlur={() => {
          isFocused.current = false;
          const parsed = parseInt(text);
          commit(isNaN(parsed) ? 0 : parsed);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 rounded-lg border-indigo-200 hover:bg-indigo-50 text-indigo-700"
        onClick={() => commit(current + 1)}
      >
        <Plus size={13} />
      </Button>
      <span className="text-xs text-slate-500 font-medium ml-1">questions</span>
    </div>
  );
}

function QuestionSourceSplitEditor({
  job,
  onUpdate,
}: {
  job: any;
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const total = Number(job.total_questions ?? 20);
  const strict = typeof job.strict_questions_count === "number"
    ? Math.max(0, Math.min(total, job.strict_questions_count))
    : (job.source_mode === "reasoning" ? 0 : total);
  const reasoning = Math.max(0, total - strict);

  const [totalText, setTotalText] = useState(String(total));
  const [strictText, setStrictText] = useState(String(strict));
  const [reasoningText, setReasoningText] = useState(String(reasoning));

  const isTotalFocused = useRef(false);
  const isStrictFocused = useRef(false);
  const isReasoningFocused = useRef(false);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isTotalFocused.current) setTotalText(String(total));
    if (!isStrictFocused.current) setStrictText(String(strict));
    if (!isReasoningFocused.current) setReasoningText(String(reasoning));
  }, [total, strict, reasoning]);

  const commitTotal = (newTot: number) => {
    const validTot = Math.max(1, Math.min(500, newTot));
    const validStrict = Math.min(strict, validTot);
    const validReasoning = validTot - validStrict;
    setTotalText(String(validTot));
    setStrictText(String(validStrict));
    setReasoningText(String(validReasoning));
    onUpdate({
      total_questions: validTot,
      strict_questions_count: validStrict,
      source_mode: validStrict === 0 ? "reasoning" : "strict",
      external_questions_count: validReasoning,
    });
  };

  const commitStrict = (newStrictVal: number) => {
    const validStrict = Math.max(0, Math.min(total, newStrictVal));
    const validReasoning = total - validStrict;
    setStrictText(String(validStrict));
    setReasoningText(String(validReasoning));
    onUpdate({
      strict_questions_count: validStrict,
      source_mode: validStrict === 0 ? "reasoning" : "strict",
      external_questions_count: validReasoning,
    });
  };

  const commitReasoning = (newReasoningVal: number) => {
    const validReasoning = Math.max(0, Math.min(total, newReasoningVal));
    const validStrict = total - validReasoning;
    setReasoningText(String(validReasoning));
    setStrictText(String(validStrict));
    onUpdate({
      strict_questions_count: validStrict,
      source_mode: validStrict === 0 ? "reasoning" : "strict",
      external_questions_count: validReasoning,
    });
  };

  const strictPct = total > 0 ? Math.round((strict / total) * 100) : 0;
  const reasoningPct = 100 - strictPct;

  return (
    <div className="space-y-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40">
      {/* Header with live count badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-emerald-600" /> Source Fidelity System (Strict PDF vs. AI Reasoning)
        </Label>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            🔒 {strict} Strict PDF ({strictPct}%)
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            🧠 {reasoning} AI Reasoning ({reasoningPct}%)
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Choose how many questions must strictly quote and rely 100% on textbook PDF facts (zero outside claims) versus how many allow AI clinical synthesis &amp; reasoning.
      </p>

      {/* Total Questions Config Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">Total Questions to Author:</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7 rounded-md border-slate-300 hover:bg-slate-100"
              onClick={() => commitTotal(total - 5)}
              disabled={total <= 5}
            >
              <Minus size={12} />
            </Button>
            <Input
              type="number"
              min={1}
              max={500}
              className="w-16 h-7 text-xs text-center font-bold border-slate-300"
              value={totalText}
              onFocus={() => {
                isTotalFocused.current = true;
              }}
              onChange={(e) => {
                setTotalText(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1) {
                  const validStrict = Math.min(strict, val);
                  const validReasoning = val - validStrict;
                  setStrictText(String(validStrict));
                  setReasoningText(String(validReasoning));
                  onUpdate({
                    total_questions: val,
                    strict_questions_count: validStrict,
                    source_mode: validStrict === 0 ? "reasoning" : "strict",
                    external_questions_count: validReasoning,
                  });
                }
              }}
              onBlur={() => {
                isTotalFocused.current = false;
                const val = parseInt(totalText);
                commitTotal(isNaN(val) || val < 1 ? 20 : val);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7 rounded-md border-slate-300 hover:bg-slate-100"
              onClick={() => commitTotal(total + 5)}
            >
              <Plus size={12} />
            </Button>
            <span className="text-slate-500 font-medium ml-1">questions</span>
          </div>
        </div>

        {/* Quick Total Presets */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 text-[11px] font-medium mr-1">Quick:</span>
          {[10, 20, 30, 50, 100].map((count) => (
            <Button
              key={count}
              type="button"
              size="sm"
              variant={total === count ? "default" : "outline"}
              className={`h-6 px-2 text-[11px] font-bold ${
                total === count
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => commitTotal(count)}
            >
              {count}
            </Button>
          ))}
        </div>
      </div>

      {/* Side-by-Side Split Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Card 1: Strictly from PDF (Strict Source Mode) */}
        <div className={`p-3.5 rounded-xl border transition shadow-xs space-y-2 ${strict > 0 ? "border-emerald-300 bg-white" : "border-slate-200 bg-slate-50/50"}`}>
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-emerald-800 flex items-center gap-1.5">
              🔒 Strictly from PDF (Strict Mode)
            </span>
            <Badge variant="outline" className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300">
              {strictPct}%
            </Badge>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-emerald-300 hover:bg-emerald-50 text-emerald-700"
              onClick={() => commitStrict(strict - 1)}
              disabled={strict <= 0}
            >
              <Minus size={13} />
            </Button>
            <Input
              type="number"
              min={0}
              max={total}
              className="w-20 h-8 text-sm text-center font-bold border-emerald-300 focus:ring-emerald-500"
              value={strictText}
              onFocus={() => {
                isStrictFocused.current = true;
              }}
              onChange={(e) => {
                setStrictText(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 0) {
                  const clamped = Math.min(total, val);
                  const newReasoning = total - clamped;
                  setReasoningText(String(newReasoning));
                  onUpdate({
                    strict_questions_count: clamped,
                    source_mode: clamped === 0 ? "reasoning" : "strict",
                    external_questions_count: newReasoning,
                  });
                }
              }}
              onBlur={() => {
                isStrictFocused.current = false;
                const val = parseInt(strictText);
                commitStrict(isNaN(val) || val < 0 ? 0 : val);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-emerald-300 hover:bg-emerald-50 text-emerald-700"
              onClick={() => commitStrict(strict + 1)}
              disabled={strict >= total}
            >
              <Plus size={13} />
            </Button>
            <span className="text-xs text-slate-500 font-medium">questions</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Zero outside claims. 100% textbook facts only.
          </p>
        </div>

        {/* Card 2: Source + AI Reasoning */}
        <div className={`p-3.5 rounded-xl border transition shadow-xs space-y-2 ${reasoning > 0 ? "border-blue-300 bg-white" : "border-slate-200 bg-slate-50/50"}`}>
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-blue-800 flex items-center gap-1.5">
              🧠 Source + AI Reasoning
            </span>
            <Badge variant="outline" className="font-mono font-bold text-blue-700 bg-blue-50 border-blue-300">
              {reasoningPct}%
            </Badge>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-blue-300 hover:bg-blue-50 text-blue-700"
              onClick={() => commitReasoning(reasoning - 1)}
              disabled={reasoning <= 0}
            >
              <Minus size={13} />
            </Button>
            <Input
              type="number"
              min={0}
              max={total}
              className="w-20 h-8 text-sm text-center font-bold border-blue-300 focus:ring-blue-500"
              value={reasoningText}
              onFocus={() => {
                isReasoningFocused.current = true;
              }}
              onChange={(e) => {
                setReasoningText(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 0) {
                  const clamped = Math.min(total, val);
                  const newStrict = total - clamped;
                  setStrictText(String(newStrict));
                  onUpdate({
                    strict_questions_count: newStrict,
                    source_mode: newStrict === 0 ? "reasoning" : "strict",
                    external_questions_count: clamped,
                  });
                }
              }}
              onBlur={() => {
                isReasoningFocused.current = false;
                const val = parseInt(reasoningText);
                commitReasoning(isNaN(val) || val < 0 ? 0 : val);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-blue-300 hover:bg-blue-50 text-blue-700"
              onClick={() => commitReasoning(reasoning + 1)}
              disabled={reasoning >= total}
            >
              <Plus size={13} />
            </Button>
            <span className="text-xs text-slate-500 font-medium">questions</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Textbook remains authoritative base + AI adds clinical synthesis.
          </p>
        </div>
      </div>

      {/* Visual Slider */}
      <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-white">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-emerald-700 flex items-center gap-1">
            🔒 {strict} Strict PDF ({strictPct}%)
          </span>
          <span className="text-blue-700 flex items-center gap-1">
            🧠 {reasoning} AI Reasoning ({reasoningPct}%)
          </span>
        </div>
        <Slider
          value={[strict]}
          min={0}
          max={total}
          step={1}
          onValueChange={([val]) => commitStrict(val)}
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0% Strict (100% Reasoning)</span>
          <span>50% / 50%</span>
          <span>100% Strict PDF</span>
        </div>
      </div>

      {/* Quick Presets Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <span className="text-slate-500 font-medium text-[11px]">Quick Split Presets:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-emerald-50 hover:text-emerald-700 border-slate-200"
            onClick={() => commitStrict(total)}
          >
            🔒 100% Strict PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-emerald-50 hover:text-emerald-700 border-slate-200"
            onClick={() => commitStrict(Math.round(total * 0.75))}
          >
            🔒 75% PDF / 25% AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => commitStrict(Math.round(total * 0.5))}
          >
            ⚖️ 50% / 50% Balanced
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-blue-50 hover:text-blue-700 border-slate-200"
            onClick={() => commitStrict(Math.round(total * 0.25))}
          >
            🧠 25% PDF / 75% AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-blue-50 hover:text-blue-700 border-slate-200"
            onClick={() => commitStrict(0)}
          >
            🧠 100% AI Reasoning
          </Button>
        </div>
      </div>
    </div>
  );
}

function DifficultyRatiosEditor({
  job,
  onUpdate,
}: {
  job: any;
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const easy = Number(job.difficulty_easy ?? 34);
  const med = Number(job.difficulty_medium ?? 33);
  const hard = Number(job.difficulty_hard ?? 33);

  const [easyText, setEasyText] = useState(String(easy));
  const [medText, setMedText] = useState(String(med));
  const [hardText, setHardText] = useState(String(hard));

  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    if (focusedField.current !== "easy") setEasyText(String(easy));
    if (focusedField.current !== "med") setMedText(String(med));
    if (focusedField.current !== "hard") setHardText(String(hard));
  }, [easy, med, hard]);

  const commit = (field: "difficulty_easy" | "difficulty_medium" | "difficulty_hard", val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    if (field === "difficulty_easy") setEasyText(String(clamped));
    if (field === "difficulty_medium") setMedText(String(clamped));
    if (field === "difficulty_hard") setHardText(String(clamped));
    onUpdate({ [field]: clamped });
  };

  const applyPreset = (eVal: number, mVal: number, hVal: number) => {
    setEasyText(String(eVal));
    setMedText(String(mVal));
    setHardText(String(hVal));
    onUpdate({
      difficulty_easy: eVal,
      difficulty_medium: mVal,
      difficulty_hard: hVal,
    });
  };

  const total = easy + med + hard;

  return (
    <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Difficulty Ratios</Label>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
            total === 100
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          Total: {total}% {total === 100 ? "✓" : ""}
        </span>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
        <span className="text-slate-500 font-medium text-xs">Quick Presets:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset(34, 33, 33)}
          >
            ⚖️ Balanced (34/33/33)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-emerald-50 hover:text-emerald-700 border-slate-200"
            onClick={() => applyPreset(20, 40, 40)}
          >
            🎯 Clinical USMLE (20/40/40)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-rose-50 hover:text-rose-700 border-slate-200"
            onClick={() => applyPreset(10, 30, 60)}
          >
            🔥 High Challenge (10/30/60)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-amber-50 hover:text-amber-700 border-slate-200"
            onClick={() => applyPreset(50, 35, 15)}
          >
            📖 Foundational (50/35/15)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* Easy */}
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-white shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-emerald-700 font-bold text-xs">🟢 Easy (Recall)</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => commit("difficulty_easy", easy - 5)}
                disabled={easy <= 0}
              >
                <Minus size={11} />
              </Button>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  className="w-14 h-7 text-xs text-center font-bold pr-4 border-emerald-300 focus:ring-emerald-500"
                  value={easyText}
                  onFocus={() => {
                    focusedField.current = "easy";
                  }}
                  onChange={(e) => {
                    setEasyText(e.target.value);
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 0) commit("difficulty_easy", Math.min(100, v));
                  }}
                  onBlur={() => {
                    focusedField.current = null;
                    const v = parseInt(easyText);
                    commit("difficulty_easy", isNaN(v) ? 0 : Math.min(100, v));
                  }}
                />
                <span className="absolute right-1 text-[9px] font-bold text-slate-400 pointer-events-none">%</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => commit("difficulty_easy", easy + 5)}
                disabled={easy >= 100}
              >
                <Plus size={11} />
              </Button>
            </div>
          </div>
          <Slider
            value={[easy]}
            min={0}
            max={100}
            step={5}
            onValueChange={([val]) => commit("difficulty_easy", val)}
          />
        </div>

        {/* Medium */}
        <div className="p-3.5 rounded-xl border border-amber-200 bg-white shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-amber-700 font-bold text-xs">🟡 Medium (2-step)</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => commit("difficulty_medium", med - 5)}
                disabled={med <= 0}
              >
                <Minus size={11} />
              </Button>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  className="w-14 h-7 text-xs text-center font-bold pr-4 border-amber-300 focus:ring-amber-500"
                  value={medText}
                  onFocus={() => {
                    focusedField.current = "med";
                  }}
                  onChange={(e) => {
                    setMedText(e.target.value);
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 0) commit("difficulty_medium", Math.min(100, v));
                  }}
                  onBlur={() => {
                    focusedField.current = null;
                    const v = parseInt(medText);
                    commit("difficulty_medium", isNaN(v) ? 0 : Math.min(100, v));
                  }}
                />
                <span className="absolute right-1 text-[9px] font-bold text-slate-400 pointer-events-none">%</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => commit("difficulty_medium", med + 5)}
                disabled={med >= 100}
              >
                <Plus size={11} />
              </Button>
            </div>
          </div>
          <Slider
            value={[med]}
            min={0}
            max={100}
            step={5}
            onValueChange={([val]) => commit("difficulty_medium", val)}
          />
        </div>

        {/* Hard */}
        <div className="p-3.5 rounded-xl border border-rose-200 bg-white shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-rose-700 font-bold text-xs">🔴 Hard (Multi-step)</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => commit("difficulty_hard", hard - 5)}
                disabled={hard <= 0}
              >
                <Minus size={11} />
              </Button>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  className="w-14 h-7 text-xs text-center font-bold pr-4 border-rose-300 focus:ring-rose-500"
                  value={hardText}
                  onFocus={() => {
                    focusedField.current = "hard";
                  }}
                  onChange={(e) => {
                    setHardText(e.target.value);
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 0) commit("difficulty_hard", Math.min(100, v));
                  }}
                  onBlur={() => {
                    focusedField.current = null;
                    const v = parseInt(hardText);
                    commit("difficulty_hard", isNaN(v) ? 0 : Math.min(100, v));
                  }}
                />
                <span className="absolute right-1 text-[9px] font-bold text-slate-400 pointer-events-none">%</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-md border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => commit("difficulty_hard", hard + 5)}
                disabled={hard >= 100}
              >
                <Plus size={11} />
              </Button>
            </div>
          </div>
          <Slider
            value={[hard]}
            min={0}
            max={100}
            step={5}
            onValueChange={([val]) => commit("difficulty_hard", val)}
          />
        </div>
      </div>
    </div>
  );
}

const QUESTION_OBJECTIVES_CONFIG = [
  { id: "recall", label: "Direct Recall", icon: "🧠", color: "text-slate-700", border: "border-slate-200", bg: "bg-slate-50/50" },
  { id: "understanding", label: "Understanding / Mechanism", icon: "⚙️", color: "text-blue-700", border: "border-blue-200", bg: "bg-blue-50/30" },
  { id: "clinical_vignette", label: "Clinical Vignette (Case Scenario)", icon: "🏥", color: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50/30" },
  { id: "tricky", label: "Tricky / Red-Herring", icon: "🪤", color: "text-rose-700", border: "border-rose-200", bg: "bg-rose-50/30" },
  { id: "comparison", label: "Comparison / Differentiation", icon: "⚖️", color: "text-purple-700", border: "border-purple-200", bg: "bg-purple-50/30" },
  { id: "application", label: "Application of Concepts", icon: "💡", color: "text-amber-700", border: "border-amber-200", bg: "bg-amber-50/30" },
  { id: "identification", label: "Identification / Diagnosis", icon: "🔍", color: "text-indigo-700", border: "border-indigo-200", bg: "bg-indigo-50/30" },
  { id: "clinical_reasoning", label: "Clinical Case Reasoning", icon: "🩺", color: "text-teal-700", border: "border-teal-200", bg: "bg-teal-50/30" },
  { id: "sequence", label: "Sequence / Step Progression", icon: "🔢", color: "text-orange-700", border: "border-orange-200", bg: "bg-orange-50/30" },
  { id: "classification", label: "Classification / Taxonomy", icon: "🏷️", color: "text-cyan-700", border: "border-cyan-200", bg: "bg-cyan-50/30" },
] as const;

function QuestionTypeRatiosEditor({
  job,
  onUpdate,
}: {
  job: any;
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const currentRatios = job.objective_ratios ?? {};
  const [localValues, setLocalValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const obj of QUESTION_OBJECTIVES_CONFIG) {
      init[obj.id] = String(Number(currentRatios[obj.id] ?? 0));
    }
    return init;
  });

  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    const ratios = job.objective_ratios ?? {};
    setLocalValues((prev) => {
      const next = { ...prev };
      for (const obj of QUESTION_OBJECTIVES_CONFIG) {
        if (focusedField.current !== obj.id) {
          next[obj.id] = String(Number(ratios[obj.id] ?? 0));
        }
      }
      return next;
    });
  }, [job.objective_ratios]);

  const commitRatio = (id: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setLocalValues((prev) => ({ ...prev, [id]: String(clamped) }));
    const newRatios = { ...(job.objective_ratios ?? {}), [id]: clamped };
    onUpdate({ objective_ratios: newRatios });
  };

  const handleTextChange = (id: string, text: string) => {
    setLocalValues((prev) => ({ ...prev, [id]: text }));
    const parsed = parseInt(text);
    if (!isNaN(parsed) && parsed >= 0) {
      const clamped = Math.min(100, parsed);
      const newRatios = { ...(job.objective_ratios ?? {}), [id]: clamped };
      onUpdate({ objective_ratios: newRatios });
    }
  };

  const handleBlur = (id: string) => {
    focusedField.current = null;
    const currentText = localValues[id] ?? "";
    const parsed = parseInt(currentText);
    const valid = isNaN(parsed) || parsed < 0 ? 0 : Math.min(100, parsed);
    commitRatio(id, valid);
  };

  const applyPreset = (type: "clinical" | "usmle" | "concepts" | "balanced" | "reset") => {
    let preset: Record<string, number> = {};
    switch (type) {
      case "clinical":
        preset = { clinical_vignette: 50, clinical_reasoning: 25, understanding: 15, tricky: 10 };
        break;
      case "usmle":
        preset = { clinical_vignette: 40, clinical_reasoning: 20, understanding: 15, application: 15, tricky: 10 };
        break;
      case "concepts":
        preset = { understanding: 40, application: 30, comparison: 20, recall: 10 };
        break;
      case "balanced":
        preset = {
          recall: 10,
          understanding: 10,
          clinical_vignette: 10,
          tricky: 10,
          comparison: 10,
          application: 10,
          identification: 10,
          clinical_reasoning: 10,
          sequence: 10,
          classification: 10,
        };
        break;
      case "reset":
        preset = {};
        break;
    }
    const newLocal: Record<string, string> = {};
    for (const obj of QUESTION_OBJECTIVES_CONFIG) {
      newLocal[obj.id] = String(preset[obj.id] ?? 0);
    }
    setLocalValues(newLocal);
    onUpdate({ objective_ratios: preset });
  };

  const total = Object.values(job.objective_ratios ?? {}).reduce(
    (a: number, b: unknown) => a + (Number(b) || 0),
    0,
  );

  return (
    <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
      {/* Header with Title and Total status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Wand2 size={15} className="text-indigo-600" /> Question Type Ratios
          </Label>
          <p className="text-xs text-slate-500 mt-0.5">
            Control what % of questions are clinical vignettes, tricky, recall, etc. Set all to 0 for fully random. Values are relative (auto-normalized).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {total === 0 ? (
            <Badge variant="outline" className="bg-slate-100 text-slate-700 font-bold border-slate-300 text-xs">
              🎲 Random (All 0%)
            </Badge>
          ) : (
            <Badge className="bg-indigo-100 text-indigo-800 font-bold border border-indigo-200 text-xs">
              Total Weight: {total}%
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
        <span className="text-slate-500 font-medium text-xs">Quick Presets:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-emerald-50 hover:text-emerald-700 border-slate-200"
            onClick={() => applyPreset("clinical")}
          >
            🏥 Clinical Vignettes Focus
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset("usmle")}
          >
            📚 USMLE / Board Exam
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-blue-50 hover:text-blue-700 border-slate-200"
            onClick={() => applyPreset("concepts")}
          >
            ⚙️ Concepts &amp; Mechanisms
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-purple-50 hover:text-purple-700 border-slate-200"
            onClick={() => applyPreset("balanced")}
          >
            ⚖️ Equal 10% Each
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-rose-50 hover:text-rose-700 border-slate-200 text-slate-600"
            onClick={() => applyPreset("reset")}
          >
            🔄 Reset All (0%)
          </Button>
        </div>
      </div>

      {/* 2-Column Responsive Grid of Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {QUESTION_OBJECTIVES_CONFIG.map(({ id, label, icon, color, border, bg }) => {
          const currentVal = Number((job.objective_ratios ?? {})[id] ?? 0);
          const textVal = localValues[id] ?? String(currentVal);

          return (
            <div
              key={id}
              className={`p-3 rounded-xl border ${border} ${bg} bg-white shadow-2xs space-y-2 transition-all hover:shadow-xs`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-bold text-xs flex items-center gap-1.5 ${color}`}>
                  <span>{icon}</span> {label}
                </span>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 rounded-md border-slate-200 text-slate-600 hover:bg-slate-100"
                    onClick={() => commitRatio(id, currentVal - 5)}
                    disabled={currentVal <= 0}
                  >
                    <Minus size={11} />
                  </Button>
                  <div className="relative flex items-center">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      className="w-14 h-7 text-xs text-center font-bold pr-4 border-slate-300 focus:ring-indigo-500"
                      value={textVal}
                      onFocus={() => {
                        focusedField.current = id;
                      }}
                      onChange={(e) => handleTextChange(id, e.target.value)}
                      onBlur={() => handleBlur(id)}
                    />
                    <span className="absolute right-1.5 text-[10px] font-bold text-slate-400 pointer-events-none">
                      %
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 rounded-md border-slate-200 text-slate-600 hover:bg-slate-100"
                    onClick={() => commitRatio(id, currentVal + 5)}
                    disabled={currentVal >= 100}
                  >
                    <Plus size={11} />
                  </Button>
                </div>
              </div>

              <Slider
                value={[currentVal]}
                min={0}
                max={100}
                step={5}
                onValueChange={([val]) => commitRatio(id, val)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LENGTH_STYLES_CONFIG = [
  { id: "short_direct", label: "Short & Direct (1-2 sentences)", icon: "⚡", color: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50/30", desc: "Core definitions, hallmarks, recall. Fast-paced." },
  { id: "medium_case", label: "Medium / Clinical (2-4 sentences)", icon: "🔬", color: "text-blue-700", border: "border-blue-200", bg: "bg-blue-50/30", desc: "Focused clinical presentations or mechanistic problems." },
  { id: "long_vignette", label: "Long Board Vignette (5-7 sentences)", icon: "🏥", color: "text-rose-700", border: "border-rose-200", bg: "bg-rose-50/30", desc: "Full USMLE-style case with demographics, vitals, labs." },
  { id: "tricky_trap", label: "Tricky / Confusing (Cognitive Trap)", icon: "🪤", color: "text-amber-700", border: "border-amber-200", bg: "bg-amber-50/30", desc: "One alluring wrong option. Requires careful reading." },
] as const;

function LengthRatiosEditor({
  job,
  onUpdate,
}: {
  job: any;
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const currentRatios = job.length_ratios ?? { short_direct: 40, medium_case: 40, long_vignette: 10, tricky_trap: 10 };
  const [localValues, setLocalValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of LENGTH_STYLES_CONFIG) {
      init[s.id] = String(Number(currentRatios[s.id] ?? 0));
    }
    return init;
  });

  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    const ratios = job.length_ratios ?? { short_direct: 40, medium_case: 40, long_vignette: 10, tricky_trap: 10 };
    setLocalValues((prev) => {
      const next = { ...prev };
      for (const s of LENGTH_STYLES_CONFIG) {
        if (focusedField.current !== s.id) {
          next[s.id] = String(Number(ratios[s.id] ?? 0));
        }
      }
      return next;
    });
  }, [job.length_ratios]);

  const commitRatio = (id: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setLocalValues((prev) => ({ ...prev, [id]: String(clamped) }));
    const newRatios = { ...(job.length_ratios ?? {}), [id]: clamped };
    onUpdate({ length_ratios: newRatios });
  };

  const applyPreset = (type: "balanced" | "short_heavy" | "clinical" | "reset") => {
    let preset: Record<string, number> = {};
    switch (type) {
      case "balanced": preset = { short_direct: 40, medium_case: 40, long_vignette: 10, tricky_trap: 10 }; break;
      case "short_heavy": preset = { short_direct: 60, medium_case: 30, long_vignette: 5, tricky_trap: 5 }; break;
      case "clinical": preset = { short_direct: 10, medium_case: 30, long_vignette: 50, tricky_trap: 10 }; break;
      case "reset": preset = { short_direct: 25, medium_case: 25, long_vignette: 25, tricky_trap: 25 }; break;
    }
    const newLocal: Record<string, string> = {};
    for (const s of LENGTH_STYLES_CONFIG) newLocal[s.id] = String(preset[s.id] ?? 0);
    setLocalValues(newLocal);
    onUpdate({ length_ratios: preset });
  };

  const total = LENGTH_STYLES_CONFIG.reduce((a, s) => a + (Number((job.length_ratios ?? {})[s.id] ?? 0)), 0);

  return (
    <div className="space-y-4 p-4 rounded-xl border border-purple-200 bg-purple-50/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Layers size={15} className="text-purple-600" /> Question Length Mix
          </Label>
          <p className="text-xs text-slate-500 mt-0.5">
            Control what % of questions are short, medium, long, or tricky. Independent of Question Type. Default: 40/40/10/10.
          </p>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${total === 100 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
          Total: {total}% {total === 100 ? "✓" : ""}
        </span>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-purple-100 bg-white shadow-2xs">
        <span className="text-slate-500 font-medium text-xs">Quick Presets:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] font-semibold hover:bg-purple-50 hover:text-purple-700 border-slate-200" onClick={() => applyPreset("balanced")}>
            ⚖️ Balanced (40/40/10/10)
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] font-semibold hover:bg-emerald-50 hover:text-emerald-700 border-slate-200" onClick={() => applyPreset("short_heavy")}>
            ⚡ Short-Heavy (60/30/5/5)
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] font-semibold hover:bg-rose-50 hover:text-rose-700 border-slate-200" onClick={() => applyPreset("clinical")}>
            🏥 Clinical-Heavy (10/30/50/10)
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] font-semibold hover:bg-slate-100 border-slate-200 text-slate-600" onClick={() => applyPreset("reset")}>
            🔄 Equal 25% Each
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {LENGTH_STYLES_CONFIG.map(({ id, label, icon, color, border, bg, desc }) => {
          const currentVal = Number((job.length_ratios ?? {})[id] ?? 0);
          const textVal = localValues[id] ?? String(currentVal);

          return (
            <div key={id} className={`p-3 rounded-xl border ${border} ${bg} bg-white shadow-2xs space-y-2 transition-all hover:shadow-xs`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className={`font-bold text-xs flex items-center gap-1.5 ${color}`}>
                    <span>{icon}</span> {label}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-md border-slate-200 text-slate-600 hover:bg-slate-100" onClick={() => commitRatio(id, currentVal - 5)} disabled={currentVal <= 0}>
                    <Minus size={11} />
                  </Button>
                  <div className="relative flex items-center">
                    <Input
                      type="number" min={0} max={100} step={5}
                      className="w-14 h-7 text-xs text-center font-bold pr-4 border-slate-300 focus:ring-purple-500"
                      value={textVal}
                      onFocus={() => { focusedField.current = id; }}
                      onChange={(e) => {
                        setLocalValues((prev) => ({ ...prev, [id]: e.target.value }));
                        const parsed = parseInt(e.target.value);
                        if (!isNaN(parsed) && parsed >= 0) commitRatio(id, Math.min(100, parsed));
                      }}
                      onBlur={() => {
                        focusedField.current = null;
                        const parsed = parseInt(textVal);
                        commitRatio(id, isNaN(parsed) ? 0 : Math.min(100, parsed));
                      }}
                    />
                    <span className="absolute right-1.5 text-[10px] font-bold text-slate-400 pointer-events-none">%</span>
                  </div>
                  <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-md border-slate-200 text-slate-600 hover:bg-slate-100" onClick={() => commitRatio(id, currentVal + 5)} disabled={currentVal >= 100}>
                    <Plus size={11} />
                  </Button>
                </div>
              </div>
              <Slider value={[currentVal]} min={0} max={100} step={5} onValueChange={([val]) => commitRatio(id, val)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const patchJobQuietly = useCallback(
    async (patch: Record<string, any>) => {
      setJob((prev: any) => (prev ? { ...prev, ...patch } : prev));
      try {
        const res: any = await updateJob({ data: { jobId, patch } });
        if (res && typeof res === "object" && !res.error) {
          setJob((prev: any) => (prev ? { ...prev, ...res } : prev));
        }
      } catch (err: any) {
        console.error("Failed to quietly update job:", err);
        toast.error(err?.message || "Failed to update setting.");
      }
    },
    [updateJob, jobId],
  );

  const patchTopicQuietly = useCallback(
    async (topicId: string, patch: Record<string, any>) => {
      setTopics((prev: any[]) => prev.map((t) => (t.id === topicId ? { ...t, ...patch } : t)));
      try {
        await updateTopic({ data: { topicId, patch } });
      } catch (err: any) {
        console.error("Failed to quietly update topic:", err);
      }
    },
    [updateTopic],
  );

  const [savingRules, setSavingRules] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const justSavedTimerRef = useRef<any>(null);

  const handleSaveAllRules = useCallback(
    async (silent = false) => {
      if (!job) return;
      setSavingRules(true);
      try {
        const strictCount = typeof job.strict_questions_count === "number"
          ? Math.min(Number(job.total_questions ?? 20), Math.max(0, job.strict_questions_count))
          : (job.source_mode === "reasoning" ? 0 : Number(job.total_questions ?? 20));

        const patch = {
          strict_questions_count: strictCount,
          source_mode: strictCount === 0 ? "reasoning" : "strict",
          objective_ratios: job.objective_ratios ?? {},
          length_ratios: job.length_ratios ?? { short_direct: 40, medium_case: 40, long_vignette: 10, tricky_trap: 10 },
          difficulty_easy: Number(job.difficulty_easy ?? 34),
          difficulty_medium: Number(job.difficulty_medium ?? 33),
          difficulty_hard: Number(job.difficulty_hard ?? 33),
          type_standard: Number(job.type_standard ?? 50),
          type_combined: Number(job.type_combined ?? 50),
          ai_decides_type: Boolean(job.ai_decides_type),
          total_questions: Number(job.total_questions ?? 20),
          external_questions_count: Number(job.external_questions_count ?? 0),
          include_images: Boolean(job.include_images),
          image_target_count: Number(job.image_target_count ?? job.image_count ?? 0),
          image_count: Number(job.image_target_count ?? job.image_count ?? 0),
          image_frequency: job.image_frequency || "auto",
          dup_threshold: Number(job.dup_threshold ?? 87),
          api_mode: job.api_mode || "standard",
        };
        const res: any = await updateJob({ data: { jobId, patch } });
        if (res && typeof res === "object" && !res.error) {
          setJob((prev: any) => (prev ? { ...prev, ...patch, ...res } : prev));
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLastSavedTime(timeStr);
        setJustSaved(true);
        if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
        justSavedTimerRef.current = setTimeout(() => {
          setJustSaved(false);
        }, 4000);

        if (!silent) {
          toast.success(`Authoring rules & quotas saved successfully at ${timeStr}!`);
        }
      } catch (err: any) {
        console.error("Failed to save rules:", err);
        if (!silent) {
          toast.error(err?.message || "Failed to save options.");
        }
      } finally {
        setSavingRules(false);
      }
    },
    [job, updateJob, jobId],
  );

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
    // Auto-save any active rules to ensure database state is completely synced
    try {
      await handleSaveAllRules(true);
    } catch {}
    stopRunnerRef.current = false;
    setRunning(true);
    patchJobQuietly({ status: "generating" });
    try {
      localStorage.setItem(`amf_runner_active_${jobId}`, "true");
    } catch {}

    const modeLabel = topics.length === 0 ? "Full Document Mode (Single Topic)" : `${topics.length} Sub-Topic Mode`;
    const apiLabel = job?.api_mode === "batch" ? "💰 50% Batch API (Cost Saver)" : "⚡ Standard Realtime API";
    setRunnerLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Generation started [${modeLabel} • ${apiLabel}]...`,
      ...prev,
    ]);

    try {
      const targetCount = job.coverageMode ? 50 : (job.total_questions ?? 20);
      const batchSize = job?.api_mode === "batch" ? 6 : 5;

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
            const imgBadge = item.hasImage ? " 🔬 [Real Medical Literature Image]" : "";
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
          patchJobQuietly({ status: "completed" });
          try {
            localStorage.removeItem(`amf_runner_active_${jobId}`);
          } catch {}
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
    patchJobQuietly({ status: "paused" });
    try {
      localStorage.removeItem(`amf_runner_active_${jobId}`);
    } catch {}
    setRunnerLog((prev) => [`[${new Date().toLocaleTimeString()}] Generation paused by user.`, ...prev.slice(0, 50)]);
  }

  // Auto-resume generation session if user previously initiated it and navigated away
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (!job || autoResumedRef.current || running) return;
    let wasActive = false;
    try {
      wasActive = localStorage.getItem(`amf_runner_active_${jobId}`) === "true";
    } catch {}
    const isGenerating = job.status === "generating" || wasActive;
    const targetCount = job.coverageMode ? 50 : (job.total_questions ?? 20);
    const currentTotal = stats.total ?? 0;

    if (isGenerating && currentTotal < targetCount && sources.length > 0) {
      autoResumedRef.current = true;
      setRunnerLog((prev) => [
        `[${new Date().toLocaleTimeString()}] 🔄 Resumed active generation session (${currentTotal}/${targetCount} questions)...`,
        ...prev,
      ]);
      void startGeneration();
    }
  }, [job, stats.total, sources.length, running, jobId]);

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
                                  onCheckedChange={(val) => patchTopicQuietly(t.id, { enabled: val })}
                                />
                                <span className="font-bold text-sm text-slate-900">{t.name}</span>
                              </div>
                              {t.description && <p className="text-xs text-slate-500 pl-8">{t.description}</p>}
                            </div>

                            {t.enabled && (
                              <TopicQuestionCountEditor
                                topicId={t.id}
                                minVal={t.min_questions ?? 0}
                                targetVal={t.target_questions ?? 1}
                                onUpdateTopic={(patch) => patchTopicQuietly(t.id, patch)}
                              />
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
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Sliders className="text-indigo-600" size={20} />
                      Parameters & Authoring Rules
                    </CardTitle>
                    <CardDescription>
                      Adjust difficulty splits, deduplication sensitivity, and question formats.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lastSavedTime && (
                      <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 size={12} className="text-emerald-600" /> Saved {lastSavedTime}
                      </span>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleSaveAllRules(false)}
                      disabled={savingRules}
                      className={`transition-all duration-300 font-bold shadow-xs gap-2 shrink-0 ${
                        justSaved
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      }`}
                    >
                      {savingRules ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : justSaved ? (
                        <CheckCircle2 size={16} className="text-white animate-in zoom-in" />
                      ) : (
                        <Save size={16} />
                      )}
                      {justSaved ? "Saved! (Options Applied)" : "Save Authoring Rules & Options"}
                    </Button>
                  </div>
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
                        onClick={() => patchJobQuietly({ api_mode: "standard" })}
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
                        onClick={() => patchJobQuietly({ api_mode: "batch" })}
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
                        onCheckedChange={(val) => patchJobQuietly({ include_images: val })}
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
                          <ImageTargetEditor job={job} onUpdate={patchJobQuietly} />
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
                                  onClick={() => patchJobQuietly({ image_frequency: mode })}
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

                  {/* Question Source Split: Internet (UWorld/USMLE) vs. PDF AI Synthesis */}
                  <QuestionSourceSplitEditor job={job} onUpdate={patchJobQuietly} />

                  {/* Difficulty Ratios */}
                  <DifficultyRatiosEditor job={job} onUpdate={patchJobQuietly} />

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
                      onValueChange={([val]) => patchJobQuietly({ dup_threshold: val })}
                    />
                    <p className="text-xs text-slate-500">
                      Questions with similarity ≥ {job.dup_threshold}% are automatically rejected to avoid duplicates.
                    </p>
                  </div>

                  {/* Question Type Ratios */}
                  <QuestionTypeRatiosEditor job={job} onUpdate={patchJobQuietly} />

                  {/* Question Length Mix */}
                  <LengthRatiosEditor job={job} onUpdate={patchJobQuietly} />

                  {/* Save Configuration Footer Bar */}
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                    <div>
                      <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                        <Save size={16} className="text-indigo-600" /> Save Authoring Rules &amp; Quotas
                      </h4>
                      <p className="text-xs text-indigo-800 mt-0.5">
                        Guarantees and persists your exact image limits ({job.include_images ? `${job.image_target_count ?? 0} images` : "Images OFF"}), source splits, and question type quotas before authoring.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastSavedTime && (
                        <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-md border border-emerald-300 shadow-2xs">
                          ✓ Saved at {lastSavedTime}
                        </span>
                      )}
                      <Button
                        type="button"
                        onClick={() => handleSaveAllRules(false)}
                        disabled={savingRules}
                        className={`transition-all duration-300 font-bold px-6 shadow-sm gap-2 ${
                          justSaved
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50"
                            : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        {savingRules ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : justSaved ? (
                          <CheckCircle2 size={16} className="text-white animate-in zoom-in" />
                        ) : (
                          <Save size={16} />
                        )}
                        {justSaved ? "Saved! (Options Applied)" : "Save Authoring Rules & Options"}
                      </Button>
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
                    Runs source extraction, question authoring, deduplication, and structural validation.
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
                        onClick={() => {
                          const next = job.api_mode === "batch" ? "standard" : "batch";
                          patchJobQuietly({ api_mode: next });
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
                        onClick={() => patchJobQuietly({ include_images: !job.include_images })}
                      >
                        <ImageIcon size={13} />
                        {job.include_images ? "AI Diagrams: ON" : "AI Diagrams: OFF"}
                      </Button>
                    </div>
                  </div>

                  {/* Active Authoring Rules Summary Card */}
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="text-indigo-600" size={18} />
                        <span className="font-bold text-sm text-indigo-950">Active Authoring Rules &amp; Enforced Quotas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {lastSavedTime && (
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                            Saved {lastSavedTime}
                          </span>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveAllRules(false)}
                          disabled={savingRules}
                          className={`h-7 text-xs font-bold gap-1.5 transition-all ${
                            justSaved
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 ring-1 ring-emerald-400"
                              : "border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          {savingRules ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : justSaved ? (
                            <CheckCircle2 size={13} className="text-white" />
                          ) : (
                            <Save size={13} />
                          )}
                          {justSaved ? "Saved! (Options Applied)" : "Save & Lock In Options"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {/* Images */}
                      <div className="p-2.5 rounded-lg bg-white border border-indigo-100 shadow-2xs">
                        <div className="text-slate-500 font-semibold flex items-center gap-1">
                          <ImageIcon size={13} className="text-indigo-600" /> Image Limit
                        </div>
                        <div className="text-sm font-bold text-slate-800 mt-1">
                          {job.include_images
                            ? `Exactly ${job.image_target_count ?? 0} Image Qs`
                            : "Images Disabled (0)"}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Strict cap • Zero duplicate images • No spoiler answers
                        </p>
                      </div>

                      {/* Source Fidelity Split */}
                      <div className="p-2.5 rounded-lg bg-white border border-indigo-100 shadow-2xs">
                        <div className="text-slate-500 font-semibold flex items-center gap-1">
                          <Globe size={13} className="text-indigo-600" /> Source Fidelity Split
                        </div>
                        <div className="text-sm font-bold text-slate-800 mt-1">
                          🔒 {job.strict_questions_count ?? (job.source_mode === "reasoning" ? 0 : (job.total_questions ?? 20))} Strict PDF / 🧠 {Math.max(0, (job.total_questions ?? 20) - (job.strict_questions_count ?? (job.source_mode === "reasoning" ? 0 : (job.total_questions ?? 20))))} AI Reasoning
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Total target: {job.total_questions ?? 20} questions
                        </p>
                      </div>

                      {/* Difficulty */}
                      <div className="p-2.5 rounded-lg bg-white border border-indigo-100 shadow-2xs">
                        <div className="text-slate-500 font-semibold flex items-center gap-1">
                          <Sliders size={13} className="text-indigo-600" /> Difficulty Split
                        </div>
                        <div className="text-sm font-bold text-slate-800 mt-1">
                          {job.difficulty_easy}% E / {job.difficulty_medium}% M / {job.difficulty_hard}% H
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Strict quota-enforced balance
                        </p>
                      </div>

                      {/* Objectives */}
                      <div className="p-2.5 rounded-lg bg-white border border-indigo-100 shadow-2xs">
                        <div className="text-slate-500 font-semibold flex items-center gap-1">
                          <Target size={13} className="text-indigo-600" /> Objective Roles
                        </div>
                        <div className="text-sm font-bold text-slate-800 mt-1 truncate" title={
                          Object.entries(job.objective_ratios ?? {})
                            .filter(([_, v]) => Number(v) > 0)
                            .map(([k, v]) => `${k}: ${v}%`)
                            .join(", ")
                        }>
                          {(() => {
                            const active = Object.entries(job.objective_ratios ?? {})
                              .filter(([_, v]) => Number(v) > 0)
                              .map(([k, v]) => `${k} (${v}%)`);
                            return active.length > 0 ? active.slice(0, 2).join(", ") + (active.length > 2 ? ` +${active.length - 2} more` : "") : "Standard / Balanced";
                          })()}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Follows exact user % weights
                        </p>
                      </div>
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
