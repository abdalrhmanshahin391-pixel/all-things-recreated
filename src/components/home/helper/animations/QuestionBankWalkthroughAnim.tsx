import { motion } from "framer-motion";
import {
  CheckCircle2,
  Bookmark,
  Sparkles,
  HelpCircle,
  FileText,
  Lightbulb,
} from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function QuestionBankWalkthroughAnim({ currentStep, isArabic }: Props) {
  const options = [
    { id: "A", text_en: "Aspirin 81 mg daily", text_ar: "أسبرين 81 ملغ يومياً", correct: false },
    {
      id: "B",
      text_en: "Immediate Coronary Angiography (PCI)",
      text_ar: "قسطرة قلبية تداخلية فورية (PCI)",
      correct: true,
    },
    { id: "C", text_en: "Beta-blocker monotherapy", text_ar: "علاج أحادي بحاصرات بيتا", correct: false },
    { id: "D", text_en: "Oral nitrates alone", text_ar: "نترات فموية فقط", correct: false },
  ];

  return (
    <div className="relative w-full h-[340px] sm:h-[380px] bg-slate-950 rounded-2xl border border-slate-800 p-4 sm:p-6 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Ambient background */}
      <div className="absolute top-0 left-1/4 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Question Card Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 z-10">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
            Q. 42
          </span>
          <span className="text-xs text-slate-400 font-medium">Cardiology · High Yield</span>
        </div>

        {/* Bookmark Action */}
        <motion.div
          animate={{
            scale: currentStep === 2 ? [1, 1.25, 1] : 1,
            color: currentStep === 2 ? "#f59e0b" : "#94a3b8",
          }}
          transition={{ duration: 1.2, repeat: currentStep === 2 ? Infinity : 0 }}
          className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md bg-slate-900 border border-slate-800"
        >
          <Bookmark size={13} className={currentStep === 2 ? "fill-amber-400 text-amber-400" : ""} />
          <span>{currentStep === 2 ? (isArabic ? "تم الحفظ" : "Bookmarked") : isArabic ? "حفظ" : "Save"}</span>
        </motion.div>
      </div>

      {/* Main MCQ Area */}
      <div className="relative flex-1 flex flex-col justify-center py-2 z-10 max-w-lg mx-auto w-full">
        {/* Question Prompt */}
        <p className="text-xs sm:text-sm font-semibold text-slate-200 mb-3 leading-snug">
          {isArabic
            ? "مريض يبلغ 54 عاماً يعاني من ألم حاد في الصدر مع ارتفاع في قطعة ST (STEMI). ما هو الإجراء الأنسب فوراً؟"
            : "A 54-year-old patient presents with acute crushing chest pain and ST-elevation on ECG. What is the gold-standard immediate management?"}
        </p>

        {/* Options List */}
        <div className="space-y-1.5">
          {options.map((opt) => {
            const isSelected = opt.id === "B" && currentStep >= 0;
            const isCorrectHighlighted = opt.correct && currentStep >= 1;

            return (
              <motion.div
                key={opt.id}
                animate={{
                  backgroundColor: isCorrectHighlighted
                    ? "rgba(16, 185, 129, 0.15)"
                    : isSelected
                    ? "rgba(14, 165, 233, 0.15)"
                    : "rgba(15, 23, 42, 0.6)",
                  borderColor: isCorrectHighlighted
                    ? "#10b981"
                    : isSelected
                    ? "#38bdf8"
                    : "rgba(51, 65, 85, 0.6)",
                }}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-colors ${
                  isCorrectHighlighted ? "text-emerald-300 font-bold" : "text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                      isCorrectHighlighted
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {opt.id}
                  </span>
                  <span>{isArabic ? opt.text_ar : opt.text_en}</span>
                </div>

                {isCorrectHighlighted && (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Step 2: Slide-up Detailed Explanation */}
        {currentStep === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-2 text-emerald-200"
          >
            <Lightbulb size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-bold text-xs block text-emerald-300">
                {isArabic ? "التفسير الطبي العلمي" : "Clinical Explanation"}
              </span>
              <p className="text-[11px] text-emerald-200/90 leading-tight">
                {isArabic
                  ? "القسطرة الأولية (Primary PCI) هي المعيار الذهبي لإعادة تروية الشريان المسدود خلال 90 دقيقة."
                  : "Primary PCI is the definitive reperfusion strategy for STEMI within the recommended 90-minute window."}
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          {isArabic
            ? `المرحلة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "اختيار الإجابة"
                  : currentStep === 1
                  ? "التصحيح الفوري"
                  : "الشرح وحفظ السؤال"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Select Choice"
                  : currentStep === 1
                  ? "Instant Verification"
                  : "Explanation & Bookmark"
              }`}
        </span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep === step ? "w-6 bg-blue-400" : "w-2 bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
