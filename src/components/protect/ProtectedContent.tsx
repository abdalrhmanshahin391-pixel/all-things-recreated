import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSharedConsent } from "./consent-store";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Eye, Fingerprint, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { acceptContentTerms, logContentEvent } from "@/lib/content-protection.functions";
import {
  fingerprintPattern,
  tiledWatermark,
  encodeZeroWidth,
  injectZeroWidthFingerprint,
  type WatermarkIdentity,
} from "./watermark";

const DEFAULT_TERMS_EN =
  "Everything on this page is watermarked with your name, account code, time and IP address. " +
  "Screenshots, recordings, printing and copying are detected and logged. " +
  "If any material from your account is shared, your account is permanently banned and your payment is forfeited with no refund.";

function useIdentity(): WatermarkIdentity | null {
  const { user, profile } = useAuth();
  return useMemo(() => {
    if (!user) return null;
    const phone = profile?.phone ?? "";
    return {
      name: profile?.full_name || "",
      username: profile?.username || "",
      email: profile?.email || user.email || "",
      phone,
      phoneTail: phone ? phone.slice(-4) : "",
      code: user.id.slice(0, 8).toUpperCase(),
    };
  }, [user, profile]);
}

export function ProtectedContent({
  context,
  scope = "page",
  className = "",
  consentScope = "global",
  children,
}: {
  context: string;
  /** "page" tiles the whole area; "card" watermarks just this block (question + answers). */
  scope?: "page" | "card";
  /** Extra classes for the wrapper (e.g. h-full for full-height viewers). */
  className?: string;
  /** Where the agreement is remembered, e.g. "course:<id>" to ask once per course. */
  consentScope?: string;
  children: React.ReactNode;
}) {
  const settings = useSiteSettings();
  const { user, isAdmin, loading } = useAuth();
  const identity = useIdentity();
  const logEvent = useServerFn(logContentEvent);
  const acceptTerms = useServerFn(acceptContentTerms);

  const [blurred, setBlurred] = useState(false);
  const [alarm, setAlarm] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [tick, setTick] = useState(0);
  const flips = useRef<number[]>([]);
  const alarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Per-area switches: lectures and the question bank can be protected independently. */
  const areaEnabled =
    context === "lectures"
      ? settings.protect_lectures !== false
      : ["quiz", "qbank", "exam", "question", "questions"].includes(context)
        ? settings.protect_qbank !== false
        : true;

  /** Deterrence + logging: everyone signed in, plus admins if local test mode is toggled. */
  const adminTestMode =
    typeof window !== "undefined" &&
    localStorage.getItem("aquaqbank-admin-test-protect") === "true";
  const active =
    settings.protect_enabled &&
    areaEnabled &&
    !!user &&
    (!isAdmin || adminTestMode) &&
    !loading;
  /** The watermark itself is shown to admins too. */
  const watermarked =
    settings.protect_enabled && areaEnabled && !!user && !loading && !!identity;

  const log = useCallback(
    (kind: string, meta: Record<string, unknown> = {}) => {
      if (!active) return;
      void logEvent({ data: { kind, context, meta } }).catch(() => {});
    },
    [active, context, logEvent],
  );

  const raiseAlarm = useCallback(
    (message: string, kind: string) => {
      setAlarm(message);
      setBlurred(true);
      log(kind);
      if (alarmTimer.current) clearTimeout(alarmTimer.current);
      alarmTimer.current = setTimeout(() => {
        setAlarm(null);
        setBlurred(false);
      }, 3500);
    },
    [log],
  );

  // Agreement: shared by every protected block on the page, remembered per user and per consentScope
  const { value: consented, markAgreed } = useSharedConsent(
    user?.id ?? null,
    consentScope,
    Boolean(active && settings.protect_consent_required && user),
  );

  // Watermark redraw ticker — deleting the layer in devtools also blanks content.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [active]);

  // Capture deterrence
  useEffect(() => {
    if (!active) return;

    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const isPrintScreen = k === "PrintScreen" || k === "F13";
      const snip = (e.metaKey || e.ctrlKey) && e.shiftKey && ["3", "4", "5", "S", "s"].includes(k);
      if (isPrintScreen || snip) {
        e.preventDefault();
        raiseAlarm("Screenshot attempt recorded", "screenshot_attempt");
        try {
          const code = identity?.code ?? "";
          const msg = `Protected content — captured by ${identity?.username || identity?.name || "user"} (${code}). This attempt was logged.`;
          void navigator.clipboard?.writeText(injectZeroWidthFingerprint(msg, code));
        } catch {
          /* clipboard not permitted */
        }
      }
      if ((e.metaKey || e.ctrlKey) && (k === "p" || k === "P") && settings.protect_block_print) {
        e.preventDefault();
        raiseAlarm("Printing is disabled and this attempt was recorded", "print_attempt");
      }
      if ((e.metaKey || e.ctrlKey) && (k === "c" || k === "C") && settings.protect_block_copy) {
        log("copy_attempt");
      }
      if (k === "F12" && settings.protect_devtools_guard) {
        e.preventDefault();
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (settings.protect_blur_on_blur) setBlurred(true);
      } else if (settings.protect_blur_on_blur) {
        setBlurred(false);
      }
    };

    const onBlur = () => {
      if (settings.protect_blur_on_blur) setBlurred(true);
    };
    const onFocus = () => setBlurred(false);

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      setAlarm("Right-click is disabled on protected content");
      if (alarmTimer.current) clearTimeout(alarmTimer.current);
      alarmTimer.current = setTimeout(() => setAlarm(null), 2000);
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!settings.protect_block_copy) return;
      e.preventDefault();
      const code = identity?.code ?? "";
      const msg = `Copying is disabled. Traced to ${identity?.username || identity?.name || "user"} (${code}).`;
      e.clipboardData?.setData("text/plain", injectZeroWidthFingerprint(msg, code));
      log("copy_attempt");
    };

    const onBeforePrint = () => {
      if (settings.protect_block_print) log("print_attempt");
    };

    window.addEventListener("keyup", onKey, true);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    window.addEventListener("beforeprint", onBeforePrint);

    return () => {
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      window.removeEventListener("beforeprint", onBeforePrint);
      if (alarmTimer.current) clearTimeout(alarmTimer.current);
    };
  }, [active, settings, identity, log, raiseAlarm]);

  // Screen sharing / recording detection
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getDisplayMedia) return;
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (...args: any[]) => {
      raiseAlarm("Screen recording detected and recorded against your account", "screen_share");
      return original(...(args as [any]));
    };
    return () => {
      navigator.mediaDevices.getDisplayMedia = original;
    };
  }, [active, raiseAlarm]);

  // Rapid page flipping (someone photographing everything)
  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    flips.current = [...flips.current.filter((t) => now - t < 60_000), now];
    if (flips.current.length >= 25) {
      flips.current = [];
      log("rapid_flip", { window: "60s" });
    }
  }, [active, context, log]);

  async function accept() {
    if (!checked) return;
    await acceptTerms({ data: { scope: consentScope } });
    markAgreed();
  }

  if (!active && !watermarked) return <>{children}</>;

  const opacity = Math.min(Math.max(settings.protect_watermark_opacity ?? 0.1, 0.02), 1);
  const terms = settings.protect_terms_en?.trim() || DEFAULT_TERMS_EN;

  if (active && settings.protect_consent_required && consented === false) {
    return (
      <div className="min-h-[70vh] grid place-items-center px-4 py-12">
        <div
          className="w-full max-w-lg rounded-3xl border-2 border-border bg-card p-6 md:p-8"
          style={{ boxShadow: "0 6px 0 var(--border)" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-destructive/10 text-destructive px-3 py-1 text-[11px] font-black uppercase tracking-widest">
            <ShieldAlert size={13} /> Protected content
          </div>
          <h2 className="mt-4 font-display font-black text-2xl md:text-3xl text-foreground">
            This material is watermarked with your identity
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{terms}</p>
          <div className="mt-4 rounded-2xl bg-muted/50 border border-border p-3 text-xs font-bold text-foreground">
            <div className="flex items-center gap-2">
              <Fingerprint size={14} className="text-primary" />
              Your trace code: <span className="font-mono">{identity?.code}</span>
            </div>
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              I understand that every page I open is traced to my account, and that sharing any
              screenshot permanently bans me without a refund.
            </span>
          </label>
          <button
            onClick={accept}
            disabled={!checked}
            className="btn-chunky mt-5 w-full justify-center disabled:opacity-40"
          >
            I agree — open the content
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${active ? "protected-content select-none" : ""} ${className}`}
      data-protected="true"
    >

      <div
        className={`relative z-10 ${className}`}
        style={{ filter: blurred ? "blur(14px)" : undefined, transition: "filter 120ms" }}
      >
        {children}
      </div>

      {/* invisible steganography DOM trap */}
      {identity?.code && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-[9999px] top-0 select-text text-[0px] opacity-0"
        >
          {encodeZeroWidth(identity.code)}
        </span>
      )}

      {/* forensic watermark layers (adaptive light & dark) */}
      {watermarked && (
        <>
          {/* Light-theme dense watermark */}
          <div
            key={`light-${tick}`}
            aria-hidden
            className={`pointer-events-none absolute inset-0 block dark:hidden [html[data-theme='golden-age']_&]:hidden [html[data-theme='desert-night']_&]:hidden ${scope === "card" ? "z-20" : "z-30"}`}
            style={{
              backgroundImage: tiledWatermark(identity!, opacity, tick, false),
              backgroundRepeat: "repeat",
            }}
          />
          {/* Dark/Heritage-theme dense watermark with high-contrast bright text */}
          <div
            key={`dark-${tick}`}
            aria-hidden
            className={`pointer-events-none absolute inset-0 hidden dark:block [html[data-theme='golden-age']_&]:block [html[data-theme='desert-night']_&]:block ${scope === "card" ? "z-20" : "z-30"}`}
            style={{
              backgroundImage: tiledWatermark(identity!, opacity, tick, true),
              backgroundRepeat: "repeat",
            }}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 ${scope === "card" ? "z-20" : "z-30"}`}
            style={{
              backgroundImage: fingerprintPattern(identity?.code ?? "00000000"),
              backgroundRepeat: "repeat",
            }}
          />
        </>
      )}

      {/* identity badge */}
      {watermarked &&
        (scope === "page" ? (
          <div className="pointer-events-none fixed bottom-3 left-3 z-40 rounded-full bg-foreground/85 text-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <Eye size={11} /> Watermarked · {identity?.username || identity?.name} · {identity?.code}
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-2 right-3 z-20 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {identity?.username} · {identity?.code}
          </div>
        ))}

      {blurred && !alarm && (
        <div className="absolute inset-0 z-40 grid place-items-center">
          <div className="rounded-2xl bg-card border-2 border-border px-5 py-4 text-center">
            <Lock size={18} className="mx-auto text-primary" />
            <p className="mt-2 text-sm font-black text-foreground">Content hidden while you are away</p>
            <p className="text-xs text-muted-foreground">Click back on the page to continue.</p>
          </div>
        </div>
      )}

      {alarm && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-destructive/95 px-6 text-center">
          <div>
            <ShieldAlert size={44} className="mx-auto text-white" />
            <h3 className="mt-4 font-display font-black text-2xl md:text-4xl text-white">{alarm}</h3>
            <p className="mt-3 text-white/90 font-bold">
              {identity?.name || identity?.username} · {identity?.email} · code {identity?.code}
            </p>
            <p className="mt-2 text-white/80 text-sm max-w-md mx-auto">
              This event has been sent to the administrators with your IP address and device.
              Repeated attempts lock your account permanently.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}