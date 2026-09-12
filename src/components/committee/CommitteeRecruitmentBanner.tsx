import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Link2,
  Users,
  Eye,
  EyeOff,
  Check,
  Loader2,
  Clock,
  HeartHandshake,
} from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/components/LanguageProvider";
import {
  type CommitteeRecruitmentSettings,
  updateCommitteeRecruitmentSettings,
} from "@/lib/committee-recruitment.functions";

/**
 * Public announcement card rendered when committee members are hidden (recruitment mode).
 */
export function CommitteeRecruitmentCard({
  settings,
}: {
  settings: CommitteeRecruitmentSettings;
}) {
  const { lang } = useLang();
  const ar = lang === "ar";

  const title = ar ? (settings.titleAr || "سنختار أعضاء اللجنة قريباً") : (settings.titleEn || "We will choose the team members soon");
  const subtitle = ar
    ? (settings.subtitleAr || "باب التقديم للانضمام إلى فريق لجنة الطب والجراحة مفتوح الآن. إذا كنت ترغب في المساهمة في تنظيم المكتبة والمصادر الطبية ومساعدة زملائك، يمكنك التقديم الآن.")
    : (settings.subtitleEn || "Applications to join لجنة الطب والجراحة are now open. If you want to contribute to the medical study library and help fellow students, apply now.");

  const applyUrl = settings.applyLink?.trim() || "/support";
  const isExternal = /^https?:\/\//i.test(applyUrl);

  return (
    <section className="mx-auto mt-10 w-full max-w-3xl rounded-3xl border-2 border-dashed border-primary/35 bg-gradient-to-b from-primary/10 via-card to-card p-7 sm:p-12 text-center shadow-lg relative overflow-hidden">
      {/* Decorative Glow */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-primary">
          <Sparkles size={14} className="animate-pulse" />
          <span>{ar ? "فتح باب التقديم · اختيار الأعضاء" : "Applications Open · Committee Selection"}</span>
        </div>

        <h2 className="font-display text-2xl sm:text-4xl font-black text-foreground tracking-tight leading-snug">
          {title}
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-muted-foreground">
          {subtitle}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          {isExternal ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-black text-primary-foreground shadow-md hover:opacity-95 hover:scale-[1.02] active:scale-[0.99] transition-all"
            >
              <span>{ar ? "قدّم الآن للانضمام للفريق 📝" : "Apply to Join the Team 📝"}</span>
              <ExternalLink size={16} />
            </a>
          ) : (
            <Link
              to={applyUrl}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-black text-primary-foreground shadow-md hover:opacity-95 hover:scale-[1.02] active:scale-[0.99] transition-all"
            >
              <span>{ar ? "قدّم الآن للانضمام للفريق 📝" : "Apply to Join the Team 📝"}</span>
              <ArrowRight size={16} />
            </Link>
          )}
        </div>

        <div className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/60 px-3.5 py-1.5 rounded-xl border border-border/70">
          <Clock size={13} className="text-primary shrink-0" />
          <span>
            {ar
              ? "سيتم اختيار وإعلان أعضاء اللجنة المعتمدين قريباً فور اكتمال فترة التقديم والمراجعة."
              : "The selected committee members will be announced once the review period is complete."}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Admin management toolbar for toggling committee visibility and editing the apply link.
 */
export function CommitteeVisibilityAdminToolbar({
  settings,
  onUpdated,
}: {
  settings: CommitteeRecruitmentSettings;
  onUpdated: (newSettings: CommitteeRecruitmentSettings) => void;
}) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [linkInput, setLinkInput] = useState(settings.applyLink || "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleToggle(visible: boolean) {
    setToggling(true);
    try {
      const res = await updateCommitteeRecruitmentSettings({
        data: { teamVisible: visible },
      });
      if (res?.settings) {
        onUpdated(res.settings);
        toast.success(
          visible
            ? (ar ? "تم إظهار أعضاء اللجنة للجميع بنجاح 👥" : "Committee members are now visible to everyone 👥")
            : (ar ? "تم تفعيل وضع اختيار الأعضاء (الأعضاء مخفيون) 🔒" : "Selection mode active (Members hidden from visitors) 🔒")
        );
      }
    } catch (err: any) {
      toast.error(err.message || (ar ? "فشل تحديث الحالة" : "Failed to update visibility"));
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveLink() {
    setSaving(true);
    try {
      const res = await updateCommitteeRecruitmentSettings({
        data: { applyLink: linkInput.trim() },
      });
      if (res?.settings) {
        onUpdated(res.settings);
        toast.success(ar ? "تم حفظ رابط التقديم بنجاح 🔗" : "Application link saved successfully 🔗");
      }
    } catch (err: any) {
      toast.error(err.message || (ar ? "فشل حفظ الرابط" : "Failed to save link"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-primary/30 bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left Side: Status & Description */}
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-primary">
                {ar ? "لوحة المشرف · حالة ظهور الأعضاء" : "Admin Panel · Team Visibility"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  settings.teamVisible
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                }`}
              >
                {settings.teamVisible ? (
                  <>
                    <Eye size={12} /> {ar ? "ظاهر للجميع" : "Visible"}
                  </>
                ) : (
                  <>
                    <EyeOff size={12} /> {ar ? "وضع الاختيار (مخفي)" : "Selection Mode (Hidden)"}
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ar
                ? "يمكنك تشغيل أو إيقاف ظهور الأعضاء. عند الإيقاف يظهر للطلاب إعلان (سنختار الأعضاء قريباً) مع رابط التقديم."
                : "Toggle team visibility. When turned off, visitors see 'We will choose the members soon' with the apply link."}
            </p>
          </div>
        </div>

        {/* Right Side: Toggle Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={toggling}
            onClick={() => handleToggle(!settings.teamVisible)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              settings.teamVisible
                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            } disabled:opacity-50`}
          >
            {toggling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : settings.teamVisible ? (
              <>
                <EyeOff size={14} />
                <span>{ar ? "إخفاء الأعضاء (تفعيل وضع التقديم)" : "Hide Members (Turn Off)"}</span>
              </>
            ) : (
              <>
                <Eye size={14} />
                <span>{ar ? "إظهار الأعضاء للجميع (تشغيل)" : "Show Members (Turn On)"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Apply Link Config Row */}
      <div className="mt-4 pt-4 border-t border-border/70">
        <label className="block text-xs font-bold text-foreground mb-1.5">
          {ar ? "رابط التقديم على عضوية اللجنة (Google Form أو رابط مخصص):" : "Application link (Google Form or custom URL):"}
        </label>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Link2 size={14} />
            </span>
            <input
              type="url"
              dir="ltr"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://forms.gle/... or /support"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs sm:text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={saving || linkInput.trim() === (settings.applyLink || "").trim()}
            onClick={handleSaveLink}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>{ar ? "حفظ الرابط" : "Save link"}</span>
          </button>
        </div>
        {settings.applyLink ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1">
            <span>{ar ? "الرابط الحالي:" : "Current link:"}</span>
            <a
              href={settings.applyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-0.5 truncate max-w-xs sm:max-w-md font-mono"
            >
              {settings.applyLink} <ExternalLink size={10} />
            </a>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {ar
              ? "ملاحظة: إذا لم تضع رابطاً، سيتم توجيه الطلاب تلقائياً إلى صفحة الدعم (/support) للتواصل."
              : "Note: If left empty, the button links to the support contact page (/support)."}
          </p>
        )}
      </div>
    </div>
  );
}
