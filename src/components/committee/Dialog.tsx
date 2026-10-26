import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function CommitteeDialog({
  title,
  onClose,
  children,
  tone,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** "aqua": gold, purple and black, for the AQUA version of the committee page */
  tone?: "aqua";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto ${tone === "aqua" ? "aqua-theme" : ""}`}
      onClick={onClose}
    >
      <div
        className="bg-card text-foreground rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 text-foreground"
        >
          <h3 className="font-heading text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3 min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full px-3 py-2 border border-border bg-background text-foreground rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export const primaryBtn =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50";

export const primaryBtnStyle = {
  background: "var(--primary)",
  color: "var(--primary-foreground)",
};
