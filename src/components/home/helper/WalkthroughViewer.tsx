import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { HelperTopic } from "./helper-data";
import { WebsiteWalkthroughAnim } from "./animations/WebsiteWalkthroughAnim";
import { CommitteeWalkthroughAnim } from "./animations/CommitteeWalkthroughAnim";
import { QuestionBankWalkthroughAnim } from "./animations/QuestionBankWalkthroughAnim";
import { ExamWalkthroughAnim } from "./animations/ExamWalkthroughAnim";
import { AquaVisionXAnim } from "./animations/AquaVisionXAnim";

interface Props {
  topic: HelperTopic;
  isArabic: boolean;
  onBack: () => void;
  onClose: () => void;
}

export function WalkthroughViewer({ topic, isArabic, onBack, onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const totalSteps = topic.steps.length;

  // Auto-play steps
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % totalSteps);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying, totalSteps]);

  const step = topic.steps[currentStep];

  function handleNext() {
    setIsPlaying(false);
    setCurrentStep((prev) => (prev + 1) % totalSteps);
  }

  function handlePrev() {
    setIsPlaying(false);
    setCurrentStep((prev) => (prev - 1 + totalSteps) % totalSteps);
  }

  function handleReplay() {
    setCurrentStep(0);
    setIsPlaying(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Header with Back Navigation */}
      <div className="flex items-center justify-between pb-3 border-b border-border/80">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          {isArabic ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
          <span>{isArabic ? "الرجوع لجميع الأسئلة" : "All Questions"}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${topic.badge_color}`}>
            {isArabic ? topic.badge_ar : topic.badge_en}
          </span>
        </div>
      </div>

      {/* Title & Subtitle */}
      <div className="py-3">
        <h3 className="text-base sm:text-lg font-black text-foreground">
          {isArabic ? topic.title_ar : topic.title_en}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          {isArabic ? topic.short_desc_ar : topic.short_desc_en}
        </p>
      </div>

      {/* Animation Canvas */}
      <div className="my-1">
        {topic.id === "how-to-use-website" && (
          <WebsiteWalkthroughAnim currentStep={currentStep} isArabic={isArabic} />
        )}
        {topic.id === "what-is-committee" && (
          <CommitteeWalkthroughAnim currentStep={currentStep} isArabic={isArabic} />
        )}
        {topic.id === "how-to-use-qbank" && (
          <QuestionBankWalkthroughAnim currentStep={currentStep} isArabic={isArabic} />
        )}
        {topic.id === "how-to-take-exams" && (
          <ExamWalkthroughAnim currentStep={currentStep} isArabic={isArabic} />
        )}
        {topic.id === "how-to-use-aquavisionx" && (
          <AquaVisionXAnim currentStep={currentStep} isArabic={isArabic} />
        )}
      </div>

      {/* Current Step Description Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-3 p-3 sm:p-4 rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black text-primary">
              {isArabic ? step.title_ar : step.title_en}
            </span>
            {step.badge_en && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {isArabic ? step.badge_ar : step.badge_en}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
            {isArabic ? step.description_ar : step.description_en}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Playback Controls & Action CTA */}
      <div className="mt-4 pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Step Navigation & Playback */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={isArabic ? "الخطوة السابقة" : "Previous Step"}
          >
            {isArabic ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? (isArabic ? "إيقاف" : "Pause") : isArabic ? "تشغيل" : "Play"}</span>
          </button>

          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={isArabic ? "الخطوة التالية" : "Next Step"}
          >
            {isArabic ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          <button
            onClick={handleReplay}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1"
            title={isArabic ? "إعادة العرض" : "Replay"}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Action Link CTA */}
        <Link
          to={topic.action_href}
          onClick={onClose}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 transition-all"
        >
          <span>{isArabic ? topic.action_label_ar : topic.action_label_en}</span>
          <ExternalLink size={14} />
        </Link>
      </div>
    </div>
  );
}
