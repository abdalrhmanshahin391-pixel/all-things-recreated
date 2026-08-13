import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function CommitteeDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card text-foreground rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)" }}
        >
          <h3 className="font-black text-base">{title}</h3>
          <button onClick={onClose} className="hover:bg-white/20 rounded-full p-1">
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
  "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-bold text-sm shadow-md hover:opacity-90 disabled:opacity-50 w-full";

export const primaryBtnStyle = {
  background: "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)",
};
