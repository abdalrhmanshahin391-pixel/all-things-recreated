import { useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Sparkles, GraduationCap } from "lucide-react";
import { StudentHelperModal } from "./StudentHelperModal";
import { useLang } from "@/components/LanguageProvider";

export function StudentHelper() {
  const [modalOpen, setModalOpen] = useState(false);
  const { lang } = useLang();
  const isArabic = lang === "ar";

  return (
    <>
      {/* Floating Action Trigger Button */}
      <div
        className={`fixed bottom-5 sm:bottom-6 z-[140] ${
          isArabic ? "left-4 sm:left-6" : "right-4 sm:right-6"
        }`}
      >
        <motion.button
          type="button"
          onClick={() => setModalOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isArabic ? "دليل الطالب والموقع" : "Student Guide"}
          className="group relative flex items-center gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full bg-gradient-to-r from-primary via-cyan-600 to-primary text-primary-foreground shadow-xl shadow-primary/25 border border-white/20 transition-all cursor-pointer select-none"
        >
          {/* Animated Glow Ping */}
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400" />
          </span>

          {/* Icon with spin/scale on hover */}
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <GraduationCap size={15} className="group-hover:rotate-12 transition-transform" />
          </div>

          {/* Label */}
          <div className="flex flex-col text-start leading-tight">
            <span className="text-xs sm:text-sm font-black tracking-wide">
              {isArabic ? "دليل الطالب" : "Student Guide"}
            </span>
            <span className="text-[10px] text-white/80 font-semibold hidden sm:inline">
              {isArabic ? "شرح متحرك للموقع" : "Interactive Walkthrough"}
            </span>
          </div>

          <Sparkles size={14} className="text-amber-300 animate-pulse hidden sm:inline" />
        </motion.button>
      </div>

      {/* The Guide Modal */}
      <StudentHelperModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}

/**
 * An inline pill banner suitable for embedding in hero sections
 */
export function HeroStudentGuidePill({ onClick }: { onClick: () => void }) {
  const { lang } = useLang();
  const isArabic = lang === "ar";

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 hover:bg-primary/20 text-foreground text-xs font-bold transition-all shadow-sm group cursor-pointer"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span>
        {isArabic
          ? "طالب جديد؟ شاهد كيف تستخدم الموقع وبنك الأسئلة"
          : "New student? Watch how to use the website & Question Bank"}
      </span>
      <Sparkles size={13} className="text-amber-500 group-hover:scale-110 transition-transform" />
    </button>
  );
}
