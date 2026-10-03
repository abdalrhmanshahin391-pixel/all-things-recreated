import { X, ShieldCheck, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function IntroVideoModal({
  src,
  title,
  onClose,
}: {
  src: string | null;
  title?: string;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const frameRef = useRef<HTMLDivElement>(null);
  // Fullscreen is done on the frame that holds the watermark, never on the video itself, so the watermark stays on screen.
  const [nativeFull, setNativeFull] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);
  const isFull = nativeFull || pseudoFull;
  // The watermark hops to a new spot now and then so it cannot be cropped out of a recording.
  const [spot, setSpot] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSpot((s) => (s + 1) % 4), 15000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onFs = () => setNativeFull(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    const el = frameRef.current;
    if (!el) return;
    if (isFull) {
      setPseudoFull(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else setPseudoFull(true); // iPhone Safari cannot fullscreen a div: fill the screen with CSS instead
    } catch {
      setPseudoFull(true);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pseudoFull) setPseudoFull(false);
      else if (!document.fullscreenElement) onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, pseudoFull]);

  if (!src) return null;

  const isYouTube = /youtube\.com|youtu\.be/.test(src);
  const isVimeo = /vimeo\.com/.test(src);
  const driveMatch =
    src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    src.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/) ||
    src.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/) ||
    src.match(/docs\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  const isDrive = !!driveMatch;

  let embedSrc = src;
  if (isDrive && driveMatch) {
    const driveId = driveMatch[1];
    embedSrc = `https://drive.google.com/file/d/${driveId}/preview`;
  } else if (isYouTube) {
    const id =
      src.match(/[?&]v=([^&]+)/)?.[1] ??
      src.match(/youtu\.be\/([^?]+)/)?.[1] ??
      "";
    embedSrc = id ? `https://www.youtube.com/embed/${id}?autoplay=1` : src;
  } else if (isVimeo) {
    const id = src.match(/vimeo\.com\/(\d+)/)?.[1] ?? "";
    embedSrc = id ? `https://player.vimeo.com/video/${id}?autoplay=1` : src;
  }

  const watermarkText = user
    ? `${profile?.full_name || profile?.username || user.email || "Student"}${
        profile?.phone ? ` • ${profile.phone}` : ""
      } • ${user.id.slice(0, 8)}`
    : "AquaQBank • Protected Content";

  return (
    <div
      // No backdrop blur here: a blurred ancestor makes browsers stall the video while it is fullscreen.
      className="fixed inset-0 z-[100] grid place-items-center bg-foreground/80 p-4 md:p-10 select-none"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 h-10 w-10 grid place-items-center rounded-full bg-background/90 hover:bg-background text-foreground border border-border shadow-md z-[110]"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <div
        ref={frameRef}
        className={
          isFull
            ? "fixed inset-0 z-[120] h-full w-full overflow-hidden bg-black"
            : "relative w-full max-w-6xl aspect-video rounded-xl overflow-hidden border border-border shadow-[var(--shadow-card)] bg-black"
        }
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isYouTube || isVimeo || isDrive ? (
          <iframe
            src={embedSrc}
            allow="autoplay; encrypted-media"
            className="absolute inset-0 h-full w-full border-0"
            title={title ?? "Video"}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            preload="auto"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 h-full w-full"
          />
        )}

        {/* Protection shield over Drive's top-right "Pop-out / Open in new window" button */}
        {isDrive && (
          <div
            className="absolute top-0 right-0 w-28 h-16 z-30 pointer-events-auto bg-transparent cursor-default"
            title="Protected Video"
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        <button
          onClick={toggleFullscreen}
          className="absolute top-2 left-2 z-40 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
          aria-label={isFull ? "Exit full screen" : "Full screen"}
        >
          {isFull ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* A second badge that moves between the corners */}
        <div
          className="absolute z-20 pointer-events-none select-none rounded bg-black/20 px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold text-white/45 whitespace-nowrap"
          style={{ top: spot < 2 ? "18%" : "74%", left: spot % 2 === 0 ? "6%" : undefined, right: spot % 2 === 1 ? "6%" : undefined }}
          aria-hidden="true"
        >
          {watermarkText}
        </div>

        {/* Forensic Watermark Overlay across the video */}
        <div
          className="absolute inset-0 pointer-events-none select-none z-20 overflow-hidden flex flex-col justify-around py-4"
          aria-hidden="true"
        >
          <div className="flex justify-around opacity-20 text-[11px] sm:text-xs font-mono font-bold text-white -rotate-12 tracking-widest whitespace-nowrap">
            <span>{watermarkText}</span>
            <span className="hidden sm:inline">{watermarkText}</span>
          </div>
          <div className="flex justify-around opacity-25 text-[11px] sm:text-xs font-mono font-bold text-white -rotate-12 tracking-widest whitespace-nowrap">
            <span className="hidden sm:inline">{watermarkText}</span>
            <span>{watermarkText}</span>
          </div>
          <div className="flex justify-around opacity-20 text-[11px] sm:text-xs font-mono font-bold text-white -rotate-12 tracking-widest whitespace-nowrap">
            <span>{watermarkText}</span>
            <span className="hidden sm:inline">{watermarkText}</span>
          </div>
        </div>
      </div>

      {title && (
        <div className="mt-3 text-center text-sm font-medium text-background/90 max-w-2xl px-4 flex items-center justify-center gap-2">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>{title}</span>
        </div>
      )}
    </div>
  );
}
