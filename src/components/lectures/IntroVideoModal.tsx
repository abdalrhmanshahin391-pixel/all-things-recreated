import { X } from "lucide-react";
import { useEffect } from "react";

export function IntroVideoModal({
  src,
  title,
  onClose,
}: {
  src: string | null;
  title?: string;
  onClose: () => void;
}) {
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

  let embedSrc = src;
  if (isYouTube) {
    const id =
      src.match(/[?&]v=([^&]+)/)?.[1] ??
      src.match(/youtu\.be\/([^?]+)/)?.[1] ??
      "";
    embedSrc = id ? `https://www.youtube.com/embed/${id}?autoplay=1` : src;
  } else if (isVimeo) {
    const id = src.match(/vimeo\.com\/(\d+)/)?.[1] ?? "";
    embedSrc = id ? `https://player.vimeo.com/video/${id}?autoplay=1` : src;
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-foreground/70 backdrop-blur-sm p-4 md:p-10"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 h-10 w-10 grid place-items-center rounded-full bg-background/90 hover:bg-background text-foreground border border-border"
        aria-label="Close"
      >
        <X size={18} />
      </button>
      <div
        className="relative w-full max-w-6xl aspect-video rounded-lg overflow-hidden border border-border shadow-[var(--shadow-card)] bg-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {isYouTube || isVimeo ? (
          <iframe
            src={embedSrc}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            title={title ?? "Video"}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
      {title && (
        <div className="mt-3 text-center text-sm text-background/80 max-w-2xl">
          {title}
        </div>
      )}
    </div>
  );
}
