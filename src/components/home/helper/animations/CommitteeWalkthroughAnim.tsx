import { motion, AnimatePresence } from "framer-motion";
import { Crown, MousePointer, Star, Award, CheckCircle2 } from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function CommitteeWalkthroughAnim({ currentStep, isArabic }: Props) {
  return (
    <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Top Browser / Window Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/95 border-b border-slate-800 z-20">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-[11px] font-mono text-slate-400">
            {currentStep === 0
              ? "aquaqbank.com/committee"
              : "aquaqbank.com/committee/year-6/cardiology"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold">
          <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {currentStep === 0
              ? isArabic
                ? "1. واجهة اللجنة وسنوات الدراسة (0-6)"
                : "1. Committee Years (0 to 6)"
              : isArabic
              ? "2. أفضل مصادر الدراسة (طلبة 9 و 10)"
              : "2. Best Sources of Study (Scores 9 & 10)"}
          </span>
        </div>
      </div>

      {/* Screen Viewport with Real Screenshots and Precise Overlays */}
      <div className="relative w-full bg-slate-950 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ================= STEP 0: Real Committee Years (0-6) Screenshot ================= */}
          {currentStep === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full aspect-[1024/534]"
            >
              <img
                src="/helper/committee-years.png"
                alt="Committee Home Page - Years 0 to 6"
                className="w-full h-full block"
              />

              {/* Outer Orange Container Box framing Medicine Study Plan + All Courses: Left: 18.36%, Top: 42.70%, Width: 59.28%, Height: 50.00% */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2.5px #f97316, 0 0 20px rgba(249, 115, 22, 0.6)",
                    "0 0 0 3.5px #ea580c, 0 0 30px rgba(234, 88, 12, 0.85)",
                    "0 0 0 2.5px #f97316, 0 0 20px rgba(249, 115, 22, 0.6)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  left: "18.36%",
                  top: "42.70%",
                  width: "59.28%",
                  height: "50.00%",
                  borderRadius: "20px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-orange-500 bg-orange-500/5"
              />

              {/* Pointer cursor clicking Sixth Course card */}
              <motion.div
                animate={{
                  x: [15, 0, 15],
                  y: [15, 0, 15],
                  scale: [1, 0.88, 1],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  left: "31%",
                  top: "85%",
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
                    className="absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 border-orange-400"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ================= STEP 1: Real Best Sources of Study Screenshot ================= */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full aspect-[1024/675]"
            >
              <img
                src="/helper/committee-best-sources.png"
                alt="Sixth Course - Best Sources of Study"
                className="w-full h-full block"
              />

              {/* Exact Highlight for "Best sources of study" Section (all cards enclosed): Left: 9.28%, Top: 6.20%, Width: 77.50%, Height: 51.50% */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2.5px #f97316, 0 0 20px rgba(249, 115, 22, 0.6)",
                    "0 0 0 3.5px #ea580c, 0 0 35px rgba(234, 88, 12, 0.85)",
                    "0 0 0 2.5px #f97316, 0 0 20px rgba(249, 115, 22, 0.6)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  left: "9.28%",
                  top: "6.20%",
                  width: "77.50%",
                  height: "51.50%",
                  borderRadius: "22px",
                }}
                className="absolute pointer-events-none z-20 border-2 border-orange-500 bg-orange-500/5"
              />

              {/* Verified Recommendations Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  right: "2.5%",
                  top: "10%",
                }}
                className="absolute z-30 max-w-[200px] sm:max-w-[230px] p-2.5 rounded-2xl bg-slate-950/95 border border-amber-500/60 backdrop-blur-md text-white shadow-2xl pointer-events-none"
              >
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-black mb-0.5">
                  <Crown size={14} className="text-amber-400" />
                  <span>{isArabic ? "توصيات الأوائل" : "Senior Top Picks"}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 mb-0.5">
                  <Star size={11} className="fill-emerald-400 text-emerald-400" />
                  <span>{isArabic ? "الحاصلين على درجات 9 و 10" : "Students scoring 9 & 10"}</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-tight">
                  {isArabic
                    ? "أهم الملخصات والملاحظات المعتمدة للسنة السادسة."
                    : "Curated high-yield notes and summaries for 6th course."}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/95 border-t border-slate-800 text-[11px] text-slate-400 z-20">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-ping" />
          {isArabic
            ? `الخطوة ${currentStep + 1} من 2: ${
                currentStep === 0
                  ? "تغطية السنوات من 0 إلى 6 واختيار السنة السادسة"
                  : "قسم أفضل مصادر الدراسة وتوصيات المتفوقين"
              }`
            : `Step ${currentStep + 1} of 2: ${
                currentStep === 0
                  ? "Courses 0 to 6 & Sixth Course Selection"
                  : "Best Sources Section & Top Student Recommendations"
              }`}
        </span>
        <div className="flex gap-1.5">
          {[0, 1].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep === step ? "w-6 bg-purple-400" : "w-2 bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
