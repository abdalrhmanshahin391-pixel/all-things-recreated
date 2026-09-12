import { motion } from "framer-motion";
import {
  GraduationCap,
  Building2,
  BookOpen,
  Library,
  Video,
  MousePointer,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function WebsiteWalkthroughAnim({ currentStep, isArabic }: Props) {
  return (
    <div className="relative w-full h-[340px] sm:h-[380px] bg-slate-950 rounded-2xl border border-slate-800 p-4 sm:p-6 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Decorative ambient background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Simulated Browser Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-xs font-mono text-slate-400">aquaqbank.com</span>
        </div>

        {/* Navigation bar simulation */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="px-2.5 py-1 rounded-md bg-slate-800/60 text-slate-300">
            {isArabic ? "الرئيسية" : "Home"}
          </div>

          {/* Animated Universities Button */}
          <motion.div
            animate={{
              scale: currentStep === 0 ? [1, 1.08, 1] : 1,
              backgroundColor:
                currentStep === 0 ? "rgba(14, 165, 233, 0.3)" : "rgba(15, 23, 42, 0.6)",
              borderColor: currentStep === 0 ? "#38bdf8" : "rgba(51, 65, 85, 0.6)",
            }}
            transition={{ duration: 1.5, repeat: currentStep === 0 ? Infinity : 0 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-cyan-400 font-bold shadow-lg"
          >
            <GraduationCap size={14} />
            <span>{isArabic ? "الجامعات" : "Universities"}</span>
          </motion.div>
        </div>
      </div>

      {/* Main Canvas Area according to Current Step */}
      <div className="relative flex-1 flex items-center justify-center py-4 z-10">
        {/* Step 0: Pointer Clicking Universities */}
        {currentStep === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <div className="relative mb-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-xl"
              >
                <GraduationCap size={32} />
              </motion.div>
              {/* Simulated Clicking Finger / Cursor */}
              <motion.div
                animate={{
                  x: [10, -5, 10],
                  y: [10, -5, 10],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-2 -right-2 text-white drop-shadow-lg"
              >
                <MousePointer size={24} className="fill-white text-slate-900" />
              </motion.div>
            </div>
            <h4 className="text-base font-bold text-white mb-1">
              {isArabic ? "اضغط على زر الجامعات" : "Click 'Universities'"}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isArabic
                ? "ابدأ رحلتك الدراسية باختيار جامعتك من القائمة للوصول إلى مناهجك المعتمدة"
                : "Start by clicking the Universities button from the top navigation to view medical schools."}
            </p>
          </motion.div>
        )}

        {/* Step 1: Choosing YSMU */}
        {currentStep === 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md flex flex-col items-center"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
              <Building2 size={14} />
              <span>{isArabic ? "اختيار الجامعة" : "Select University"}</span>
            </div>

            <motion.div
              animate={{
                borderColor: ["#0284c7", "#f59e0b", "#0284c7"],
                boxShadow: [
                  "0 0 15px rgba(14, 165, 233, 0.3)",
                  "0 0 25px rgba(245, 158, 11, 0.4)",
                  "0 0 15px rgba(14, 165, 233, 0.3)",
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="w-full bg-slate-900/90 border-2 rounded-2xl p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-800 flex items-center justify-center font-black text-white text-lg shadow">
                  YS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-white text-base">YSMU</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                      {isArabic ? "الجامعة النشطة" : "Active Portal"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isArabic
                      ? "جامعة ولاية يريفان الطبية (Yerevan State Medical University)"
                      : "Yerevan State Medical University, Armenia"}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 size={18} />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-3 flex items-center gap-2 text-xs text-emerald-400 font-medium"
            >
              <Sparkles size={14} />
              <span>{isArabic ? "تم الدخول إلى بوابة YSMU الطبية" : "Entered YSMU Medical Portal"}</span>
            </motion.div>
          </motion.div>
        )}

        {/* Step 2: The 3 Main Pillars (Courses, Resources/Committee, Lectures) */}
        {currentStep === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3"
          >
            {/* Pillar 1: Courses */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-3 flex flex-col items-center text-center shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
                <BookOpen size={20} />
              </div>
              <h5 className="font-bold text-sm text-white">
                {isArabic ? "الكورسات (Courses)" : "Courses"}
              </h5>
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-1.5">
                {isArabic ? "بنك الأسئلة" : "Question Bank"}
              </span>
              <p className="text-[11px] text-slate-300 leading-tight">
                {isArabic
                  ? "بنك الأسئلة الشامل لكل مادة مع تصحيح فوري وامتحانات تجريبية."
                  : "Question bank for each subject with study & test modes."}
              </p>
            </motion.div>

            {/* Pillar 2: Resources (Committee) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-3 flex flex-col items-center text-center shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
                <Library size={20} />
              </div>
              <h5 className="font-bold text-sm text-white">
                {isArabic ? "المصادر (Resources)" : "Resources"}
              </h5>
              <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5">
                {isArabic ? "لجنة الطب والجراحة" : "Committee Portal"}
              </span>
              <p className="text-[11px] text-slate-300 leading-tight">
                {isArabic
                  ? "أرشيف لجنة الطب والجراحة: ملخصات، كتب، وأسئلة السنوات السابقة."
                  : "Committee (لجنة الطب والجراحة) archives: summaries, books & past papers."}
              </p>
            </motion.div>

            {/* Pillar 3: Lectures */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3 flex flex-col items-center text-center shadow-lg"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-2">
                <Video size={20} />
              </div>
              <h5 className="font-bold text-sm text-white">
                {isArabic ? "المحاضرات (Lectures)" : "Lectures"}
              </h5>
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                {isArabic ? "فيديو وملفات شرح" : "Video & PDF Notes"}
              </span>
              <p className="text-[11px] text-slate-300 leading-tight">
                {isArabic
                  ? "فيديوهات وملفات PDF لشرح المواد المعقدة وتسهيل فهمها."
                  : "Video & PDF explanations that make difficult subjects easier to study."}
              </p>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          {isArabic
            ? `المرحلة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "زر الجامعات"
                  : currentStep === 1
                  ? "اختيار YSMU"
                  : "الكورسات واللجنة والمحاضرات"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Open Universities"
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
