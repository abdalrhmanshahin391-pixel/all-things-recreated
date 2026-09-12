import { useState } from "react";
import { SURAH_KAHF_AYAHS, SURAH_KAHF_INFO } from "@/lib/surah-kahf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, Check, Sparkles, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function SurahKahfReaderModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const [fontSize, setFontSize] = useState<number>(22); // px

  function handleFinish() {
    toast.success("تقبل الله طاعتكم وقراءتكم لسورة الكهف! جعلها الله نوراً لكم ما بين الجمعتين 🌟");
    onComplete?.();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-4xl w-[96vw] max-h-[92vh] overflow-hidden flex flex-col rounded-3xl p-4 sm:p-6"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <BookOpen size={20} />
            </div>
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <span>{SURAH_KAHF_INFO.name}</span>
                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {SURAH_KAHF_INFO.numberOfAyahs} آية
                </span>
              </DialogTitle>
              <span className="text-xs text-muted-foreground">
                سُنّة يوم الجمعة المبارك · نورٌ ما بين الجمعتين
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(16, s - 2))}
              title="تصغير الخط"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-all"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono font-bold px-1.5">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(36, s + 2))}
              title="تكبير الخط"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-all"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </DialogHeader>

        {/* Quran Text Content */}
        <div className="flex-1 overflow-y-auto py-6 px-2 sm:px-6 space-y-6">
          {/* Basmala Header */}
          <div className="text-center py-4 border-b border-primary/20 bg-gradient-to-b from-primary/5 to-transparent rounded-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs text-primary font-bold mb-2">
              <Sparkles size={13} />
              <span>أعوذ بالله من الشيطان الرجيم</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-wide font-serif">
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </h2>
          </div>

          {/* Verses Container */}
          <div
            className="text-foreground text-justify leading-[2.5] sm:leading-[2.8] font-medium tracking-wide"
            style={{ fontSize: `${fontSize}px` }}
          >
            {SURAH_KAHF_AYAHS.map((ayah) => {
              // Strip basmala from ayah 1 if repeated
              let text = ayah.text;
              if (ayah.number === 1 && text.startsWith("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ")) {
                text = text.replace("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ", "");
              }

              return (
                <span key={ayah.number} className="inline transition-colors hover:text-primary">
                  {text}{" "}
                  <span className="inline-flex items-center justify-center text-primary font-bold text-[0.8em] mx-1 select-none font-serif">
                    ﴿{ayah.number}﴾
                  </span>{" "}
                </span>
              );
            })}
          </div>

          {/* End of Surah Du'a / Virtue note */}
          <div className="text-center py-6 bg-muted/30 rounded-2xl border border-border p-4 space-y-2 mt-8">
            <h4 className="font-bold text-base text-primary">صدق الله العظيم</h4>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
              قال النبي ﷺ: «مَنْ قَرَأَ سُورَةَ الْكَهْفِ فِي يَوْمِ الْجُمُعَةِ أَضَاءَ لَهُ مِنَ النُّورِ مَا بَيْنَ الْجُمُعَتَيْنِ».
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="flex flex-row items-center justify-between border-t border-border pt-3.5 gap-2">
          <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs sm:text-sm">
            إغلاق
          </Button>

          <Button
            onClick={handleFinish}
            className="rounded-xl font-bold gap-2 text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          >
            <Check size={16} />
            <span>أتممت القراءة بحمد الله</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
