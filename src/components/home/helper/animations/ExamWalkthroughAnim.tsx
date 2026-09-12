import { motion } from "framer-motion";
import { Timer, Flag, CheckSquare, Award, ArrowUpRight, BarChart2 } from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function ExamWalkthroughAnim({ currentStep, isArabic }: Props) {
  return (
    <div className="relative w-full h-[340px] sm:h-[380px] bg-slate-950 rounded-2xl border border-slate-800 p-4 sm:p-6 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Ambient glow */}
      <div className="absolute -top-10 right-0 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 left-0 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar with ticking timer */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-bold text-slate-200">
            {isArabic ? "امتحان تجريبي موقوت" : "Timed Mock Exam"}
          </span>
        </div>

        {/* Animated Timer Pill */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold"
        >
          <Timer size={14} className="text-amber-400" />
          <span>{currentStep === 2 ? "00:00" : "44:18"}</span>
        </motion.div>
      </div>

      {/* Main Simulation View */}
      <div className="relative flex-1 flex items-center justify-center py-2 z-10 w-full max-w-md mx-auto">
        {/* Step 0 & 1: Exam Cockpit & Question Grid */}
        {currentStep < 2 && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{isArabic ? "السؤال 14 من 50" : "Question 14 of 50"}</span>
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Flag size={13} />
                <span>{isArabic ? "تعليم للمراجعة" : "Flag for review"}</span>
              </div>
            </div>

            {/* Question Quick Grid */}
            <div className="grid grid-cols-10 gap-1.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              {Array.from({ length: 20 }).map((_, i) => {
                const isAnswered = i < 13;
                const isCurrent = i === 13;
                const isFlagged = i === 4 || i === 9;

                return (
                  <motion.div
                    key={i}
                    animate={{ scale: isCurrent ? [1, 1.15, 1] : 1 }}
                    transition={{ duration: 1.5, repeat: isCurrent ? Infinity : 0 }}
                    className={`h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                      isCurrent
                        ? "bg-amber-500 text-slate-950 ring-2 ring-amber-400"
                        : isFlagged
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : isAnswered
                        ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </motion.div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-300 text-center">
              {isArabic
                ? "تنقل بمرونة بين الأسئلة، وضع علامات على ما ترغب بمراجعته قبل تأكيد التسليم."
                : "Jump seamlessly between questions and flag doubts before final submission."}
            </p>
          </div>
        )}

        {/* Step 2: Instant Score & Diagnosis */}
        {currentStep === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full flex flex-col items-center"
          >
            <div className="relative w-24 h-24 rounded-full border-4 border-emerald-500 flex flex-col items-center justify-center bg-emerald-950/30 shadow-xl shadow-emerald-500/10 mb-2">
              <span className="text-2xl font-black text-emerald-400">96%</span>
              <span className="text-[10px] font-bold uppercase text-emerald-300">
                {isArabic ? "امتياز" : "Distinction"}
              </span>
            </div>

            <h5 className="font-bold text-white text-sm">
              {isArabic ? "تم إنهاء الامتحان بنجاح!" : "Exam Completed Successfully!"}
            </h5>

            <div className="grid grid-cols-3 gap-2 w-full mt-2.5 text-center">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الصحيحة" : "Correct"}</span>
                <span className="text-xs font-bold text-emerald-400">48 / 50</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الوقت المستغرق" : "Time Spent"}</span>
                <span className="text-xs font-bold text-slate-200">32m 14s</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الترتيب" : "Rank"}</span>
                <span className="text-xs font-bold text-amber-400">Top 5%</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom Step Indicator */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          {isArabic
            ? `المرحلة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "بدء العداد الموقوت"
                  : currentStep === 1
                  ? "التنقل بين الأسئلة"
                  : "تقرير الدرجات والتحليل"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Live Timer"
                  : currentStep === 1
                  ? "Question Navigator"
                  : "Score Report & Diagnostics"
              }`}
        </span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep === step ? "w-6 bg-amber-400" : "w-2 bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
