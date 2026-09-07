import { ShieldAlert } from "lucide-react";

/**
 * Bilingual legal notice shown at the top of protected areas
 * (lecture courses and the question bank).
 */
export function ProtectionNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3 ${className}`}
      role="note"
    >
      <ShieldAlert size={16} className="text-destructive mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-foreground">
          This content is protected, and publishing it may expose you to legal liability.
        </p>
        <p className="text-xs font-semibold text-foreground" dir="rtl" lang="ar">
          هذا المحتوى محمي، ونشره قد يعرضك للمساءلة القانونية.
        </p>
      </div>
    </div>
  );
}
