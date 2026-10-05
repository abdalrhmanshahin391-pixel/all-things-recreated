import { Library, Sparkles } from "lucide-react";
import { useCommitteeVersion } from "@/lib/committee-version";

/** The switch between the university resources page and the AQUA version. Looks the same on both. */
export function VersionSwitch({ className = "" }: { className?: string }) {
  const { version, setVersion } = useCommitteeVersion();
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition-all";
  return (
    <div
      role="tablist"
      aria-label="Committee version"
      className={`inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm ${className}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={version === "university"}
        onClick={() => setVersion("university")}
        className={`${base} ${
          version === "university" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Library size={14} /> University
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={version === "aqua"}
        onClick={() => setVersion("aqua")}
        className={`${base} ${
          version === "aqua" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sparkles size={14} /> AQUA version
      </button>
    </div>
  );
}