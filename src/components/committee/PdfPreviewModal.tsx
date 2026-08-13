import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Full-screen in-site PDF viewer.
 * Uploaded files are signed on the fly; Drive files use the Drive preview page.
 */
export function PdfPreviewModal({
  title,
  filePath,
  driveWebLink,
  url,
  onClose,
}: {
  title: string;
  filePath?: string | null;
  driveWebLink?: string | null;
  url?: string | null;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (driveWebLink) {
        const preview = driveWebLink.replace(/\/view.*$/, "/preview");
        if (alive) setSrc(preview);
        return;
      }
      if (filePath) {
        const { data, error: err } = await supabase.storage
          .from("committee-files")
          .createSignedUrl(filePath, 3600);
        if (!alive) return;
        if (err || !data?.signedUrl) setError(err?.message ?? "Could not open this file");
        else setSrc(`${data.signedUrl}#toolbar=0`);
        return;
      }
      if (url && alive) setSrc(url);
    })();
    return () => {
      alive = false;
    };
  }, [filePath, driveWebLink, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="font-bold truncate flex-1 text-sm">{title}</span>
        {(driveWebLink || url) && (
          <a
            href={(driveWebLink || url) as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25"
          >
            Open <ExternalLink size={12} />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="grid place-items-center h-9 w-9 rounded-full bg-white/15 hover:bg-white/25"
          aria-label="Close preview"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-2">
        {error ? (
          <div className="h-full grid place-items-center text-sm text-white/80">{error}</div>
        ) : src ? (
          <iframe
            src={src}
            title={title}
            className="h-full w-full rounded-xl bg-white"
            allow="autoplay"
          />
        ) : (
          <div className="h-full grid place-items-center text-white/80">
            <Loader2 className="animate-spin" size={22} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
