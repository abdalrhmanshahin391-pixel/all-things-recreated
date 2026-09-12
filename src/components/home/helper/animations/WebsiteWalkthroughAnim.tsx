import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MousePointer, CheckCircle2 } from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function WebsiteWalkthroughAnim({ currentStep, isArabic }: Props) {
  // In Step 2 (the 3 cards), cycle or toggle between Courses -> Resources -> Lectures
  const [activeCard, setActiveCard] = useState<"courses" | "resources" | "lectures">("courses");

  useEffect(() => {
    if (currentStep !== 2) return;
    const interval = setInterval(() => {
      setActiveCard((prev) => {
        if (prev === "courses") return "resources";
        if (prev === "resources") return "lectures";
        return "courses";
      });
    }, 3200);
    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Top Browser URL Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/95 border-b border-slate-800 z-20">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-[11px] font-mono text-slate-400">
            {currentStep === 0
              ? "aquaqbank.com"
              : currentStep === 1
              ? "aquaqbank.com/universities"
              : "aquaqbank.com/universities/ysmu"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
            {currentStep === 0
              ? isArabic
                ? "1. الصفحة الرئيسية: زر UNIVERSITIES"
                : "1. Home Page: UNIVERSITIES Button"
              : currentStep === 1
              ? isArabic
                ? "2. اختيار جامعة YSMU"
                : "2. Select YSMU"
              : isArabic
              ? "3. الأقسام الثلاثة (Courses, Resources, Lectures)"
              : "3. The 3 Core Sections"}
          </span>
        </div>
      </div>

      {/* STEP 2 SPECIFIC: Sleek Control Bar above the image viewport so it NEVER obstructs the screenshot */}
      {currentStep === 2 && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 z-20">
          <div className="flex gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveCard("courses")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeCard === "courses"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isArabic ? "1. الكورسات (Courses)" : "1. Courses"}
            </button>
            <button
              type="button"
              onClick={() => setActiveCard("resources")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeCard === "resources"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isArabic ? "2. المصادر (Resources)" : "2. Resources"}
            </button>
            <button
              type="button"
              onClick={() => setActiveCard("lectures")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeCard === "lectures"
                  ? "bg-cyan-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isArabic ? "3. المحاضرات (Lectures)" : "3. Lectures"}
            </button>
          </div>

          <div className="text-xs text-center sm:text-end text-slate-300">
            {activeCard === "courses" && (
              <span className="font-semibold text-amber-400">
                {isArabic
                  ? "الكورسات: بنك الأسئلة لكل مادة (أسئلة واختبارات)"
                  : "Courses: Question bank for each material"}
              </span>
            )}
            {activeCard === "resources" && (
              <span className="font-semibold text-amber-400">
                {isArabic
                  ? "المصادر: أرشيف لجنة الطب والجراحة للكتب والملخصات المعتمدة"
                  : "Resources: Committee archives for medical books & approved summaries"}
              </span>
            )}
            {activeCard === "lectures" && (
              <span className="font-semibold text-cyan-400">
                {isArabic
                  ? "المحاضرات: فيديوهات وملفات PDF لشرح المواد المعقدة"
                  : "Lectures: Video & PDF explanations for complex subjects"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Screen Viewport with Exact Aspect Ratio Matching and Precise Coordinate Overlays */}
      <div className="relative w-full bg-slate-950 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ================= STEP 0: Exact Home Page ================= */}
          {currentStep === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full aspect-[1024/591]"
            >
              <img
                src="/helper/step1-universities.png"
                alt="AquaQBank Home Screen"
                className="w-full h-full block"
              />

              {/* Exact Bounding Box for UNIVERSITIES button: Left: 40.43%, Top: 78.85%, Width: 20.02%, Height: 6.26% */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2px #38bdf8, 0 0 15px rgba(56, 189, 248, 0.6)",
                    "0 0 0 3px #0284c7, 0 0 25px rgba(2, 132, 199, 0.9)",
                    "0 0 0 2px #38bdf8, 0 0 15px rgba(56, 189, 248, 0.6)",
                  ],
                }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{
                  left: "40.43%",
                  top: "78.85%",
                  width: "20.02%",
                  height: "6.26%",
                  borderRadius: "10px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-cyan-400 bg-cyan-400/10"
              />

              {/* Pointer cursor smoothly moving to the button center (X: 50.43%, Y: 81.95%) */}
              <motion.div
                animate={{
                  x: [15, 0, 15],
                  y: [15, 0, 15],
                  scale: [1, 0.88, 1],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  left: "50.43%",
                  top: "81.95%",
                }}
                className="absolute z-30 pointer-events-none"
              >
                <div className="relative">
                  <MousePointer
                    size={24}
                    className="text-slate-950 fill-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  />
                  {/* Click ripple animation */}
                  <motion.span
                    animate={{ scale: [0.5, 2.2], opacity: [1, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 border-cyan-300"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ================= STEP 1: Exact Pick Your University & YSMU Card ================= */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full aspect-[1024/584]"
            >
              <img
                src="/helper/step2-ysmu.png"
                alt="Pick Your University - YSMU"
                className="w-full h-full block"
              />

              {/* Exact Bounding Box for YSMU Card: Left: 13.87%, Top: 52.57%, Width: 21.29%, Height: 45.03% */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2px #f97316, 0 0 15px rgba(249, 115, 22, 0.6)",
                    "0 0 0 3.5px #ea580c, 0 0 30px rgba(234, 88, 12, 0.85)",
                    "0 0 0 2px #f97316, 0 0 15px rgba(249, 115, 22, 0.6)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  left: "13.87%",
                  top: "52.57%",
                  width: "21.29%",
                  height: "45.03%",
                  borderRadius: "24px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-orange-500 bg-orange-500/10"
              />

              {/* Pointer cursor clicking inside YSMU Card */}
              <motion.div
                animate={{
                  x: [15, 0, 15],
                  y: [15, 0, 15],
                  scale: [1, 0.88, 1],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  left: "24.5%",
                  top: "75%",
                }}
                className="absolute z-30 pointer-events-none"
              >
                <div className="relative">
                  <MousePointer
                    size={24}
                    className="text-slate-950 fill-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  />
                  <motion.span
                    animate={{ scale: [0.5, 2.2], opacity: [1, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 border-amber-400"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ================= STEP 2: Exact YSMU Hub (Courses, Lectures, Resources) ================= */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full aspect-[1024/636]"
            >
              <img
                src="/helper/step3-hub.png"
                alt="YSMU Hub - Courses, Lectures, Resources"
                className="w-full h-full block"
              />

              {/* Exact Card 1: Courses (Left: 5.86%, Top: 66.51%, Width: 24.8%, Height: 25.0%) */}
              <motion.div
                animate={{
                  opacity: activeCard === "courses" ? 1 : 0.25,
                  boxShadow:
                    activeCard === "courses"
                      ? "0 0 0 3px #f97316, 0 0 30px rgba(249, 115, 22, 0.9)"
                      : "none",
                }}
                transition={{ duration: 0.3 }}
                style={{
                  left: "5.86%",
                  top: "66.51%",
                  width: "24.8%",
                  height: "25.0%",
                  borderRadius: "20px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-amber-500 bg-amber-500/10"
              />

              {/* Exact Card 2: Lectures (Left: 32.13%, Top: 66.51%, Width: 24.8%, Height: 25.0%) */}
              <motion.div
                animate={{
                  opacity: activeCard === "lectures" ? 1 : 0.25,
                  boxShadow:
                    activeCard === "lectures"
                      ? "0 0 0 3px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.9)"
                      : "none",
                }}
                transition={{ duration: 0.3 }}
                style={{
                  left: "32.13%",
                  top: "66.51%",
                  width: "24.8%",
                  height: "25.0%",
                  borderRadius: "20px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-cyan-400 bg-cyan-400/10"
              />

              {/* Exact Card 3: Resources (Left: 58.40%, Top: 66.51%, Width: 24.8%, Height: 25.0%) */}
              <motion.div
                animate={{
                  opacity: activeCard === "resources" ? 1 : 0.25,
                  boxShadow:
                    activeCard === "resources"
                      ? "0 0 0 3px #eab308, 0 0 30px rgba(234, 179, 8, 0.9)"
                      : "none",
                }}
                transition={{ duration: 0.3 }}
                style={{
                  left: "58.40%",
                  top: "66.51%",
                  width: "24.8%",
                  height: "25.0%",
                  borderRadius: "20px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-yellow-400 bg-yellow-400/10"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/95 border-t border-slate-800 text-[11px] text-slate-400 z-20">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          {isArabic
            ? `الخطوة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "الضغط على زر UNIVERSITIES"
                  : currentStep === 1
                  ? "اختيار جامعة YSMU"
                  : "الكورسات، المصادر، والمحاضرات"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Click UNIVERSITIES Button"
                  : currentStep === 1
                  ? "Select YSMU Card"
                  : "Courses, Resources & Lectures"
              }`}
        </span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep === step ? "w-6 bg-cyan-400" : "w-2 bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
