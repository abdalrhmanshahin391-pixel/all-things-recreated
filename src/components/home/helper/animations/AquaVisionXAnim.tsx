import { motion } from "framer-motion";
import { Sparkles, Scan, Cpu, CheckCircle2, FileSearch, ArrowRight } from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function AquaVisionXAnim({ currentStep, isArabic }: Props) {
  return (
    <div className="relative w-full h-[340px] sm:h-[380px] bg-slate-950 rounded-2xl border border-slate-800 p-4 sm:p-6 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Ambient lighting */}
      <div className="absolute top-0 right-10 w-60 h-60 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-60 h-60 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Sparkles size={15} />
          </div>
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>AquaVisionX</span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
              AI Engine
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-cyan-400 font-mono">
          <Cpu size={14} className="animate-spin text-cyan-400" />
          <span>{currentStep === 0 ? "SCANNING" : currentStep === 1 ? "SOLVING" : "READY"}</span>
        </div>
      </div>

      {/* Simulation Stage */}
      <div className="relative flex-1 flex items-center justify-center py-2 z-10 w-full max-w-md mx-auto">
        {/* Step 0: PDF Scanner & Laser Beam */}
        {currentStep === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full relative bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-hidden shadow-xl"
          >
            {/* Animated Laser Scanning Line */}
            <motion.div
              animate={{ y: [0, 140, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] z-20"
            />

            {/* Simulated Printed Exam Paper */}
            <div className="space-y-2 opacity-80">
              <div className="h-3 w-3/4 bg-slate-700/80 rounded" />
              <div className="h-2 w-full bg-slate-800 rounded" />
              <div className="h-2 w-5/6 bg-slate-800 rounded" />

              <div className="pt-2 grid grid-cols-2 gap-2">
                <div className="h-5 rounded bg-slate-800/70 border border-cyan-500/30 flex items-center px-2 text-[10px] text-cyan-300 font-mono">
                  [1] True statement
                </div>
                <div className="h-5 rounded bg-slate-800/70 border border-cyan-500/30 flex items-center px-2 text-[10px] text-cyan-300 font-mono">
                  [2] False statement
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-cyan-400 font-bold">
              <Scan size={14} />
              <span>
                {isArabic
                  ? "جاري مسح ورقة الامتحان واستخراج الأسئلة..."
                  : "Scanning exam PDF & extracting questions..."}
              </span>
            </div>
          </motion.div>
        )}

        {/* Step 1: AI Combination Logic Solving */}
        {currentStep === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl p-3.5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileSearch size={14} className="text-cyan-400" />
                <span>{isArabic ? "حل الأسئلة التركيبية (Combinations)" : "Solving Combination Sets"}</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                100% Match
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-300">Statement A, C, and D are valid</span>
                <span className="text-[10px] font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/20">
                  Verified
                </span>
              </div>
              <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 font-bold flex items-center justify-between">
                <span>{isArabic ? "الخيار الصحيح: (A, C, D)" : "Selected Choice: (A, C, D)"}</span>
                <CheckCircle2 size={16} className="text-cyan-400" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: Instant Integration into Question Bank */}
        {currentStep === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full text-center flex flex-col items-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl mb-3">
              <CheckCircle2 size={30} />
            </div>

            <h5 className="font-bold text-white text-sm mb-1">
              {isArabic ? "تم التحقق والإضافة إلى بنك الأسئلة!" : "Verified & Added to Question Bank!"}
            </h5>
            <p className="text-xs text-slate-300 max-w-sm">
              {isArabic
                ? "أصبحت الأسئلة المستخرجة متاحة فوراً للطلاب للتدريب عليها مع شروحاتها ومراجعها."
                : "The scanned questions are now live in your course for instant practice and revision."}
            </p>
          </motion.div>
        )}
      </div>

      {/* Bottom Step Indicator */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          {isArabic
            ? `المرحلة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "المسح الضوئي"
                  : currentStep === 1
                  ? "حل التركيبات المعقدة"
                  : "الإضافة إلى بنك الأسئلة"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Document Scan"
                  : currentStep === 1
                  ? "Combination Solver"
                  : "Live in Question Bank"
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
