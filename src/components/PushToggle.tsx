import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2, Send, Share } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/components/LanguageProvider";
import { sendPushSelfTest } from "@/lib/push.functions";
import {
  currentSubscription,
  disablePush,
  enablePush,
  isInstalled,
  isIos,
  myDeviceCount,
  pushSupported,
} from "@/lib/push-client";

function reasonText(reason: string | undefined, ar: boolean): string {
  const r = reason ?? "";
  if (r === "denied")
    return ar
      ? "الإذن محظور. افتح إعدادات المتصفح لهذا الموقع واسمح بالإشعارات ثم أعد المحاولة."
      : "Permission is blocked. Allow notifications for this site in your browser settings, then try again.";
  if (r === "dismissed")
    return ar ? "تم إغلاق نافذة الإذن دون سماح." : "The permission prompt was dismissed.";
  if (r === "ios-install")
    return ar
      ? "على الآيفون/الآيباد: أضف الموقع إلى الشاشة الرئيسية ثم افتحه من الأيقونة وفعّل من هناك."
      : "On iPhone/iPad: add the site to your Home Screen, open it from that icon, then enable here.";
  if (r === "not-configured")
    return ar ? "مفاتيح الإشعارات غير مهيأة على الخادم." : "Notification keys are not configured on the server.";
  if (r === "signed-out") return ar ? "سجّل الدخول أولاً." : "Please sign in first.";
  if (r === "unsupported") return ar ? "هذا المتصفح لا يدعم الإشعارات." : "This browser does not support notifications.";
  if (r.startsWith("sw-failed"))
    return (ar ? "تعذر تشغيل خدمة الإشعارات: " : "The notification service could not start: ") + r.slice(10);
  if (r.startsWith("subscribe-failed"))
    return (ar ? "رفض المتصفح الاشتراك: " : "The browser refused the subscription: ") + r.slice(17);
  return r || (ar ? "تعذر التفعيل" : "Could not enable notifications");
}

/** Profile switch that turns phone notifications on or off for this device. */
export function PushToggle() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [iosHint, setIosHint] = useState(false);
  const [devices, setDevices] = useState(0);

  const refresh = useCallback(async () => {
    const sub = await currentSubscription().catch(() => null);
    setOn(!!sub);
    setDevices(await myDeviceCount().catch(() => 0));
  }, []);

  useEffect(() => {
    setSupported(pushSupported());
    setIosHint(isIos() && !isInstalled());
    refresh().finally(() => setReady(true));
  }, [refresh]);

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        await refresh();
        toast.success(ar ? "تم إيقاف الإشعارات على هذا الجهاز" : "Notifications turned off on this device");
      } else {
        const res = await enablePush(lang);
        if (res.ok) {
          await refresh();
          toast.success(ar ? "تم تفعيل الإشعارات على هذا الجهاز" : "This device is now registered");
        } else {
          toast.error(reasonText(res.reason, ar), { duration: 8000 });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await sendPushSelfTest({ data: { lang } });
      if (res.sent > 0)
        toast.success(
          ar ? `تم الإرسال إلى ${res.sent} جهاز` : `Test sent to ${res.sent} device${res.sent === 1 ? "" : "s"}`,
        );
      else if (res.devices === 0)
        toast.error(ar ? "لا يوجد جهاز مسجل بعد." : "No registered device yet — turn notifications on first.");
      else toast.error(ar ? "فشل الإرسال إلى أجهزتك." : "Delivery to your devices failed.");
    } catch (e: any) {
      toast.error(e?.message ?? (ar ? "تعذر الإرسال" : "Could not send the test"));
    } finally {
      setTesting(false);
    }
  }

  if (!ready) return null;

  if (!supported && iosHint) {
    return (
      <div id="notifications" className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-1 inline-flex items-center gap-2 text-sm font-bold">
          <Share size={15} className="text-primary" />
          {ar ? "الإشعارات على الآيفون والآيباد" : "Notifications on iPhone & iPad"}
        </p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>{ar ? "افتح الموقع في Safari." : "Open the site in Safari."}</li>
          <li>{ar ? "اضغط زر المشاركة (المربع مع السهم)." : "Tap the Share button (square with an arrow)."}</li>
          <li>{ar ? "اختر «إضافة إلى الشاشة الرئيسية»." : "Choose “Add to Home Screen”."}</li>
          <li>
            {ar
              ? "أغلق Safari وافتح AquaQBank من الأيقونة الجديدة."
              : "Close Safari and open AquaQBank from the new icon."}
          </li>
          <li>{ar ? "ارجع إلى هذه الصفحة واضغط «تفعيل»." : "Come back to this page and tap “Enable”."}</li>
        </ol>
      </div>
    );
  }

  if (!supported) {
    return (
      <div id="notifications" className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
        {ar ? "هذا المتصفح لا يدعم الإشعارات." : "This browser does not support notifications."}
      </div>
    );
  }

  return (
    <div id="notifications" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
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

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold ${
            on ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {on ? <CheckCircle2 size={13} /> : <BellOff size={13} />}
          {on
            ? ar
              ? "هذا الجهاز مسجّل"
              : "This device is registered"
            : ar
              ? "هذا الجهاز غير مسجّل"
              : "This device is not registered"}
        </span>
        <span className="text-xs text-muted-foreground">
          {ar ? `أجهزتك المسجّلة: ${devices}` : `${devices} registered device${devices === 1 ? "" : "s"} on your account`}
        </span>
        {devices > 0 && (
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {ar ? "إرسال تجربة" : "Send a test"}
          </button>
        )}
      </div>

      {iosHint && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {ar
            ? "على الآيفون/الآيباد يجب فتح التطبيق من أيقونة الشاشة الرئيسية حتى تعمل الإشعارات."
            : "On iPhone/iPad, open the app from the Home Screen icon for notifications to work."}
        </p>
      )}
    </div>
  );
}
