import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DISMISS_KEY = "ysmu-orientation-tip-dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const MQ = "(max-width: 1023px) and (orientation: portrait)";

export function OrientationTip() {
  const [dismissed, setDismissed] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const at = Number(raw);
        if (!isNaN(at) && Date.now() - at < DISMISS_MS) return;
      }
    } catch {}
    setDismissed(false);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const onChange = () => setPortrait(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  if (!mounted || dismissed || !portrait) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes rotate-device {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(90deg); }
        }
        .rotate-device-loop {
          animation: rotate-device 1.8s ease-in-out infinite alternate;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .rotate-device-loop { animation: none; }
        }
      `}</style>

      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          type="button"
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>

        <div className="mx-auto mb-4 text-primary" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none" className="mx-auto">
            <g className="rotate-device-loop">
              <rect x="6" y="2" width="20" height="28" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="16" cy="25" r="1.5" fill="currentColor" />
              <rect x="12" y="5" width="8" height="2" rx="1" fill="currentColor" opacity="0.6" />
            </g>
          </svg>
        </div>

        <p className="text-base font-bold leading-snug text-foreground" dir="ltr">
          Rotate your phone for a better view
        </p>
        <p className="mt-2 text-base font-bold leading-snug text-foreground" dir="rtl" lang="ar">
          قم بتدوير هاتفك للحصول على عرض أفضل
        </p>

        <button
          onClick={dismiss}
          type="button"
          className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          Got it / حسناً
        </button>
      </div>
    </div>,
    document.body,
  );
}
