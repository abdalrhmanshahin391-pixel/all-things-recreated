import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Layers,
  BookOpen,
  Timer,
  Flag,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";

export interface LiveCourseTourProps {
  isOpen: boolean;
  onClose: () => void;
  isArabic: boolean;
  isEnrolled: boolean;
  freeSubjectName?: string;
  onSelectFreeSubject?: () => void;
}

interface TourStep {
  id: string;
  targetSelector: string;
  title_en: string;
  title_ar: string;
  badge_en: string;
  badge_ar: string;
  desc_en: string;
  desc_ar: string;
  placement: "bottom" | "top" | "left" | "right";
  icon: React.ReactNode;
}

export function LiveCourseTour({
  isOpen,
  onClose,
  isArabic,
  isEnrolled,
  freeSubjectName,
  onSelectFreeSubject,
}: LiveCourseTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps: TourStep[] = [
    {
      id: "subject-selection",
      targetSelector: '[data-tour="tour-subject"]',
      title_en: isEnrolled
        ? "Step 1: Choose Subjects or Test All"
        : `Step 1: Free Topic — ${freeSubjectName || "Available for You"}`,
      title_ar: isEnrolled
        ? "الخطوة الأولى: اختيار المواد أو اختبار الكل"
        : `الخطوة الأولى: مادة مجانية — ${freeSubjectName || "متاحة لك الآن"}`,
      badge_en: isEnrolled ? "Subject Selection" : "Free Preview",
      badge_ar: isEnrolled ? "اختيار المواد" : "قسم مجاني",
      desc_en: isEnrolled
        ? "Click any topic to practice only its questions.\n⚡ Key Rule: If you don't select any topic (0 selected), ALL accessible questions in this course are automatically included in your test!"
        : `You can try this free topic without subscribing! Click on it to practice its questions.\n⚡ Key Rule: If no topic is selected, all accessible questions are included automatically.`,
      desc_ar: isEnrolled
        ? "انقر على أي مادة لتحديدها ودراسة أسئلتها فقط.\n⚡ قاعدة هامة: في حال لم تحدد أي مادة (0 محددة)، ستتم إضافة جميع أسئلة الكورس المتاحة تلقائياً للاختبار!"
        : `يمكنك تجربة هذا القسم مجاناً بالكامل بدون اشتراك! انقر عليه لتجربة أسئلته.\n⚡ تذكّر: إذا لم تختر أي مادة، ستضاف جميع الأسئلة المتاحة تلقائياً.`,
      placement: "bottom",
      icon: <Layers className="text-blue-500" size={18} />,
    },
    {
      id: "modes-selection",
      targetSelector: '[data-tour="tour-modes"]',
      title_en: "Step 2: Choose Your Study Mode",
      title_ar: "الخطوة الثانية: اختيار نمط الدراسة (3 أنماط)",
      badge_en: "Study Modes",
      badge_ar: "أنماط الدراسة",
      desc_en:
        "• Study mode: Pre-revealed answers and clinical explanations for reading.\n• Session mode: Question-by-question practice with instant feedback.\n• Exam mode: Authentic university simulation with hidden answers and final score diagnostics.",
      desc_ar:
        "• نمط المراجعة (Study): إظهار الإجابات والشرح فوراً للقراءة والمذاكرة السريعة.\n• نمط التدريب (Session): حل تفاعلي مع تصحيح فوري بعد كل سؤال.\n• نمط الامتحان (Exam): محاكاة حقيقية بدون إظهار الإجابات حتى تسليم الامتحان.",
      placement: "left",
      icon: <BookOpen className="text-emerald-500" size={18} />,
    },
    {
      id: "timed-selection",
      targetSelector: '[data-tour="tour-timed"]',
      title_en: "Step 3: Enable Countdown Timer",
      title_ar: "الخطوة الثالثة: تفعيل المؤقت للامتحان",
      badge_en: "Timed Exam",
      badge_ar: "امتحان بوقت محدد",
      desc_en:
        "Toggle 'Timed (Exam)' ON to set a countdown timer (15m, 30m, 1h, 1.5h, 2h). When the timer expires in Exam mode, your exam is auto-submitted.",
      desc_ar:
        "قم بتشغيل خيار Timed (Exam) لتحديد عداد تنازلي (من 15 دقيقة إلى ساعتين). عند انتهاء الوقت يسلم الامتحان وتظهر نتيجتك تلقائياً.",
      placement: "left",
      icon: <Timer className="text-amber-500" size={18} />,
    },
    {
      id: "pool-selection",
      targetSelector: '[data-tour="tour-pool"]',
      title_en: "Step 4: Question Pool & Smart Flagging",
      title_ar: "الخطوة الرابعة: الأسئلة المعلمة ومراجعة الأخطاء",
      badge_en: "Smart Pool",
      badge_ar: "مراجعة ذكية",
      desc_en:
        "• All: All subject questions.\n• Flagged: Only your bookmarked questions.\n• Wrong: Only questions you missed previously.\n💡 In-quiz bonus: If you spend over 45s on a question, the 🚩 Flag button will shine to remind you to bookmark it!",
      desc_ar:
        "• All: جميع أسئلة المادة.\n• Flagged: الأسئلة المعلمة بالعلم (🚩).\n• Wrong: الأسئلة التي أجبت عليها خطأ لإتقانها.\n💡 ميزة ذكية: داخل الجلسة، إذا استغرقت أكثر من 45 ثانية في سؤال سيضيء زر العلم 🚩 لتذكيرك بتعليمه!",
      placement: "left",
      icon: <Flag className="text-purple-500" size={18} />,
    },
  ];

  const currentStep = steps[currentStepIndex];

  // Update target bounding box on step change or resize/scroll
  useEffect(() => {
    if (!isOpen) return;

    function updateRect() {
      if (!currentStep) return;
      const el = document.querySelector(currentStep.targetSelector);
      if (el) {
        // Scroll element into center view smoothly
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        setTimeout(() => {
          setTargetRect(el.getBoundingClientRect());
        }, 250);
      } else {
        setTargetRect(null);
      }
    }

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [isOpen, currentStepIndex, currentStep]);

  if (!isOpen) return null;

  function handleNext() {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }

  function handlePrev() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] overflow-hidden pointer-events-auto"
      dir={isArabic ? "rtl" : "ltr"}
    >
      {/* Semi-transparent dark overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] transition-all"
      />

      {/* Target Element Spotlight Frame */}
      {targetRect && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{
            opacity: 1,
            scale: 1,
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          style={{
            position: "fixed",
            borderRadius: "20px",
          }}
          className="pointer-events-none z-[201] border-2 border-primary shadow-[0_0_0_9999px_rgba(2,6,23,0.72),0_0_30px_rgba(59,130,246,0.6)]"
        />
      )}

      {/* Floating Animated Pointer Arrow & Tour Tooltip Card */}
      {targetRect && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            style={{
              position: "fixed",
              top: Math.max(
                20,
                Math.min(
                  window.innerHeight - 340,
                  currentStep.placement === "bottom"
                    ? targetRect.bottom + 16
                    : Math.max(20, targetRect.top - 20)
                )
              ),
              left:
                currentStep.placement === "left" && !isArabic
                  ? Math.max(20, targetRect.left - 380)
                  : currentStep.placement === "left" && isArabic
                    ? Math.min(window.innerWidth - 380, targetRect.right + 20)
                    : Math.max(20, Math.min(window.innerWidth - 400, targetRect.left)),
            }}
            className="z-[205] w-[92vw] max-w-[390px] rounded-3xl border-2 border-primary/40 bg-card/95 backdrop-blur-xl p-5 shadow-2xl text-foreground"
          >
            {/* Header: Badge, Step, and Skip button */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  {currentStep.icon}
                </div>
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {isArabic ? currentStep.badge_ar : currentStep.badge_en}
                </span>
              </div>

              {/* Prominent Skip Button */}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title={isArabic ? "تخطي الجولة وإنهاؤها" : "Skip and Exit Tour"}
              >
                <span>{isArabic ? "تخطي الجولة" : "Skip"}</span>
                <X size={14} />
              </button>
            </div>

            {/* Title & Description */}
            <div className="py-3">
              <h4 className="font-extrabold text-sm sm:text-base text-foreground leading-tight">
                {isArabic ? currentStep.title_ar : currentStep.title_en}
              </h4>
              <p className="text-xs sm:text-[13px] text-muted-foreground mt-2 whitespace-pre-line leading-relaxed">
                {isArabic ? currentStep.desc_ar : currentStep.desc_en}
              </p>
            </div>

            {/* Footer Navigation Bar */}
            <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-2">
              {/* Step indicator dots */}
              <div className="flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all ${
                      i === currentStepIndex
                        ? "w-5 bg-primary"
                        : "w-2 bg-muted-foreground/30"
                    }`}
                  />
                ))}
                <span className="text-[10px] font-extrabold text-muted-foreground ml-1 rtl:ml-0 rtl:mr-1">
                  {currentStepIndex + 1}/{steps.length}
                </span>
              </div>

              {/* Navigation Controls: Back + Next */}
              <div className="flex items-center gap-1.5">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer"
                  >
                    {isArabic ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                    <span>{isArabic ? "السابق" : "Back"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-all shadow-md shadow-primary/25 cursor-pointer active:scale-95"
                >
                  <span>
                    {currentStepIndex < steps.length - 1
                      ? isArabic
                        ? "التالي"
                        : "Next"
                      : isArabic
                        ? "تم، ابدأ الآن"
                        : "Got it, Start!"}
                  </span>
                  {currentStepIndex < steps.length - 1 ? (
                    isArabic ? <ArrowLeft size={13} /> : <ArrowRight size={13} />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
