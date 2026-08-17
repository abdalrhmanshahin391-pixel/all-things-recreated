import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Share } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/components/LanguageProvider";
import {
  currentSubscription,
  disablePush,
  enablePush,
  isInstalled,
  isIos,
  pushSupported,
} from "@/lib/push-client";

/** Profile switch that turns phone notifications on or off for this device. */
export function PushToggle() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    setIosHint(isIos() && !isInstalled());
    currentSubscription()
      .then((s) => setOn(!!s))
      .finally(() => setReady(true));
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        toast.success(ar ? "تم إيقاف الإشعارات" : "Notifications turned off");
      } else {
        const res = await enablePush(lang);
        if (res.ok) {
          setOn(true);
          toast.success(ar ? "تم تفعيل الإشعارات" : "Notifications are on");
        } else if (res.reason === "denied") {
          toast.error(
            ar
              ? "تم رفض الإذن. فعّل الإشعارات لهذا الموقع من إعدادات المتصفح."
              : "Permission was blocked. Allow notifications for this site in your browser settings.",
          );
        } else if (res.reason === "not-configured") {
          toast.error(ar ? "الإشعارات غير مهيأة بعد." : "Notifications are not configured yet.");
        } else {
          toast.error(res.reason ?? (ar ? "تعذر التفعيل" : "Could not enable notifications"));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (!supported && iosHint) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-1 inline-flex items-center gap-2 text-sm font-bold">
          <Share size={15} className="text-primary" />
          {ar ? "الإشعارات على الآيفون" : "Notifications on iPhone"}
        </p>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "افتح قائمة المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية»، وبعدها افتح التطبيق من الأيقونة وفعّل الإشعارات من هنا."
            : "Open the Share menu, choose “Add to Home Screen”, then open AquaQBank from the new icon and turn notifications on here."}
        </p>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
        {ar ? "هذا المتصفح لا يدعم الإشعارات." : "This browser does not support notifications."}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-sm font-bold">
          {on ? <Bell size={15} className="text-primary" /> : <BellOff size={15} className="text-muted-foreground" />}
          {ar ? "إشعارات الهاتف" : "Phone notifications"}
        </p>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "استقبل تنبيهات الإعلانات والفعاليات على هذا الجهاز."
            : "Get announcements and event alerts on this device."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold ${
          on ? "border border-border text-muted-foreground" : "bg-primary text-primary-foreground"
        } disabled:opacity-60`}
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        {on ? (ar ? "إيقاف" : "Turn off") : ar ? "تفعيل" : "Enable"}
      </button>
    </div>
  );
}
