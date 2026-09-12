import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MousePointer,
  Sparkles,
  BookOpen,
  Library,
  Video,
  CheckCircle2,
  Maximize2,
} from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function WebsiteWalkthroughAnim({ currentStep, isArabic }: Props) {
  // In Step 2 (the 3 cards), rotate through Courses -> Resources -> Lectures
  const [activeCard, setActiveCard] = useState<"courses" | "resources" | "lectures">("courses");

  useEffect(() => {
    if (currentStep !== 2) return;
    const interval = setInterval(() => {
      setActiveCard((prev) => {
        if (prev === "courses") return "resources";
        if (prev === "resources") return "lectures";
        return "courses";
      });
    }, 2800);
    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <div className="relative w-full h-[350px] sm:h-[400px] md:h-[440px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Top Browser Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800 z-20">
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

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
          <span className="px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
            {currentStep === 0
              ? isArabic
                ? "1. الصفحة الرئيسية"
                : "1. Home Page"
              : currentStep === 1
              ? isArabic
                ? "2. اختيار الجامعة (YSMU)"
                : "2. Choose YSMU"
              : isArabic
              ? "3. أقسام YSMU الثلاثة"
              : "3. YSMU Core Sections"}
          </span>
        </div>
      </div>

      {/* Screen Viewport with Ken-Burns / Crossfade Animation */}
      <div className="relative flex-1 w-full overflow-hidden bg-slate-950">
        <AnimatePresence mode="wait">
          {/* STEP 0: Actual Home Page Screenshot & Animated Click on UNIVERSITIES button */}
          {currentStep === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="relative w-full h-full"
            >
              <img
                src="/helper/step1-universities.png"
                alt="AquaQBank Home Screen"
                className="w-full h-full object-cover object-center"
              />

              {/* Dark gradient overlay to enhance highlight visibility */}
              <div className="absolute inset-0 bg-black/25 pointer-events-none" />

              {/* Animated Target Box over the UNIVERSITIES button */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: 1,
                  scale: [1, 1.05, 1],
                  borderColor: ["#38bdf8", "#0284c7", "#38bdf8"],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute left-1/2 -translate-x-1/2 bottom-[14%] sm:bottom-[16%] w-[160px] sm:w-[220px] h-[38px] sm:h-[50px] rounded-xl border-2 border-cyan-400 bg-cyan-400/20 shadow-[0_0_25px_rgba(14,165,233,0.6)] flex items-center justify-center pointer-events-none"
              >
                <span className="sr-only">Universities Button Target</span>
              </motion.div>

              {/* Animated Cursor clicking the button */}
              <motion.div
                animate={{
                  x: [40, 0, 40],
                  y: [40, 0, 40],
                  scale: [1, 0.85, 1],
                }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-1/2 translate-x-8 sm:translate-x-14 bottom-[11%] sm:bottom-[13%] z-30 pointer-events-none"
              >
                <div className="relative">
                  <MousePointer
                    size={28}
                    className="text-slate-950 fill-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  />
                  {/* Click ripple */}
                  <motion.span
                    animate={{ scale: [0.5, 2], opacity: [1, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute -top-1 -left-1 w-6 h-6 rounded-full border-2 border-cyan-300"
                  />
                </div>
              </motion.div>

              {/* Explanatory Floating Badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-400/50 backdrop-blur-md text-white text-xs font-bold shadow-xl flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>
                  {isArabic
                    ? "الخطوة الأولى: اضغط على زر الجامعات (UNIVERSITIES)"
                    : "Step 1: Click the 'UNIVERSITIES' button"}
                </span>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 1: Actual Pick Your University Screenshot & Animated Selection of YSMU */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="relative w-full h-full"
            >
              <img
                src="/helper/step2-ysmu.png"
                alt="Pick Your University - YSMU"
                className="w-full h-full object-cover object-left-top sm:object-center"
              />

              <div className="absolute inset-0 bg-black/20 pointer-events-none" />

              {/* Glowing highlight around the YSMU Card */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2px #38bdf8, 0 0 25px rgba(14, 165, 233, 0.4)",
                    "0 0 0 3px #f59e0b, 0 0 35px rgba(245, 158, 11, 0.6)",
                    "0 0 0 2px #38bdf8, 0 0 25px rgba(14, 165, 233, 0.4)",
                  ],
                }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="absolute left-[3%] sm:left-[11%] bottom-[4%] sm:bottom-[8%] w-[210px] sm:w-[250px] md:w-[280px] h-[230px] sm:h-[280px] rounded-3xl pointer-events-none"
              />

              {/* Animated Clicking Hand / Pointer */}
              <motion.div
                animate={{
                  x: [25, 0, 25],
                  y: [25, 0, 25],
                  scale: [1, 0.88, 1],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-[20%] sm:left-[22%] bottom-[20%] z-30 pointer-events-none"
              >
                <div className="relative">
                  <MousePointer
                    size={28}
                    className="text-slate-950 fill-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  />
                  <motion.span
                    animate={{ scale: [0.5, 2], opacity: [1, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute -top-1 -left-1 w-6 h-6 rounded-full border-2 border-amber-400"
                  />
                </div>
              </motion.div>

              {/* Step 2 Callout */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-amber-400/50 backdrop-blur-md text-white text-xs font-bold shadow-xl flex items-center gap-2"
              >
                <CheckCircle2 size={14} className="text-amber-400" />
                <span>
                  {isArabic
                    ? "الخطوة الثانية: اختيار جامعة ولاية يريفان الطبية (YSMU)"
                    : "Step 2: Choose Yerevan State Medical University (YSMU)"}
                </span>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 2: Actual YSMU Hub Screenshot (Courses, Lectures, Resources) */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="relative w-full h-full"
            >
              <img
                src="/helper/step3-hub.png"
                alt="YSMU Hub - Courses, Lectures, Resources"
                className="w-full h-full object-cover object-bottom"
              />

              <div className="absolute inset-0 bg-black/20 pointer-events-none" />

              {/* Dynamic Spotlights over the 3 Cards */}
              {/* Card 1: Courses (Left) */}
              <motion.div
                animate={{
                  opacity: activeCard === "courses" ? 1 : 0.4,
                  scale: activeCard === "courses" ? 1.03 : 1,
                  boxShadow:
                    activeCard === "courses"
                      ? "0 0 0 3px #f97316, 0 0 30px rgba(249, 115, 22, 0.7)"
                      : "none",
                }}
                className="absolute left-[4%] sm:left-[5%] bottom-[4%] sm:bottom-[7%] w-[28%] h-[40%] sm:h-[45%] rounded-2xl pointer-events-none"
              />

              {/* Card 2: Lectures (Center) */}
              <motion.div
                animate={{
                  opacity: activeCard === "lectures" ? 1 : 0.4,
                  scale: activeCard === "lectures" ? 1.03 : 1,
                  boxShadow:
                    activeCard === "lectures"
                      ? "0 0 0 3px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.7)"
                      : "none",
                }}
                className="absolute left-[36%] bottom-[4%] sm:bottom-[7%] w-[28%] h-[40%] sm:h-[45%] rounded-2xl pointer-events-none"
              />

              {/* Card 3: Resources (Right) */}
              <motion.div
                animate={{
                  opacity: activeCard === "resources" ? 1 : 0.4,
                  scale: activeCard === "resources" ? 1.03 : 1,
                  boxShadow:
                    activeCard === "resources"
                      ? "0 0 0 3px #eab308, 0 0 30px rgba(234, 179, 8, 0.7)"
                      : "none",
                }}
                className="absolute right-[4%] sm:right-[5%] bottom-[4%] sm:bottom-[7%] w-[28%] h-[40%] sm:h-[45%] rounded-2xl pointer-events-none"
              />

              {/* Active Explanation Banner overlay */}
              <div className="absolute top-3 left-3 right-3 z-30 flex flex-col items-center">
                <div className="flex gap-1.5 mb-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setActiveCard("courses")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      activeCard === "lectures"
                        ? "bg-cyan-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {isArabic ? "3. المحاضرات (Lectures)" : "3. Lectures"}
                  </button>
                </div>

                {/* Text card for the active selection */}
                <motion.div
                  key={activeCard}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-3.5 py-2 rounded-xl bg-slate-950/90 border border-slate-700/80 backdrop-blur-md text-white text-xs max-w-lg text-center shadow-2xl"
                >
                  {activeCard === "courses" && (
                    <div>
                      <span className="font-black text-amber-400 block mb-0.5">
                        {isArabic
                          ? "الكورسات (Courses) = بنك الأسئلة لكل مادة"
                          : "Courses = Question Bank for each subject"}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {isArabic
                          ? "بنوك أسئلة متكاملة مقسمة حسب السنوات والمواد مع تدريب وامتحانات فورية."
                          : "Subject-by-subject question banks organized year by year with instant practice."}
                      </span>
                    </div>
                  )}

                  {activeCard === "resources" && (
                    <div>
                      <span className="font-black text-amber-400 block mb-0.5">
                        {isArabic
                          ? "المصادر (Resources) = لجنة الطب والجراحة"
                          : "Resources = Committee (لجنة الطب والجراحة)"}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {isArabic
                          ? "أرشيف مجاني يشمل الكتب، أسئلة السنوات السابقة، ملخصات الدفعات لجميع السنوات 0-6."
                          : "Free archives: past papers, medical textbooks & summaries across all 7 years."}
                      </span>
                    </div>
                  )}

                  {activeCard === "lectures" && (
                    <div>
                      <span className="font-black text-cyan-400 block mb-0.5">
                        {isArabic
                          ? "المحاضرات (Lectures) = فيديو وملفات PDF"
                          : "Lectures = Videos & PDF Notes"}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {isArabic
                          ? "محاضرات مرئية وملفات ملخصة للمواد الصعبة لتسهيل الفهم والمذاكرة."
                          : "Video explanations and summarized PDFs for difficult subjects to make studying easier."}
                      </span>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-t border-slate-800 text-[11px] text-slate-400 z-20">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          {isArabic
            ? `الخطوة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "زر الجامعات (UNIVERSITIES)"
                  : currentStep === 1
                  ? "اختيار YSMU"
                  : "الكورسات واللجنة والمحاضرات"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Click UNIVERSITIES"
                  : currentStep === 1
                  ? "Select YSMU"
                  : "Courses, Committee & Lectures"
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
