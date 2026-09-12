import { useState } from "react";
import {
  Compass,
  Landmark,
  Layers,
  Timer,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  HelpCircle,
  Languages,
  BookOpen,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HELPER_TOPICS, type HelperTopic } from "./helper-data";
import { WalkthroughViewer } from "./WalkthroughViewer";
import { useLang } from "@/components/LanguageProvider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTopicId?: string | null;
}

export function StudentHelperModal({ open, onOpenChange, initialTopicId }: Props) {
  const { lang, setLang } = useLang();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId ?? null);

  const isArabic = lang === "ar";
  const selectedTopic = HELPER_TOPICS.find((t) => t.id === selectedTopicId) ?? null;

  function handleClose() {
    onOpenChange(false);
    setSelectedTopicId(null);
  }

  function getIcon(icon: HelperTopic["icon"]) {
    switch (icon) {
      case "compass":
        return <Compass className="text-emerald-500" size={20} />;
      case "landmark":
        return <Landmark className="text-purple-500" size={20} />;
      case "layers":
        return <Layers className="text-blue-500" size={20} />;
      case "timer":
        return <Timer className="text-amber-500" size={20} />;
      case "sparkles":
        return <Sparkles className="text-cyan-500" size={20} />;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-2xl z-[160]"
        dir={isArabic ? "rtl" : "ltr"}
      >
        {/* Hidden accessible title & description for Radix Dialog */}
        <DialogTitle className="sr-only">
          {isArabic ? "دليل الطالب والموقع" : "AquaQBank Student Guide"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {isArabic
            ? "دليل تفاعلي متحرك للإجابة على جميع تساؤلات الطلاب وشرح كيفية استخدام المنصة."
            : "Interactive animated guide to answer student questions and explain how to use the website."}
        </DialogDescription>

        {selectedTopic ? (
          /* Active Question Walkthrough Player */
          <WalkthroughViewer
            topic={selectedTopic}
            isArabic={isArabic}
            onBack={() => setSelectedTopicId(null)}
            onClose={handleClose}
          />
        ) : (
          /* Question Selection Grid */
          <div>
            {/* Header with Title & Language Switcher */}
            <div className="flex items-start justify-between pb-4 border-b border-border/80">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                    {isArabic ? "دليل طالب الأكاديمية" : "AquaQBank Student Guide"}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {isArabic
                      ? "اختر سؤالاً من الأسئلة أدناه لمشاهدة شرح متحرك وتفاعلي يوضح لك الخطوات:"
                      : "Click any question below to watch a step-by-step animated walkthrough:"}
                  </p>
                </div>
              </div>

              {/* Language Switcher Button */}
              <button
                type="button"
                onClick={() => setLang(isArabic ? "en" : "ar")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-colors mr-8"
              >
                <Languages size={14} className="text-primary" />
                <span>{isArabic ? "English" : "العربية"}</span>
              </button>
            </div>

            {/* Questions List */}
            <div className="mt-4 space-y-2.5">
              {HELPER_TOPICS.map((topic, index) => (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopicId(topic.id)}
                  className="w-full group text-start p-3.5 sm:p-4 rounded-2xl border border-border/80 bg-background/50 hover:bg-accent/40 hover:border-primary/40 transition-all shadow-sm flex items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {getIcon(topic.icon)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-muted-foreground">
                          #{index + 1}
                        </span>
                        <h4 className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors">
                          {isArabic ? topic.title_ar : topic.title_en}
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${topic.badge_color}`}
                        >
                          {isArabic ? topic.badge_ar : topic.badge_en}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {isArabic ? topic.short_desc_ar : topic.short_desc_en}
                      </p>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-xl bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center shrink-0 transition-colors text-muted-foreground">
                    {isArabic ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                  </div>
                </button>
              ))}
            </div>

            {/* Bottom Footer Note */}
            <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen size={14} className="text-primary" />
                <span>
                  {isArabic
                    ? "شروحات تفاعلية مخصصة لطلاب الطب"
                    : "Interactive demonstrations tailored for medical students"}
                </span>
              </span>

              <button
                type="button"
                onClick={() => setLang(isArabic ? "en" : "ar")}
                className="sm:hidden inline-flex items-center gap-1 text-xs font-bold text-primary"
              >
                <Languages size={12} />
                <span>{isArabic ? "English" : "العربية"}</span>
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
