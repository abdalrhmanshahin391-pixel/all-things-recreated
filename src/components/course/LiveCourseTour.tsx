import React, { useEffect, useState } from "react";
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
  Languages,
} from "lucide-react";
import { useLang } from "@/components/LanguageProvider";

export interface LiveCourseTourProps {
  isOpen: boolean;
  onClose: () => void;
  isArabic?: boolean;
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
  isEnrolled,
  freeSubjectName,
  onSelectFreeSubject,
}: LiveCourseTourProps) {
  const { lang, setLang } = useLang();
  const isArabic = lang === "ar";
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
        : `الخطوة الأولى: قسم مجاني — ${freeSubjectName || "متاح لك مجاناً"}`,
      badge_en: isEnrolled ? "Subject Selection" : "Free Preview",
      badge_ar: isEnrolled ? "اختيار المواد" : "قسم مجاني",
      desc_en: isEnrolled
        ? "Click any topic to practice only its questions.\n⚡ Key Rule: If you don't select any topic (0 selected), ALL accessible questions in this course are automatically included in your test!"
        : `You can try this free topic without subscribing! Click on it to practice its questions.\n⚡ Key Rule: If no topic is selected, all accessible questions are included automatically.`,
      desc_ar: isEnrolled
        ? "انقر على أي مادة لتحديدها ودراسة أسئلتها فقط.\n⚡ قاعدة هامة: في حال لم تحدد أي مادة (0 محددة)، ستتم إضافة جميع أسئلة الكورس المتاحة تلقائياً للاختبار!"
        : `يمكنك تجربة هذا القسم مجاناً بالكامل بدون اشتراك! انقر عليه لتجربة أسئلته.\n⚡ تذكّر: إذا لم تختر أي مادة، ستضاف جميع الأسئلة المتاحة تلقائياً.`,
      placement: "bottom",
      icon: <Layers className="text-blue-400" size={18} />,
    },
    {
      id: "modes-selection",
      targetSelector: '[data-tour="tour-modes"]',
      title_en: "Step 2: Choose Your Study Mode",
      title_ar: "الخطوة الثانية: اختيار نمط الدراسة (3 أنماط)",
      badge_en: "Study Modes",
      badge_ar: "أنماط الدراسة",
      desc_en:
        "• Study mode: Pre-revealed answers and clinical explanations for fast reading.\n• Session mode: Question-by-question practice with instant feedback.\n• Exam mode: Authentic university simulation with hidden answers and final score diagnostics.",
      desc_ar:
        "• نمط المراجعة (Study): إظهار الإجابات والشرح فوراً للقراءة والمذاكرة السريعة.\n• نمط التدريب (Session): حل تفاعلي مع تصحيح فوري بعد كل سؤال.\n• نمط الامتحان (Exam): محاكاة حقيقية بدون إظهار الإجابات حتى تسليم الامتحان.",
      placement: "left",
      icon: <BookOpen className="text-emerald-400" size={18} />,
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
      icon: <Timer className="text-amber-400" size={18} />,
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
      icon: <Flag className="text-purple-400" size={18} />,
    },
  ];

  const currentStep = steps[currentStepIndex];

  // Update target bounding box on step change, resize, or scroll
  useEffect(() => {
    if (!isOpen) return;

    function updateRect() {
      if (!currentStep) return;
      const el = document.querySelector(currentStep.targetSelector);
      if (el) {
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
  }, [isOpen, currentStepIndex, currentStep?.targetSelector]);

  // Handle auto-selection of free subject on Step 1 if user is not enrolled
  useEffect(() => {
    if (isOpen && currentStepIndex === 0 && !isEnrolled && onSelectFreeSubject) {
      onSelectFreeSubject();
    }
  }, [isOpen, currentStepIndex, isEnrolled, onSelectFreeSubject]);

  if (!isOpen || !currentStep) return null;

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

  // Precise cutout dimensions with padding so target is completely UNBLURRED and clear
  const pad = 8;
  const cutoutTop = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const cutoutLeft = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const cutoutWidth = targetRect ? targetRect.width + pad * 2 : 0;
  const cutoutHeight = targetRect ? targetRect.height + pad * 2 : 0;
  const cutoutRight = cutoutLeft + cutoutWidth;
  const cutoutBottom = cutoutTop + cutoutHeight;

  // Safe floating card coordinates
  const cardWidth = 390;
  const cardHeight = 360;
  let cardTop = 100;
  let cardLeft = 100;

  if (targetRect) {
    if (currentStep.placement === "left") {
      if (targetRect.left >= cardWidth + 24) {
        cardLeft = targetRect.left - cardWidth - 16;
        cardTop = Math.max(16, Math.min(window.innerHeight - cardHeight - 16, targetRect.top - 20));
      } else {
        cardTop = Math.min(window.innerHeight - cardHeight - 16, targetRect.bottom + 16);
        cardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      }
    } else {
      if (targetRect.bottom + cardHeight + 24 <= window.innerHeight) {
        cardTop = targetRect.bottom + 16;
        cardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      } else {
        cardTop = Math.max(16, targetRect.top - cardHeight - 16);
        cardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      }
    }
  } else {
    cardTop = Math.max(20, (window.innerHeight - cardHeight) / 2);
    cardLeft = Math.max(20, (window.innerWidth - cardWidth) / 2);
  }

  return (
    <div
      className="fixed inset-0 z-[200] overflow-hidden pointer-events-auto"
      dir={isArabic ? "rtl" : "ltr"}
    >
      {/* 
        ==============================================================
        4 SURROUNDING BACKDROP-BLUR OVERLAYS
        Everything outside the target cutout is blurred and dimmed.
        The cutout itself has ZERO overlay so the target element is
        100% UNBLURRED, CRYSTAL CLEAR, AND RAZOR SHARP!
        ==============================================================
      */}
      {targetRect ? (
        <>
          {/* Top Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: 0, left: 0, right: 0, height: cutoutTop }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer"
          />
          {/* Bottom Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutBottom, left: 0, right: 0, bottom: 0 }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer"
          />
          {/* Left Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutTop, left: 0, width: cutoutLeft, height: cutoutHeight }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer"
          />
          {/* Right Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutTop, left: cutoutRight, right: 0, height: cutoutHeight }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer"
          />
        </>
      ) : (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200]"
        />
      )}

      {/* 
        ==============================================================
        SHINING TARGET SPOTLIGHT BORDER
        Frames the unblurred target with a bright pulsing amber halo!
        ==============================================================
      */}
      {targetRect && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1,
            top: cutoutTop,
            left: cutoutLeft,
            width: cutoutWidth,
            height: cutoutHeight,
          }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          style={{
            position: "fixed",
            borderRadius: "16px",
          }}
          className="pointer-events-none z-[202] border-2 border-amber-400 dark:border-amber-300 ring-4 ring-amber-400/40 shadow-[0_0_35px_rgba(245,158,11,0.9),inset_0_0_15px_rgba(245,158,11,0.2)] animate-pulse"
        />
      )}

      {/* 
        ==============================================================
        SHINING GUIDE BOX (CAROUSEL / DIALOG)
        Vibrant luminous glow, prominent Arabic switcher, and high contrast!
        ==============================================================
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.id}
          initial={{ opacity: 0, y: 15, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          style={{
            position: "fixed",
            top: cardTop,
            left: cardLeft,
          }}
          className="z-[210] w-[92vw] max-w-[390px] rounded-3xl border-2 border-indigo-400/90 ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-slate-950 bg-slate-900/98 text-white backdrop-blur-2xl shadow-[0_0_60px_rgba(99,102,241,0.7),0_0_25px_rgba(168,85,247,0.5),0_25px_50px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Top radiant rainbow light line */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500 shadow-[0_0_15px_rgba(99,102,241,0.9)]" />

          <div className="p-5 sm:p-6 space-y-4">
            {/* Header: Badge, Obvious Arabic Switcher, and Skip button */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/80">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0 shadow-inner">
                  {currentStep.icon}
                </div>
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/25 text-indigo-300 border border-indigo-400/40 truncate">
                  {isArabic ? currentStep.badge_ar : currentStep.badge_en}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Obvious Glowing Arabic Language Switch Button */}
                <button
                  type="button"
                  onClick={() => setLang(isArabic ? "en" : "ar")}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-black text-xs border border-amber-300 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.7)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
                >
                  <Languages size={14} className="text-slate-950" />
                  <span>{isArabic ? "English" : "العربية"}</span>
                </button>

                {/* Dedicated Skip Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  title={isArabic ? "تخطي الجولة وإنهاؤها" : "Skip and Exit Tour"}
                >
                  <span>{isArabic ? "تخطي" : "Skip"}</span>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h4 className="font-extrabold text-base sm:text-lg text-white leading-tight drop-shadow-sm">
                {isArabic ? currentStep.title_ar : currentStep.title_en}
              </h4>
              <p className="text-xs sm:text-[13px] text-slate-200 whitespace-pre-line leading-relaxed font-medium">
                {isArabic ? currentStep.desc_ar : currentStep.desc_en}
              </p>
            </div>

            {/* Footer Navigation Bar */}
            <div className="pt-3 border-t border-slate-700/80 flex items-center justify-between gap-2">
              {/* Step indicator dots */}
              <div className="flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all ${
                      i === currentStepIndex
                        ? "w-5 bg-gradient-to-r from-indigo-400 to-purple-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                        : "w-2 bg-slate-600"
                    }`}
                  />
                ))}
                <span className="text-[10px] font-black text-slate-400 ml-1 rtl:ml-0 rtl:mr-1">
                  {currentStepIndex + 1}/{steps.length}
                </span>
              </div>

              {/* Navigation Controls: Back + Next */}
              <div className="flex items-center gap-1.5">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    {isArabic ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                    <span>{isArabic ? "السابق" : "Back"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-black transition-all shadow-[0_0_20px_rgba(99,102,241,0.7)] cursor-pointer hover:scale-105 active:scale-95"
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
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
