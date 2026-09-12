import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Languages,
} from "lucide-react";
import type { HelperTopic } from "./helper-data";
import { WebsiteWalkthroughAnim } from "./animations/WebsiteWalkthroughAnim";
import { CommitteeWalkthroughAnim } from "./animations/CommitteeWalkthroughAnim";
import { QuestionBankWalkthroughAnim } from "./animations/QuestionBankWalkthroughAnim";
import { ExamWalkthroughAnim } from "./animations/ExamWalkthroughAnim";

interface Props {
  topic: HelperTopic;
  isArabic: boolean;
  onBack: () => void;
  onClose: () => void;
  onToggleLang?: () => void;
}

export function WalkthroughViewer({ topic, isArabic, onBack, onClose, onToggleLang }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = topic.steps.length;
  const step = topic.steps[currentStep];

  function handleNext() {
    setCurrentStep((prev) => (prev + 1) % totalSteps);
  }

  function handlePrev() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Header with Back Navigation & Prominent Language Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-border/80">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {isArabic ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
          <span>{isArabic ? "الرجوع لجميع الأسئلة" : "All Questions"}</span>
        </button>

        <div className="flex items-center gap-2 mr-8 rtl:mr-0 rtl:ml-8">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${topic.badge_color}`}>
            {isArabic ? topic.badge_ar : topic.badge_en}
          </span>

          {onToggleLang && (
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-primary/50 bg-primary/10 hover:bg-primary/20 text-xs font-black text-primary transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95 shrink-0"
              title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
            >
              <Languages size={15} className="text-primary" />
              <span>{isArabic ? "English" : "العربية"}</span>
            </button>
          )}
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

      {/* Manual Step Navigation Bar & Action CTA */}
      <div className="mt-5 pt-4 border-t border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        {/* Navigation Group: Back + Step Indicator + Next */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3">
          {/* Obvious Back Button */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl border-2 border-border/90 bg-muted/80 hover:bg-muted text-foreground font-black text-xs sm:text-sm transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-muted/80 disabled:active:scale-100"
            title={isArabic ? "الخطوة السابقة" : "Previous Step"}
          >
            {isArabic ? <ChevronRight size={18} className="stroke-[2.5]" /> : <ChevronLeft size={18} className="stroke-[2.5]" />}
            <span>{isArabic ? "السابق" : "Back"}</span>
          </button>

          {/* Interactive Step Dots & Counter */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-muted/40 border border-border/60">
            {topic.steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-2.5 rounded-full transition-all cursor-pointer ${
                  idx === currentStep
                    ? "w-6 bg-primary"
                    : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
                title={`${isArabic ? "الخطوة" : "Step"} ${idx + 1}`}
              />
            ))}
            <span className="text-[11px] font-black text-muted-foreground ml-1 rtl:ml-0 rtl:mr-1">
              {currentStep + 1}/{totalSteps}
            </span>
          </div>

          {/* Obvious Primary Next Button */}
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 sm:px-7 sm:py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs sm:text-sm transition-all shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-95 cursor-pointer"
            title={
              currentStep < totalSteps - 1
                ? isArabic
                  ? "الخطوة التالية"
                  : "Next Step"
                : isArabic
                  ? "إعادة العرض من البداية"
                  : "Start from Beginning"
            }
          >
            {currentStep < totalSteps - 1 ? (
              <>
                <span>{isArabic ? "التالي" : "Next"}</span>
                {isArabic ? (
                  <ChevronLeft size={18} className="stroke-[2.5]" />
                ) : (
                  <ChevronRight size={18} className="stroke-[2.5]" />
                )}
              </>
            ) : (
              <>
                <RotateCcw size={16} className="stroke-[2.5]" />
                <span>{isArabic ? "إعادة من البداية" : "Start Over"}</span>
              </>
            )}
          </button>
        </div>

        {/* Action Link CTA */}
        <Link
          to={topic.action_href}
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2.5 text-xs sm:text-sm font-black transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
        >
          <span>{isArabic ? topic.action_label_ar : topic.action_label_en}</span>
          <ExternalLink size={15} />
        </Link>
      </div>
    </div>
  );
}
