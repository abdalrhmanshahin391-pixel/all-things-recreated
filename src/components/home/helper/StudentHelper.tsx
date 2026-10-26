import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
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
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          aria-label={isArabic ? "دليل الطالب والموقع" : "Student Guide"}
          className="on-dark-panel group relative flex cursor-pointer select-none items-center gap-3 rounded-full py-2 pe-5 ps-2 shadow-[0_20px_40px_-18px_rgba(11,27,54,0.9)] ring-1 ring-[color:var(--gold)]/50 transition-shadow hover:ring-[color:var(--gold)]"
          style={{ background: "linear-gradient(135deg, var(--navy-deep), var(--navy))" }}
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--gold)] text-[color:var(--gold-foreground)]">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[color:var(--gold)] opacity-30 motion-reduce:hidden" />
            <Play size={16} fill="currentColor" className="relative ms-0.5" />
          </span>
          <span className="flex flex-col text-start leading-tight">
            <span className="text-sm font-semibold text-white">{isArabic ? "شاهد كيف يعمل الموقع" : "Watch how it works"}</span>
            <span className="hidden text-[11px] text-white/65 sm:inline">
              {isArabic ? "٣ فيديوهات قصيرة" : "3 short videos"}
            </span>
          </span>
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
