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
  const ext = Math.max(0, Math.min(total, Number(job.external_questions_count ?? 0)));
  const ai = Math.max(0, total - ext);

  const [totalText, setTotalText] = useState(String(total));
  const [extText, setExtText] = useState(String(ext));
  const [aiText, setAiText] = useState(String(ai));

  const isTotalFocused = useRef(false);
  const isExtFocused = useRef(false);
  const isAiFocused = useRef(false);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isTotalFocused.current) setTotalText(String(total));
    if (!isExtFocused.current) setExtText(String(ext));
    if (!isAiFocused.current) setAiText(String(ai));
  }, [total, ext, ai]);

  const commitTotal = (newTot: number) => {
    const validTot = Math.max(1, Math.min(500, newTot));
    const newExt = Math.min(ext, validTot);
    const newAi = validTot - newExt;
    setTotalText(String(validTot));
    setExtText(String(newExt));
    setAiText(String(newAi));
    onUpdate({ total_questions: validTot, external_questions_count: newExt });
  };

  const commitExt = (newExtVal: number) => {
    const validExt = Math.max(0, Math.min(total, newExtVal));
    const newAi = total - validExt;
    setExtText(String(validExt));
    setAiText(String(newAi));
    onUpdate({ external_questions_count: validExt });
  };

  const commitAi = (newAiVal: number) => {
    const validAi = Math.max(0, Math.min(total, newAiVal));
    const newExt = total - validAi;
    setAiText(String(validAi));
    setExtText(String(newExt));
    onUpdate({ external_questions_count: newExt });
  };

  const applyPreset = (extRatio: number) => {
    const targetExt = Math.round(total * extRatio);
    commitExt(targetExt);
  };

  const extPct = total > 0 ? Math.round((ext / total) * 100) : 0;
  const aiPct = 100 - extPct;

  return (
    <div className="space-y-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40">
      {/* Header with live count badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <Globe size={15} className="text-indigo-600" /> Question Source Split (Internet vs. AI)
        </Label>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            🌐 {ext} Internet / UWorld ({extPct}%)
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            🤖 {ai} PDF AI Synthesis ({aiPct}%)
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Control exactly how many questions are sourced &amp; adapted from real international medical question banks (UWorld, USMLE Step 1/2, Robbins, AMBOSS) versus synthesized directly by AI from your uploaded textbook PDF.
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
                  const newExt = Math.min(ext, val);
                  const newAi = val - newExt;
                  setExtText(String(newExt));
                  setAiText(String(newAi));
                  onUpdate({ total_questions: val, external_questions_count: newExt });
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
        {/* Card 1: Internet / UWorld */}
        <div className="p-3.5 rounded-xl border border-indigo-200 bg-white shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-indigo-700 flex items-center gap-1.5">
              <Globe size={14} /> Sourced from Internet / UWorld
            </span>
            <Badge variant="outline" className="font-mono font-bold text-indigo-600 bg-indigo-50 border-indigo-200">
              {extPct}%
            </Badge>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-indigo-200 hover:bg-indigo-50 text-indigo-700"
              onClick={() => commitExt(ext - 1)}
              disabled={ext <= 0}
            >
              <Minus size={13} />
            </Button>
            <Input
              type="number"
              min={0}
              max={total}
              className="w-20 h-8 text-sm text-center font-bold border-indigo-300 focus:ring-indigo-500"
              value={extText}
              onFocus={() => {
                isExtFocused.current = true;
              }}
              onChange={(e) => {
                setExtText(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 0) {
                  const clamped = Math.min(total, val);
                  const newAi = total - clamped;
                  setAiText(String(newAi));
                  onUpdate({ external_questions_count: clamped });
                }
              }}
              onBlur={() => {
                isExtFocused.current = false;
                const val = parseInt(extText);
                commitExt(isNaN(val) || val < 0 ? 0 : val);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-indigo-200 hover:bg-indigo-50 text-indigo-700"
              onClick={() => commitExt(ext + 1)}
              disabled={ext >= total}
            >
              <Plus size={13} />
            </Button>
            <span className="text-xs text-slate-500 font-medium">questions</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Real clinical vignettes adapted from USMLE Step 1/2, UWorld &amp; AMBOSS.
          </p>
        </div>

        {/* Card 2: PDF AI Synthesis */}
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-white shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-emerald-700 flex items-center gap-1.5">
              <Sparkles size={14} /> Synthesized from PDF / AI
            </span>
            <Badge variant="outline" className="font-mono font-bold text-emerald-600 bg-emerald-50 border-emerald-200">
              {aiPct}%
            </Badge>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 text-emerald-700"
              onClick={() => commitAi(ai - 1)}
              disabled={ai <= 0}
            >
              <Minus size={13} />
            </Button>
            <Input
              type="number"
              min={0}
              max={total}
              className="w-20 h-8 text-sm text-center font-bold border-emerald-300 focus:ring-emerald-500"
              value={aiText}
              onFocus={() => {
                isAiFocused.current = true;
              }}
              onChange={(e) => {
                setAiText(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 0) {
                  const clamped = Math.min(total, val);
                  const newExt = total - clamped;
                  setExtText(String(newExt));
                  onUpdate({ external_questions_count: newExt });
                }
              }}
              onBlur={() => {
                isAiFocused.current = false;
                const val = parseInt(aiText);
                commitAi(isNaN(val) || val < 0 ? 0 : val);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 text-emerald-700"
              onClick={() => commitAi(ai + 1)}
              disabled={ai >= total}
            >
              <Plus size={13} />
            </Button>
            <span className="text-xs text-slate-500 font-medium">questions</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Original questions created directly from your textbook PDF content.
          </p>
        </div>
      </div>

      {/* Visual Slider */}
      <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-white">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-indigo-700 flex items-center gap-1">
            🌐 {ext} Internet ({extPct}%)
          </span>
          <span className="text-emerald-700 flex items-center gap-1">
            🤖 {ai} PDF AI ({aiPct}%)
          </span>
        </div>
        <Slider
          value={[ext]}
          min={0}
          max={total}
          step={1}
          onValueChange={([val]) => commitExt(val)}
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0% Internet (100% PDF)</span>
          <span>50% / 50%</span>
          <span>100% Internet (0% PDF)</span>
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
            onClick={() => applyPreset(0)}
          >
            🤖 100% PDF / AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset(0.25)}
          >
            🌐 25% Web / 75% PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset(0.5)}
          >
            ⚖️ 50% / 50% Balanced
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset(0.75)}
          >
            🌐 75% Web / 25% PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-semibold hover:bg-indigo-50 hover:text-indigo-700 border-slate-200"
            onClick={() => applyPreset(1)}
          >
            🌐 100% Internet / UWorld
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
