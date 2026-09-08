import { Languages, Loader2 } from "lucide-react";

export function ArabicToggle({
  on,
  onToggle,
  loading,
  error,
  className = "",
}: {
  on: boolean;
  onToggle: () => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors ${
          on
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
        {on ? "English" : "العربية / Arabic"}
      </button>
      {error && <span className="text-[11px] text-rose-600 font-semibold">{error}</span>}
    </div>
  );
}
