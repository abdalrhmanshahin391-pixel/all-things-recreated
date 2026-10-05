import { X, ShieldCheck, Maximize2, Minimize2, Play, Pause, Volume2, VolumeX } from "lucide-react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  // Our own control bar: the browser's thin bar is very hard to drag with a finger (iPad).
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const scrubbing = useRef(false);
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

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const skip = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s));
  };
  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrent(t);
  };
  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;

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
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            preload="auto"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onClick={togglePlay}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => {
              if (!scrubbing.current) setCurrent(e.currentTarget.currentTime);
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 h-full w-full cursor-pointer"
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

        <style>{`
          .aq-seek { -webkit-appearance: none; appearance: none; width: 100%; height: 40px; background: transparent; margin: 0; cursor: pointer; }
          .aq-seek::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: linear-gradient(to right, #fbbf24 var(--p), rgba(255,255,255,.35) var(--p)); }
          .aq-seek::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -11px; border-radius: 50%; background: #fff; border: 4px solid #fbbf24; box-shadow: 0 2px 8px rgba(0,0,0,.55); }
          .aq-seek::-moz-range-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,.35); }
          .aq-seek::-moz-range-progress { height: 8px; border-radius: 999px; background: #fbbf24; }
          .aq-seek::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 4px solid #fbbf24; box-shadow: 0 2px 8px rgba(0,0,0,.55); }
        `}</style>

        {/* Clear, labelled full-screen button (the frame goes fullscreen, so the watermark stays on screen) */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 left-3 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-black text-amber-950 shadow-lg ring-2 ring-white/70 hover:bg-amber-300 active:scale-95"
          aria-label={isFull ? "Exit full screen" : "Full screen"}
        >
          {isFull ? <Minimize2 size={20} strokeWidth={2.6} /> : <Maximize2 size={20} strokeWidth={2.6} />}
          {isFull ? "Exit full screen" : "Full screen"}
        </button>

        {/* Control bar for uploaded videos: big buttons and a big seek handle that a finger can grab */}
        {!(isYouTube || isVimeo || isDrive) && (
          <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-3 pt-10" onClick={(e) => e.stopPropagation()}>
            <input
              type="range"
              className="aq-seek"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(current, duration || 0)}
              style={{ ["--p" as string]: `${pct}%` }}
              onPointerDown={() => { scrubbing.current = true; }}
              onPointerUp={() => { scrubbing.current = false; }}
              onPointerCancel={() => { scrubbing.current = false; }}
              onTouchStart={() => { scrubbing.current = true; }}
              onTouchEnd={() => { scrubbing.current = false; }}
              onChange={(e) => seekTo(Number(e.target.value))}
            />
            <div className="mt-1 flex items-center gap-2 text-white">
              <button onClick={togglePlay} aria-label={paused ? "Play" : "Pause"} className="grid h-11 w-11 place-items-center rounded-full bg-white/20 hover:bg-white/30 active:scale-95">
                {paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
              </button>
              <button onClick={() => skip(-10)} className="h-11 rounded-full bg-white/20 px-3.5 text-sm font-black hover:bg-white/30 active:scale-95" aria-label="Back 10 seconds">
                −10s
              </button>
              <button onClick={() => skip(10)} className="h-11 rounded-full bg-white/20 px-3.5 text-sm font-black hover:bg-white/30 active:scale-95" aria-label="Forward 10 seconds">
                +10s
              </button>
              <span className="ml-1 font-mono text-xs tabular-nums text-white/90">{fmt(current)} / {fmt(duration)}</span>
              <span className="flex-1" />
              <button
                onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/20 hover:bg-white/30 active:scale-95"
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>
        )}

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
