import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "aqb-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

/**
 * Tracks whether the app can be installed and how.
 * - "prompt": Chrome/Edge gave us a real install prompt (one tap).
 * - "ios": Safari on iPhone/iPad — manual Share > Add to Home Screen.
 * - null: already installed, or the browser has no install path.
 */
export function useInstallApp() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(true); // assume hidden until mounted
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: "prompt" | "ios" | null = installed
    ? null
    : deferred
      ? "prompt"
      : ios
        ? "ios"
        : null;

  async function install() {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome === "accepted";
  }

  return { mode, install };
}

function IosSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-card p-6 text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.png"
              alt="AquaQBank Academy icon"
              className="h-12 w-12 rounded-xl border border-border bg-white"
            />
            <div>
              <p className="text-base font-black leading-tight">Add to Home Screen</p>
              <p className="text-xs text-muted-foreground">Opens full screen, like an app.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-black">
              1
            </span>
            <span className="inline-flex items-center gap-1.5">
              Tap the <Share size={16} className="text-sky-600" /> Share button in Safari
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-black">
              2
            </span>
            <span className="inline-flex items-center gap-1.5">
              Choose <PlusSquare size={16} className="text-sky-600" /> “Add to Home Screen”
            </span>
          </li>
        </ol>

        <p className="mt-4 text-xs text-muted-foreground">
          Apple does not let websites do this automatically — these two taps are the only way on
          iPhone.
        </p>
      </div>
    </div>
  );
}

/** Small "Install app" button, safe to place anywhere. Renders nothing when unavailable. */
export function InstallAppButton({ className }: { className?: string }) {
  const { mode, install } = useInstallApp();
  const [sheet, setSheet] = useState(false);
  if (!mode) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === "ios" ? setSheet(true) : install())}
        className={
          className ??
          "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
        }
      >
        <Download size={16} className="text-cyan-600" />
        Install app
      </button>
      {sheet && <IosSheet onClose={() => setSheet(false)} />}
    </>
  );
}

/** Dismissible bottom banner for mobile visitors on the home page. */
export function InstallAppBanner() {
  const { mode, install } = useInstallApp();
  const [dismissed, setDismissed] = useState(true);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function close() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!mode || dismissed) return null;

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-[150] sm:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <img
            src="/favicon.png"
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-border bg-white"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-foreground">Add AquaQBank to your phone</p>
            <p className="truncate text-xs text-muted-foreground">One tap to open it like an app.</p>
          </div>
          <button
            type="button"
            onClick={() => (mode === "ios" ? setSheet(true) : install())}
            className="shrink-0 rounded-full bg-foreground px-4 py-2 text-xs font-black text-background"
          >
            Add
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {sheet && <IosSheet onClose={() => setSheet(false)} />}
    </>
  );
}
