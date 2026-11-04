import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
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

/** Dim layer behind the tour: a dark navy that reads the same in every site theme. */
const DIM = "oklch(0.2 0.05 262 / 0.62)";

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
  const [viewport, setViewport] = useState({ w: 1024, h: 768 });
  const [cardHeight, setCardHeight] = useState(300);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  // Detect mobile device and keep the viewport size for positioning
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 640);
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
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
      icon: <Layers size={18} />,
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
      icon: <BookOpen size={18} />,
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
      icon: <Timer size={18} />,
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
      icon: <Flag size={18} />,
    },
  ];

  const currentStep = steps[currentStepIndex];

  // Start again from step 1 every time the tour is opened
  useEffect(() => {
    if (isOpen) setCurrentStepIndex(0);
  }, [isOpen]);

  // Track the target: smooth scroll once, then re-measure on scroll / resize / size changes.
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let isCancelled = false;
    const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;

    // No such element on this page (for example the control is hidden): show the card on its own,
    // and never keep the frame of the previous step.
    if (!el) {
      setTargetRect(null);
      return;
    }

    function measure() {
      if (isCancelled || !el) return;
      const rect = el.getBoundingClientRect();
      setTargetRect((prev) => {
        if (
          !prev ||
          Math.abs(prev.top - rect.top) > 1 ||
          Math.abs(prev.left - rect.left) > 1 ||
          Math.abs(prev.width - rect.width) > 1 ||
          Math.abs(prev.height - rect.height) > 1
        ) {
          return rect;
        }
        return prev;
      });
    }

    if (window.innerWidth < 640) {
      // On mobile: put the target in the upper part and leave the lower part to the bottom sheet
      const elementTop = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, elementTop - 90), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }

    measure();
    // The smooth scroll keeps moving for a moment; the scroll listener below keeps the frame on the target,
    // and these two catch the final position.
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 450);

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
  }, [isOpen, currentStepIndex, currentStep?.targetSelector, lang]);

  // Measure the real height of the card so it is never placed over the highlighted element
  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const el = cardRef.current;
    const update = () => setCardHeight(el.offsetHeight || 300);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, currentStepIndex, lang]);

  // Handle auto-selection of free subject on Step 1 if user is not enrolled
  useEffect(() => {
    if (isOpen && currentStepIndex === 0 && !isEnrolled && onSelectFreeSubject) {
      onSelectFreeSubject();
    }
  }, [isOpen, currentStepIndex, isEnrolled, onSelectFreeSubject]);

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

  // Keyboard: Esc closes, the arrow keys move between steps (mirrored in Arabic)
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const forward = (e.key === "ArrowRight") !== isArabic;
        if (forward) handleNext();
        else handlePrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Put the keyboard focus on the Next button when a step appears
  useEffect(() => {
    if (isOpen) nextRef.current?.focus({ preventScroll: true });
  }, [isOpen, currentStepIndex]);

  if (!isOpen || !currentStep) return null;

  // The lit area around the target
  const pad = isMobile ? 6 : 8;
  const cutoutLeft = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const cutoutTop = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const cutoutRight = targetRect ? Math.min(viewport.w, targetRect.right + pad) : 0;
  const cutoutBottom = targetRect ? Math.min(viewport.h, targetRect.bottom + pad) : 0;
  const cutoutWidth = cutoutRight - cutoutLeft;
  const cutoutHeight = cutoutBottom - cutoutTop;

  // One dim layer with a hole in it (four separate layers left a thin light line between them)
  const dimClip = targetRect
    ? `polygon(0 0, 0 100%, ${cutoutLeft}px 100%, ${cutoutLeft}px ${cutoutTop}px, ${cutoutRight}px ${cutoutTop}px, ${cutoutRight}px ${cutoutBottom}px, ${cutoutLeft}px ${cutoutBottom}px, ${cutoutLeft}px 100%, 100% 100%, 100% 0)`
    : undefined;

  // Card position on desktop
  const cardWidth = Math.min(420, viewport.w - 24);
  const margin = 16;
  const clampTop = (v: number) => Math.max(margin, Math.min(viewport.h - cardHeight - margin, v));
  const clampLeft = (v: number) => Math.max(margin, Math.min(viewport.w - cardWidth - margin, v));
  let desktopCardTop = clampTop((viewport.h - cardHeight) / 2);
  let desktopCardLeft = clampLeft((viewport.w - cardWidth) / 2);

  if (targetRect && !isMobile) {
    const wantSide: "left" | "right" | "bottom" | "top" = isArabic
      ? currentStep.placement === "left"
        ? "right"
        : currentStep.placement
      : currentStep.placement;
    const roomLeft = cutoutLeft - margin;
    const roomRight = viewport.w - cutoutRight - margin;
    const roomBelow = viewport.h - cutoutBottom - margin;
    const roomAbove = cutoutTop - margin;

    const sideTop = clampTop(targetRect.top - 20);
    const alignedLeft = clampLeft(isArabic ? targetRect.right - cardWidth : targetRect.left);

    const placeBelow = () => ({ top: cutoutBottom + margin, left: alignedLeft });
    const placeAbove = () => ({ top: cutoutTop - cardHeight - margin, left: alignedLeft });
    const placeLeft = () => ({ top: sideTop, left: cutoutLeft - cardWidth - margin });
    const placeRight = () => ({ top: sideTop, left: cutoutRight + margin });

    const fitsBelow = roomBelow >= cardHeight;
    const fitsAbove = roomAbove >= cardHeight;
    const fitsLeft = roomLeft >= cardWidth;
    const fitsRight = roomRight >= cardWidth;

    let pos: { top: number; left: number } | null = null;
    const order: Array<"left" | "right" | "bottom" | "top"> =
      wantSide === "left"
        ? ["left", "right", "bottom", "top"]
        : wantSide === "right"
          ? ["right", "left", "bottom", "top"]
          : wantSide === "top"
            ? ["top", "bottom", "right", "left"]
            : ["bottom", "top", "right", "left"];
    for (const side of order) {
      if (side === "left" && fitsLeft) pos = placeLeft();
      else if (side === "right" && fitsRight) pos = placeRight();
      else if (side === "bottom" && fitsBelow) pos = placeBelow();
      else if (side === "top" && fitsAbove) pos = placeAbove();
      if (pos) break;
    }
    if (pos) {
      desktopCardTop = clampTop(pos.top);
      desktopCardLeft = clampLeft(pos.left);
    } else {
      // Nowhere fits without covering the target (a very small window): use the side with more room
      desktopCardTop = clampTop(roomBelow >= roomAbove ? cutoutBottom + margin : cutoutTop - cardHeight - margin);
      desktopCardLeft = alignedLeft;
    }
  }

  const title = isArabic ? currentStep.title_ar : currentStep.title_en;

  return (
    <div
      className="fixed inset-0 z-[200] overflow-hidden"
      dir={isArabic ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Dim and blur everything except the target, which stays sharp and clickable-looking */}
      <div
        onClick={onClose}
        style={{ background: DIM, clipPath: dimClip, WebkitClipPath: dimClip }}
        className="absolute inset-0 cursor-pointer backdrop-blur-[3px]"
      />

      {/* Gold frame around the target */}
      {targetRect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: cutoutTop,
            left: cutoutLeft,
            width: cutoutWidth,
            height: cutoutHeight,
            borderRadius: isMobile ? "12px" : "16px",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            border: "2px solid var(--accent)",
            boxShadow: "0 0 0 4px color-mix(in oklab, var(--accent) 30%, transparent)",
          }}
          className="pointer-events-none z-[202]"
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.id}
          ref={cardRef}
          initial={isMobile ? { opacity: 0, y: 24 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={isMobile ? { opacity: 0, y: 16 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
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
                  maxHeight: "calc(100% - 32px)",
                }
              : {
                  position: "fixed",
                  top: desktopCardTop,
                  left: desktopCardLeft,
                  width: cardWidth,
                  maxHeight: viewport.h - margin * 2,
                }
          }
          className="z-[210] flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          {/* Gold line on top of the card */}
          <div className="h-1 w-full shrink-0 bg-accent" />

          <div className="space-y-3 overflow-y-auto p-4 sm:space-y-4 sm:p-5">
            {/* Header: badge, language switch and skip */}
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  {currentStep.icon}
                </div>
                <span className="truncate rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                  {isArabic ? currentStep.badge_ar : currentStep.badge_en}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLang(isArabic ? "en" : "ar")}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90"
                  title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
                >
                  <Languages size={13} />
                  <span>{isArabic ? "English" : "العربية"}</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={isArabic ? "تخطي الجولة وإنهاؤها" : "Skip and Exit Tour"}
                >
                  <span>{isArabic ? "تخطي" : "Skip"}</span>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Title & description */}
            <div className="space-y-1.5">
              <h4 className="font-display text-base font-bold leading-snug text-foreground sm:text-lg">{title}</h4>
              <p className="whitespace-pre-line text-xs font-medium leading-relaxed text-muted-foreground sm:text-[13px]">
                {isArabic ? currentStep.desc_ar : currentStep.desc_en}
              </p>
            </div>

            {/* Footer: progress and navigation */}
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex items-center gap-1.5" aria-label={`${currentStepIndex + 1} / ${steps.length}`}>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentStepIndex ? "w-5 bg-accent" : "w-1.5 bg-border"
                    }`}
                  />
                ))}
                <span className="ms-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                  {currentStepIndex + 1}/{steps.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    {isArabic ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                    <span>{isArabic ? "السابق" : "Back"}</span>
                  </button>
                )}

                <button
                  ref={nextRef}
                  type="button"
                  onClick={handleNext}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
