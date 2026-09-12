import { useEffect, useState } from "react";
import { Share, PlusSquare, X, ShieldCheck } from "lucide-react";

/**
 * PWA Install Banner for iOS / Mobile devices.
 * Guides students to add AquaQBank to their Home Screen for true
 * standalone fullscreen mode and enhanced exam security.
 */
export function PwaInstallBanner({ className = "" }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user is on iOS / mobile Safari
    const ua = window.navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;

    // Check if already dismissed this week
    const dismissed = localStorage.getItem("aquaqbank-pwa-dismissed");
    const isDismissedRecent = dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000;

    if (isIos && !isStandalone && !isDismissedRecent) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem("aquaqbank-pwa-dismissed", Date.now().toString());
    setShow(false);
  }

  return (
    <div
      className={`rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-900/90 to-slate-900/95 text-white p-4 shadow-lg backdrop-blur-md transition-all ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-indigo-200">
              Exam Security & Fullscreen Mode
            </h4>
            <p className="mt-0.5 text-xs text-slate-200 font-medium">
              Install AquaQBank on your Home Screen for a distraction-free and secure experience.
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/90">
        <span>Tap</span>
        <span className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 font-bold">
          <Share size={12} /> Share
        </span>
        <span>then select</span>
        <span className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 font-bold">
          <PlusSquare size={12} /> Add to Home Screen
        </span>
      </div>
    </div>
  );
}
