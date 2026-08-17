import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { currentSubscription, isInstalled, isIos, pushSupported } from "@/lib/push-client";

const KEY = "aq.push-prompt.dismissed";

/**
 * Quiet one-time invitation to switch phone notifications on. Devices only
 * receive pushes after this step, so it must be easy to find.
 */
export function NotificationsPrompt() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(KEY) === "1") return;
    const iosNotInstalled = isIos() && !isInstalled();
    if (!pushSupported() && !iosNotInstalled) return;
    let alive = true;
    currentSubscription()
      .then((sub) => {
        if (!alive) return;
        const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
        if (!sub || !granted) setShow(true);
      })
      .catch(() => setShow(true));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(KEY, "1");
    setShow(false);
  }

  return (
    <div className="mx-auto mt-4 max-w-6xl px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
        <Bell size={18} className="shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold">{ar ? "فعّل إشعارات الهاتف" : "Turn on phone notifications"}</span>{" "}
          <span className="text-muted-foreground">
            {ar
              ? "لتصلك الإعلانات والفعاليات والمواد الجديدة على هذا الجهاز."
              : "Get announcements, events and new material on this device."}
          </span>
        </p>
        <Link
          to="/profile"
          hash="notifications"
          className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
        >
          {ar ? "تفعيل" : "Enable"}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={ar ? "إغلاق" : "Dismiss"}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
