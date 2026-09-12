import { motion } from "framer-motion";
import {
  Crown,
  BookOpen,
  FileCheck,
  Star,
  Award,
  Layers,
  Sparkles,
  Stethoscope,
  ChevronRight,
} from "lucide-react";

interface Props {
  currentStep: number;
  isArabic: boolean;
}

export function CommitteeWalkthroughAnim({ currentStep, isArabic }: Props) {
  const courses = [
    { num: "0", title: isArabic ? "تحضيري" : "Foundation" },
    { num: "1", title: isArabic ? "سنة 1" : "Year 1" },
    { num: "2", title: isArabic ? "سنة 2" : "Year 2" },
    { num: "3", title: isArabic ? "سنة 3" : "Year 3" },
    { num: "4", title: isArabic ? "سنة 4" : "Year 4" },
    { num: "5", title: isArabic ? "سنة 5" : "Year 5" },
    { num: "6", title: isArabic ? "سنة 6 (تخرج)" : "Year 6 (Final)", highlight: true },
  ];

  return (
    <div className="relative w-full h-[340px] sm:h-[380px] bg-slate-950 rounded-2xl border border-slate-800 p-4 sm:p-6 overflow-hidden flex flex-col justify-between select-none shadow-2xl text-slate-100">
      {/* Ambient background lighting */}
      <div className="absolute -top-10 -left-10 w-60 h-60 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Crown size={15} />
          </div>
          <div>
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{isArabic ? "لجنة الطب والجراحة" : "Medical Committee Archive"}</span>
              <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-semibold">
                YSMU
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
          <Award size={12} />
          <span>{isArabic ? "أفضل المصادر" : "Best Sources"}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 flex items-center justify-center py-2 z-10">
        {/* Step 0: Course 0 to Course 6 Grid & Coverage */}
        {currentStep === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col items-center"
          >
            <div className="text-center mb-3">
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                {isArabic ? "أرشيف السنوات الأكاديمية" : "Complete Academic Years"}
              </span>
              <h4 className="text-sm sm:text-base font-black text-white mt-0.5">
                {isArabic
                  ? "جميع المواد والملخصات من السنة 0 إلى السنة 6"
                  : "Every Course Covered: Course 0 to Course 6"}
              </h4>
            </div>

            {/* Courses Timeline Pills */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2 w-full max-w-lg mb-3">
              {courses.map((c) => (
                <motion.div
                  key={c.num}
                  whileHover={{ scale: 1.05 }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                    c.highlight
                      ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/10"
                      : "bg-slate-900/80 border-slate-800 text-slate-300"
                  }`}
                >
                  <span className="text-sm font-black">Course {c.num}</span>
                  <span className="text-[10px] font-medium opacity-80 truncate max-w-full">
                    {c.title}
                  </span>
                </motion.div>
              ))}
            </div>

            <p className="text-[11px] sm:text-xs text-slate-300 text-center max-w-md">
              {isArabic
                ? "تجد في كل سنة جميع ملخصات الدفعات، المراجع المعتمدة، وأسئلة الامتحانات السابقة."
                : "Inside each year, find lecture summaries, approved textbooks, and past exam questions."}
            </p>
          </motion.div>
        )}

        {/* Step 1: Course 6 Material Example */}
        {currentStep === 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Stethoscope size={14} />
                <span>{isArabic ? "مثال: مادة من السنة السادسة" : "Example: Course 6 Material"}</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Course 6 · Final Year
              </span>
            </div>

            {/* Subject Card Simulation */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
                <div>
                  <h5 className="font-bold text-white text-sm">
                    {isArabic ? "الباطنية السريرية (Internal Medicine)" : "Internal Medicine - Clinical"}
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    {isArabic ? "السنة السادسة - YSMU" : "Course 6 Clinical Rounds & Past Recalls"}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {isArabic ? "مادة سريرية" : "Clinical"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2 flex items-center gap-2">
                  <FileCheck size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-slate-200 truncate">
                    {isArabic ? "تفريغات وملخصات شاملة" : "Complete Round Summaries"}
                  </span>
                </div>
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2 flex items-center gap-2">
                  <BookOpen size={16} className="text-cyan-400 shrink-0" />
                  <span className="text-slate-200 truncate">
                    {isArabic ? "أسئلة السنوات السابقة" : "Past Exam Recalls"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: The Best Source of Study Section & Scores 9 and 10 */}
        {currentStep === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            {/* Crown Banner */}
            <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-2 border-amber-500/40 rounded-2xl p-3.5 shadow-xl relative overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
                    <Crown size={20} />
                  </div>
                  <div>
                    <h5 className="font-black text-amber-300 text-sm flex items-center gap-1.5">
                      <span>{isArabic ? "أفضل مصادر الدراسة" : "Best Sources of Study"}</span>
                      <Sparkles size={13} className="text-amber-400" />
                    </h5>
                    <p className="text-[11px] text-slate-300">
                      {isArabic ? "قسم موصى به لكل مادة دراسية" : "Curated section inside each subject"}
                    </p>
                  </div>
                </div>

                {/* Score 9 & 10 Badge */}
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-black shrink-0 flex items-center gap-1"
                >
                  <Star size={12} className="fill-emerald-400 text-emerald-400" />
                  <span>{isArabic ? "طلبة 9 و 10" : "Scores 9 & 10"}</span>
                </motion.div>
              </div>

              {/* Verified Source Item Demonstration */}
              <div className="mt-3 bg-slate-950/80 border border-amber-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Award size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {isArabic
                        ? "ملخصات اللجنة المعتمدة - الباطنية سنة 6"
                        : "Official Committee High-Yield - Course 6"}
                    </p>
                    <p className="text-[10px] text-emerald-400 font-medium truncate">
                      {isArabic
                        ? "موصى به من الطلاب المتفوقين الحاصلين على 9/10 و 10/10"
                        : "Recommended by previous top students with 9/10 and 10/10 grades"}
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                  TOP PICK
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom Step Indicator Bar */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          {isArabic
            ? `المرحلة ${currentStep + 1} من 3: ${
                currentStep === 0
                  ? "تغطية السنوات 0-6"
                  : currentStep === 1
                  ? "مثال السنة السادسة"
                  : "أفضل مصادر الدراسة (طلبة 9 و 10)"
              }`
            : `Step ${currentStep + 1} of 3: ${
                currentStep === 0
                  ? "Course 0 to 6 Archive"
                  : currentStep === 1
                  ? "Course 6 Clinical Example"
                  : "Best Sources (Scores 9 & 10)"
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
