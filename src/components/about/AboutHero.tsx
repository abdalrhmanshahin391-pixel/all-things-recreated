import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Check, X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteWordmark } from "@/components/brand/SiteWordmark";
import {
  getAboutHeroSettings,
  updateAboutHeroSettings,
  DEFAULT_ABOUT_SETTINGS,
  type AboutHeroSettings,
} from "@/lib/about-settings.functions";

export function AboutHero({ ar, canManage }: { ar: boolean; canManage: boolean }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAboutHeroSettings);

  const { data: serverSettings } = useQuery({
    queryKey: ["about-hero-settings"],
    queryFn: () => getAboutHeroSettings(),
    staleTime: 10 * 1000,
  });

  const [localSettings, setLocalSettings] = useState<AboutHeroSettings | null>(null);
  const settings: AboutHeroSettings = localSettings || serverSettings || DEFAULT_ABOUT_SETTINGS;

  const [isEditing, setIsEditing] = useState(false);
  const [formEn, setFormEn] = useState(settings.sentenceEn);
  const [formAr, setFormAr] = useState(settings.sentenceAr);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (serverSettings) {
      setFormEn(serverSettings.sentenceEn);
      setFormAr(serverSettings.sentenceAr);
    }
  }, [serverSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateFn({
        data: {
          sentenceEn: formEn.trim(),
          sentenceAr: formAr.trim(),
        },
      });
      if (res.ok && res.settings) {
        setLocalSettings(res.settings);
      }
      await qc.invalidateQueries({ queryKey: ["about-hero-settings"] });
      toast.success(ar ? "تم حفظ الجملة بنجاح ✨" : "Sentence updated successfully ✨");
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err?.message || (ar ? "فشل حفظ الجملة" : "Failed to save sentence"));
    } finally {
      setSaving(false);
    }
  }

  const currentSentence = ar
    ? (settings.sentenceAr || settings.sentenceEn)
    : (settings.sentenceEn || settings.sentenceAr);

  return (
    <header className="relative text-center">
      {/* Luminous ambient background aura */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-14 start-1/2 h-72 w-72 md:h-96 md:w-96 -translate-x-1/2 rounded-full blur-3xl opacity-35"
        style={{
          background: "radial-gradient(circle, var(--primary) 0%, #e0a90f 45%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl flex flex-col items-center justify-center px-4">
        {/* Big AquaQBank Logo & Emblem */}
        <div className="group flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          {/* Gold AQ Book Emblem */}
          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-amber-500/25 via-primary/30 to-amber-300/35 blur-md opacity-75 group-hover:opacity-100 transition-opacity" />
            <img
              src="/favicon.png"
              alt="AquaQBank Emblem"
              className="relative h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 rounded-2xl sm:rounded-3xl shadow-2xl ring-2 ring-amber-400/30 bg-card/85 backdrop-blur-md p-2 object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          {/* Big Wordmark */}
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left select-none">
            <div className="hidden md:block">
              <SiteWordmark size={68} />
            </div>
            <div className="hidden sm:block md:hidden">
              <SiteWordmark size={54} />
            </div>
            <div className="sm:hidden">
              <SiteWordmark size={42} />
            </div>
          </div>
        </div>

        {/* The Sentence Underneath */}
        {!isEditing ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            {currentSentence && (
              <p className="max-w-2xl text-base sm:text-lg md:text-xl font-medium leading-relaxed text-muted-foreground/90 transition-colors">
                {currentSentence}
              </p>
            )}

            {/* Admin place to edit or add sentence */}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setFormEn(settings.sentenceEn);
                  setFormAr(settings.sentenceAr);
                  setIsEditing(true);
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3.5 py-1.5 text-xs font-black text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted transition-all shadow-sm"
              >
                <Pencil size={13} className="text-primary" />
                {currentSentence
                  ? (ar ? "تعديل الجملة" : "Edit sentence")
                  : (ar ? "+ إضافة جملة تحت الشعار" : "+ Add sentence under logo")}
              </button>
            )}
          </div>
        ) : (
          /* Inline Admin Editor */
          <form
            onSubmit={handleSave}
            className="mt-6 w-full max-w-xl rounded-2xl border border-primary/40 bg-card/95 p-5 shadow-2xl backdrop-blur-md text-start space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span className="text-sm font-black text-foreground">
                  {ar ? "تعديل الجملة التعريفية تحت الشعار" : "Edit Sentence Under Logo"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                English Sentence
              </label>
              <textarea
                value={formEn}
                onChange={(e) => setFormEn(e.target.value)}
                placeholder="e.g. Medical Question Bank & Clinical Cases — Empowering the next generation of physicians."
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground mb-1.5" dir="rtl">
                الجملة بالعربية
              </label>
              <textarea
                value={formAr}
                onChange={(e) => setFormAr(e.target.value)}
                placeholder="مثال: بنك الأسئلة والحالات السريرية الطبية — نحو تمكين جيل الأطباء القادم."
                rows={2}
                dir="rtl"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
              >
                {ar ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {ar ? "جارِ الحفظ..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    {ar ? "حفظ التغييرات" : "Save changes"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </header>
  );
}
