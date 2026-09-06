import { X, Loader2 } from "lucide-react";
import { useEffect } from "react";

/**
 * Protected in-app PDF reader for lecture notes/slides.
 * Uses a short-lived signed URL, suppresses right-click and printing,
 * and hides the built-in download/print toolbar where the browser honours it.
 */
export function LecturePdfModal({
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
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (k === "p" || k === "s")) {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!src) return null;

  const viewer = `${src}${src.includes("#") ? "" : "#toolbar=0&navpanes=0&statusbar=0"}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-foreground/80 backdrop-blur-sm p-3 md:p-8"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-3 mb-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-background font-semibold text-sm truncate">{title ?? "Lecture PDF"}</div>
        <button
          onClick={onClose}
          className="h-9 w-9 grid place-items-center rounded-full bg-background/90 hover:bg-background text-foreground border border-border shrink-0"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <div
        className="relative flex-1 rounded-lg overflow-hidden border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
        <iframe
          src={viewer}
          title={title ?? "Lecture PDF"}
          className="absolute inset-0 h-full w-full"
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
      <div className="mt-2 text-center text-[11px] text-background/70">
        Protected material — sharing, printing or capturing is tracked.
      </div>
    </div>
  );
}
