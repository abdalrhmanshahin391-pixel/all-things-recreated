import { X, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export function IntroVideoModal({
  src,
  title,
  onClose,
  watermark = false,
}: {
  src: string | null;
  title?: string;
  onClose: () => void;
  watermark?: boolean;
}) {
  const { user, profile } = useAuth();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

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
      className="fixed inset-0 z-[100] grid place-items-center bg-foreground/70 backdrop-blur-sm p-4 md:p-10 select-none"
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
        className="relative w-full max-w-6xl aspect-video rounded-xl overflow-hidden border border-border shadow-[var(--shadow-card)] bg-black"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isYouTube || isVimeo || isDrive ? (
          <iframe
            src={embedSrc}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
            title={title ?? "Video"}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            controlsList="nodownload"
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

        {/* Forensic Watermark Overlay across the video (only for enrolled lecture videos) */}
        {watermark && (
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
        )}
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
