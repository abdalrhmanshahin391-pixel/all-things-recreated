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
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile, { passive: true });
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // High-performance target tracking: smooth scroll + RAF debounced measuring
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let isCancelled = false;
    const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;

    function measure() {
      if (isCancelled) return;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect((prev) => {
          if (
            !prev ||
            Math.abs(prev.top - rect.top) > 2 ||
            Math.abs(prev.left - rect.left) > 2 ||
            Math.abs(prev.width - rect.width) > 2 ||
            Math.abs(prev.height - rect.height) > 2
          ) {
            return rect;
          }
          return prev;
        });
      } else {
        setTargetRect(null);
      }
    }

    if (el) {
      const mobile = window.innerWidth < 640;
      if (mobile) {
        // On mobile: scroll the target into the UPPER half (leaving lower half 100% free for the bottom sheet card)
        const headerOffset = 90;
        const elementTop = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: Math.max(0, elementTop - headerOffset),
          behavior: "smooth",
        });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }

      // Initial measure
      measure();
      // Re-measure when smooth scroll finishes
      const t1 = setTimeout(measure, 150);
      const t2 = setTimeout(measure, 350);

      // Throttled RAF handler for user manual scrolling/resizing
      let rafId: number | null = null;
      const onScrollOrResize = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          measure();
          rafId = null;
        });
      };

      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize, { passive: true });

      // Observe only target element for size changes
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);

      return () => {
        isCancelled = true;
        clearTimeout(t1);
        clearTimeout(t2);
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("scroll", onScrollOrResize);
        window.removeEventListener("resize", onScrollOrResize);
        ro.disconnect();
      };
    }
  }, [isOpen, currentStepIndex, currentStep?.targetSelector, lang]);

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
  const pad = isMobile ? 6 : 8;
  const cutoutTop = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const cutoutLeft = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const cutoutWidth = targetRect ? targetRect.width + pad * 2 : 0;
  const cutoutHeight = targetRect ? targetRect.height + pad * 2 : 0;
  const cutoutRight = cutoutLeft + cutoutWidth;
  const cutoutBottom = cutoutTop + cutoutHeight;

  // Positioning calculations
  const cardWidth = Math.min(420, typeof window !== "undefined" ? window.innerWidth - 24 : 390);
  const cardHeight = 320;
  let desktopCardTop = 100;
  let desktopCardLeft = 100;

  if (targetRect && typeof window !== "undefined" && !isMobile) {
    const effectivePlacement = isArabic
      ? currentStep.placement === "left"
        ? "right"
        : currentStep.placement
      : currentStep.placement;

    if (effectivePlacement === "left") {
      if (targetRect.left >= cardWidth + 24) {
        desktopCardLeft = targetRect.left - cardWidth - 16;
        desktopCardTop = Math.max(16, Math.min(window.innerHeight - cardHeight - 16, targetRect.top - 20));
      } else {
        desktopCardTop = Math.min(window.innerHeight - cardHeight - 16, targetRect.bottom + 16);
        desktopCardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      }
    } else if (effectivePlacement === "right") {
      if (targetRect.right + cardWidth + 24 <= window.innerWidth) {
        desktopCardLeft = targetRect.right + 16;
        desktopCardTop = Math.max(16, Math.min(window.innerHeight - cardHeight - 16, targetRect.top - 20));
      } else {
        desktopCardTop = Math.min(window.innerHeight - cardHeight - 16, targetRect.bottom + 16);
        desktopCardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      }
    } else {
      // placement "bottom"
      if (targetRect.bottom + cardHeight + 24 <= window.innerHeight) {
        desktopCardTop = targetRect.bottom + 16;
      } else {
        desktopCardTop = Math.max(16, targetRect.top - cardHeight - 16);
      }
      if (isArabic) {
        const preferredLeft = targetRect.right - cardWidth;
        desktopCardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, preferredLeft));
      } else {
        desktopCardLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left));
      }
    }
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
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer pointer-events-auto"
          />
          {/* Bottom Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutBottom, left: 0, right: 0, bottom: 0 }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer pointer-events-auto"
          />
          {/* Left Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutTop, left: 0, width: cutoutLeft, height: cutoutHeight }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer pointer-events-auto"
          />
          {/* Right Blurred Box */}
          <div
            onClick={onClose}
            style={{ top: cutoutTop, left: cutoutRight, right: 0, height: cutoutHeight }}
            className="fixed bg-slate-950/80 backdrop-blur-md z-[200] transition-all duration-200 cursor-pointer pointer-events-auto"
          />
        </>
      ) : (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] pointer-events-auto"
        />
      )}

      {/* 
        ==============================================================
        SHINING TARGET SPOTLIGHT BORDER
        Frames the unblurred target with a bright pulsing amber halo!
        Fast CSS transition avoids spring-physics stutter on mobile GPUs.
        ==============================================================
      */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: cutoutTop,
            left: cutoutLeft,
            width: cutoutWidth,
            height: cutoutHeight,
            borderRadius: isMobile ? "12px" : "16px",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="pointer-events-none z-[202] border-2 border-amber-400 dark:border-amber-300 ring-4 ring-amber-400/40 shadow-[0_0_35px_rgba(245,158,11,0.9),inset_0_0_15px_rgba(245,158,11,0.2)] animate-pulse"
        />
      )}

      {/* 
        ==============================================================
        SHINING GUIDE BOX (CAROUSEL / DIALOG)
        On Mobile: Docks smoothly as a Bottom Sheet (never overlaps target).
        On Desktop: Floats relative to target with intelligent RTL mirroring.
        ==============================================================
      */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.id}
          initial={isMobile ? { opacity: 0, y: 30 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={isMobile ? { opacity: 0, y: 20 } : { opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          style={
            isMobile
              ? {
                  position: "fixed",
                  bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                  left: "12px",
                  right: "12px",
                  margin: "0 auto",
                  maxWidth: "420px",
                  width: "calc(100% - 24px)",
                }
              : {
                  position: "fixed",
                  top: desktopCardTop,
                  left: desktopCardLeft,
                  width: cardWidth,
                }
          }
          className="z-[210] rounded-3xl border-2 border-indigo-400/90 ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-slate-950 bg-slate-900/98 text-white backdrop-blur-2xl shadow-[0_0_50px_rgba(99,102,241,0.7),0_0_20px_rgba(168,85,247,0.5),0_25px_50px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Top radiant rainbow light line */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500 shadow-[0_0_15px_rgba(99,102,241,0.9)]" />

          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            {/* Header: Badge, Obvious Arabic Switcher, and Skip button */}
            <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b border-slate-700/80">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0 shadow-inner">
                  {currentStep.icon}
                </div>
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-300 border border-indigo-400/40 truncate">
                  {isArabic ? currentStep.badge_ar : currentStep.badge_en}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Obvious Glowing Arabic Language Switch Button */}
                <button
                  type="button"
                  onClick={() => setLang(isArabic ? "en" : "ar")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full font-black text-xs border border-amber-300 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.7)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
                >
                  <Languages size={13} className="text-slate-950" />
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
            <div className="space-y-1 sm:space-y-2">
              <h4 className="font-extrabold text-sm sm:text-base md:text-lg text-white leading-tight drop-shadow-sm">
                {isArabic ? currentStep.title_ar : currentStep.title_en}
              </h4>
              <p className="text-xs sm:text-[13px] text-slate-200 whitespace-pre-line leading-relaxed font-medium">
                {isArabic ? currentStep.desc_ar : currentStep.desc_en}
              </p>
            </div>

            {/* Footer Navigation Bar */}
            <div className="pt-2.5 sm:pt-3 border-t border-slate-700/80 flex items-center justify-between gap-2">
              {/* Step indicator dots */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 sm:h-2 rounded-full transition-all ${
                      i === currentStepIndex
                        ? "w-4 sm:w-5 bg-gradient-to-r from-indigo-400 to-purple-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                        : "w-1.5 sm:w-2 bg-slate-600"
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
                    {isArabic ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                    <span>{isArabic ? "السابق" : "Back"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-black transition-all shadow-[0_0_20px_rgba(99,102,241,0.7)] cursor-pointer hover:scale-105 active:scale-95"
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
                    isArabic ? <ArrowLeft size={12} /> : <ArrowRight size={12} />
                  ) : (
                    <CheckCircle2 size={12} />
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
