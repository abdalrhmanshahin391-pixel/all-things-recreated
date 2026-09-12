import { Sparkles, HelpCircle, Languages } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";

interface CourseSessionGuideProps {
  showInlineBanner?: boolean;
  className?: string;
  onStartTour?: () => void;
  modalOpen?: boolean;
  onModalOpenChange?: (open: boolean) => void;
}

export function CourseSessionGuide({
  showInlineBanner = true,
  className = "",
  onStartTour,
}: CourseSessionGuideProps) {
  const { lang, setLang } = useLang();
  const isArabic = lang === "ar";

  if (!showInlineBanner) return null;

  return (
    <div
      className={`rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-background p-4 sm:p-5 shadow-sm transition-all ${className}`}
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left info */}
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0 shadow-inner">
            <HelpCircle size={24} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm sm:text-base text-foreground">
                {isArabic ? "دليل بدء الاختبارات والتدريب" : "How to Start Your Session"}
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                {isArabic ? "إرشادات هامة" : "Interactive Guide"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {isArabic
                ? "اختر المواد التي تريد دراستها، أو اتركها لإضافة جميع الأسئلة تلقائياً. تعرّف على أنماط الاختبار والمؤقت."
                : "Select subjects to practice, or leave unselected to test everything. Learn about modes and timer."}
            </p>
          </div>
        </div>

        {/* Right buttons: Obvious Language switcher + Shining Live Tour */}
        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
          {/* Obvious Language Switch Button */}
          <button
            type="button"
            onClick={() => setLang(isArabic ? "en" : "ar")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/80 bg-background hover:bg-muted text-xs font-black text-foreground transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title={isArabic ? "Switch language to English" : "تغيير اللغة إلى العربية"}
          >
            <Languages size={15} className="text-primary" />
            <span>{isArabic ? "English" : "العربية"}</span>
          </button>

          {/* Prominent Shining Live Tour Button */}
          {onStartTour && (
            <button
              type="button"
              onClick={onStartTour}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white text-xs font-black hover:opacity-95 transition-all cursor-pointer shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 hover:scale-105 active:scale-95 animate-pulse"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <Sparkles size={14} />
              <span>{isArabic ? "جولة تفاعلية حية" : "Live Tour"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveTourButtonTrigger({ onClick, isArabic }: { onClick: () => void; isArabic: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/50 bg-indigo-500/15 hover:bg-indigo-500/25 text-xs font-black text-indigo-600 dark:text-indigo-400 transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95 shrink-0 ring-1 ring-indigo-400/30"
      title={isArabic ? "بدء جولة تفاعلية حية على الصفحة" : "Start Interactive Live Tour"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
      <Sparkles size={13} className="text-indigo-500" />
      <span>{isArabic ? "جولة حية" : "Live Tour"}</span>
    </button>
  );
}

export function GuideButtonTrigger({ onClick, isArabic }: { onClick: () => void; isArabic: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-extrabold text-primary transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95 shrink-0"
      title={isArabic ? "دليل الاستخدام" : "Guide"}
    >
      <HelpCircle size={13} className="text-primary" />
      <span>{isArabic ? "دليل" : "Guide"}</span>
    </button>
  );
}
