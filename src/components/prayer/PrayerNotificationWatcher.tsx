import { useEffect, useState } from "react";
import {
  getArmeniaPrayerSummary,
  sendSilentPrayerNotification,
  requestSilentNotificationPermission,
  type ArmeniaPrayerSummary,
} from "@/lib/prayer-times";
import { Bell, BellOff, VolumeX, MoonStar, Clock, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Background watcher that monitors Armenia prayer times every few seconds.
 * When an Adhan time enters, fires a silent browser notification and silent toast.
 * Mounted globally in __root.tsx so it works everywhere on the site.
 */
export function PrayerNotificationWatcher() {
  useEffect(() => {
    function checkPrayer() {
      const now = new Date();
      const summary = getArmeniaPrayerSummary(now);

      for (const p of summary.prayers) {
        if (p.key === "sunrise") continue; // Sunrise is not an adhan prayer
        const diffMs = now.getTime() - p.time.getTime();
        // If within 90 seconds after prayer time entered
        if (diffMs >= 0 && diffMs < 90000) {
          sendSilentPrayerNotification(p.nameAr, p.key);
        }
      }
    }

    checkPrayer();
    const interval = setInterval(checkPrayer, 5000);
    return () => clearInterval(interval);
  }, []);

  return null;
}

/**
 * Beautiful, responsive top bar / widget showing time remaining until next Adhan
 * in Armenia time (يريفان) with silent notification toggle.
 */
export function ArmeniaPrayerBar({ className = "" }: { className?: string }) {
  const [summary, setSummary] = useState<ArmeniaPrayerSummary | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    setSummary(getArmeniaPrayerSummary(new Date()));
    const timer = setInterval(() => {
      setSummary(getArmeniaPrayerSummary(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleTogglePermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("متصفحك لا يدعم إشعارات الويب");
      return;
    }
    if (permission === "granted") {
      toast.info("إشعارات الأذان الصامتة مفعلة بالفعل (بدون صوت)");
      return;
    }
    const granted = await requestSilentNotificationPermission();
    setPermission(granted ? "granted" : "denied");
    if (granted) {
      toast.success("تم تفعيل إشعارات الأذان الصامتة (بدون صوت) بنجاح 🔔");
    } else {
      toast.error("تم رفض إذن الإشعارات من المتصفح");
    }
  }

  if (!summary) return null;

  return (
    <div className={`relative rounded-2xl border border-primary/20 bg-card/90 backdrop-blur-md shadow-xs ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        {/* Left/Start side: Location & Next Prayer Countdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 text-primary text-xs font-bold shrink-0">
            <MoonStar size={14} />
            <span>توقيت أرمينيا 🇦🇲</span>
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-muted-foreground">باقٍ على</span>
            <span className="font-extrabold text-foreground">{summary.nextPrayerNameAr}:</span>
            <span className="font-mono font-bold text-primary tracking-wider bg-primary/10 px-2 py-0.5 rounded-lg">
              {summary.timeRemaining.formatted}
            </span>
          </div>
        </div>

        {/* Right/End side: Actions & Details Toggle */}
        <div className="flex items-center gap-2">
          {/* Silent notification button */}
          <button
            type="button"
            onClick={handleTogglePermission}
            title={
              permission === "granted"
                ? "إشعارات الأذان الصامتة مفعلة"
                : "تفعيل إشعار بدون صوت عند الأذان"
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
              permission === "granted"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                : "bg-muted text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            {permission === "granted" ? (
              <>
                <Bell size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">تنبيه صامت مفعّل</span>
              </>
            ) : (
              <>
                <VolumeX size={13} />
                <span>تفعيل تنبيه بدون صوت</span>
              </>
            )}
          </button>

          {/* Toggle times dropdown */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-all"
          >
            <Clock size={13} />
            <span className="hidden md:inline">مواقيت اليوم</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Expanded prayer schedule strip */}
      {detailsOpen && (
        <div className="border-t border-border/80 px-4 py-3 bg-muted/30 rounded-b-2xl animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {summary.prayers.map((p) => (
              <div
                key={p.key}
                className={`p-2 rounded-xl border transition-all ${
                  p.isNext
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-bold"
                    : p.isPassed
                    ? "border-transparent bg-background/50 text-muted-foreground opacity-75"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <div className="text-xs text-muted-foreground mb-0.5">{p.shortName}</div>
                <div className="font-mono text-sm font-extrabold text-foreground">{p.timeFormatted}</div>
                {p.isNext && <span className="text-[10px] text-primary font-bold">القادم</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <VolumeX size={12} className="text-primary" />
            <span>يتم إرسال إشعار هادئ وبدون أي صوت عند دخول وقت كل صلاة.</span>
          </div>
        </div>
      )}
    </div>
  );
}
