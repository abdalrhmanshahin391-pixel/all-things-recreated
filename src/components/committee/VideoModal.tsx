import { X, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function VideoModal({
  src,
  title,
  openUrl,
  onClose,
}: {
  src: string | null;
  title?: string;
  openUrl?: string | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    function onFs() {
      setIsFull(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      /* ignore */
    }
  }

  if (!src || !mounted) return null;

  // Google Drive file viewer
  const isDriveFile = /drive\.google\.com\/file\/d\//.test(src);
  const driveFileId = isDriveFile ? src.match(/\/d\/([^/?]+)/)?.[1] : null;
  const embedSrc = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : src;

  const isYouTube = /youtube\.com|youtu\.be/.test(src);
  const isVimeo = /vimeo\.com/.test(src);
  const isIframe = isDriveFile || isYouTube || isVimeo;

  let iframeSrc = embedSrc;
  if (isYouTube) {
    const id =
      src.match(/[?&]v=([^&]+)/)?.[1] ??
      src.match(/youtu\.be\/([^?]+)/)?.[1] ??
      "";
    iframeSrc = id ? `https://www.youtube.com/embed/${id}?autoplay=1` : src;
  } else if (isVimeo) {
    const id = src.match(/vimeo\.com\/(\d+)/)?.[1] ?? "";
    iframeSrc = id ? `https://player.vimeo.com/video/${id}?autoplay=1` : src;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/25 p-3" onClick={onClose}>
      <div
        ref={containerRef}
        className="w-full max-w-3xl rounded-xl overflow-hidden border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
          <span className="flex-1 min-w-0 truncate text-sm font-bold text-foreground">
            {title ?? "Video"}
          </span>
          <button
            onClick={toggleFullscreen}
            className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label={isFull ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {openUrl && (
            <button
              onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
              className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Open in new tab"
            >
              <ExternalLink size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="relative w-full aspect-video bg-foreground">
          {isIframe ? (
            <iframe
              src={iframeSrc}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
              title={title ?? "Video"}
            />
          ) : (
            <video src={src} controls autoPlay className="absolute inset-0 h-full w-full" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
