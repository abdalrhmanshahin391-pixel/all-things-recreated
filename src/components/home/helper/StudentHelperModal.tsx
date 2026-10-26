import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, FolderOpen, Languages, PlayCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLang } from "@/components/LanguageProvider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTopicId?: string | null;
}

/** One recorded clip per section of the site (public/showcase/*.webm), all pre-loaded so switching never shows a spinner. */
const CLIPS = [
  {
    key: "qbank",
    Icon: BookOpenCheck,
    title_en: "Question bank",
    title_ar: "بنك الأسئلة",
    note_en: "Pick an answer, submit it and read the explanation.",
    note_ar: "اختر الإجابة، أرسلها، ثم اقرأ الشرح.",
  },
  {
    key: "lectures",
    Icon: PlayCircle,
    title_en: "Lectures",
    title_ar: "المحاضرات",
    note_en: "Open a course and watch its introduction.",
    note_ar: "افتح الكورس وشاهد مقدمته.",
  },
  {
    key: "resources",
    Icon: FolderOpen,
    title_en: "Resources & Aqua summaries",
    title_ar: "المصادر وملخصات أكوا",
    note_en: "Browse the seven years, then jump to the Aqua summaries.",
    note_ar: "تصفّح السنوات السبع ثم انتقل إلى ملخصات أكوا.",
  },
] as const;

export function StudentHelperModal({ open, onOpenChange }: Props) {
  const { lang, setLang } = useLang();
  const isArabic = lang === "ar";
  const [active, setActive] = useState(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  // Only the visible clip plays, always from its start.
  useEffect(() => {
    if (!open) return;
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.currentTime = 0;
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active, open]);

  const cur = CLIPS[active]!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[160] w-[calc(100vw-1.5rem)] max-w-4xl grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-2xl [&>button]:hidden"
        dir={isArabic ? "rtl" : "ltr"}
      >
        <DialogTitle className="sr-only">{isArabic ? "دليل الطالب" : "Student guide"}</DialogTitle>
        <DialogDescription className="sr-only">
          {isArabic ? "فيديوهات قصيرة تشرح كل قسم في الموقع." : "Short videos that show each section of the website."}
        </DialogDescription>

        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)" }}>
              {isArabic ? "كيف يعمل الموقع" : "How AquaQBank works"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {isArabic ? "ثلاثة فيديوهات قصيرة، واحد لكل قسم." : "Three short videos, one for each section."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(isArabic ? "en" : "ar")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Languages size={14} /> {isArabic ? "English" : "العربية"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={isArabic ? "إغلاق" : "Close"}
              className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="relative aspect-video w-full bg-[#0b1b36]">
            {CLIPS.map((c, i) => (
              <video
                key={c.key}
                ref={(el) => {
                  videos.current[i] = el;
                }}
                src={`/showcase/${c.key}.webm`}
                muted
                loop
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
                style={{ opacity: i === active ? 1 : 0 }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 p-4 lg:p-5">
            {CLIPS.map(({ key, Icon, title_en, title_ar, note_en, note_ar }, i) => {
              const on = i === active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-start transition-all duration-300 ${
                    on ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-foreground hover:bg-[color:var(--primary-soft)]"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      on ? "bg-white/10 text-[color:var(--gold)]" : "bg-card text-primary"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{isArabic ? title_ar : title_en}</span>
                    <span className={`mt-1 block text-xs leading-snug ${on ? "text-white/70" : "text-muted-foreground"}`}>
                      {isArabic ? note_ar : note_en}
                    </span>
                  </span>
                </button>
              );
            })}
            <p className="mt-auto hidden pt-3 text-[11px] leading-snug text-muted-foreground lg:block">
              {isArabic ? "الفيديو الحالي: " : "Now playing: "}
              <span className="font-semibold text-foreground">{isArabic ? cur.title_ar : cur.title_en}</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}