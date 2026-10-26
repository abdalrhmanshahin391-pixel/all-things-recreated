import { useEffect, useState } from "react";
import { Library, Sparkles, X } from "lucide-react";
import { switchCommitteeVersion, useCommitteeVersion, type CommitteeVersion } from "@/lib/committee-version";

const SEEN_KEY = "aqua-summaries-cloud-seen";

/**
 * The switch between the university resources page and the AQUA version. Looks the same on both.
 * On the university page the AQUA button glows, and a small cloud above it invites students to try the Aqua
 * summaries. The cloud goes away for good once the student has opened the AQUA version (or closed the cloud).
 */
export function VersionSwitch({ className = "" }: { className?: string }) {
  const { version } = useCommitteeVersion();
  const [cloud, setCloud] = useState(false);

  useEffect(() => {
    try {
      setCloud(localStorage.getItem(SEEN_KEY) !== "1");
    } catch {
      setCloud(true);
    }
  }, []);

  const markSeen = () => {
    setCloud(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode: the cloud simply shows again next visit */
    }
  };

  const go = (next: CommitteeVersion, e: React.MouseEvent<HTMLElement>) => {
    if (next === "aqua") markSeen();
    const r = e.currentTarget.getBoundingClientRect();
    switchCommitteeVersion(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const onUniversity = version === "university";
  const showCloud = cloud && onUniversity;
  const base =
    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold tracking-wide transition-all sm:px-6";

  return (
    <div className={`relative inline-flex ${showCloud ? "pt-16 sm:pt-[4.5rem]" : ""}`}>
      <style>{`
        @keyframes aqua-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(217,160,43,.38); }
                                50% { box-shadow: 0 0 0 7px rgba(217,160,43,0); } }
        @keyframes aqua-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes aqua-shine { 0% { transform: translateX(-120%) skewX(-18deg); } 60%,100% { transform: translateX(260%) skewX(-18deg); } }
        .aqua-glow { animation: aqua-glow 2.2s ease-in-out infinite; }
        .aqua-float { animation: aqua-float 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .aqua-glow, .aqua-float { animation: none; } }
      `}</style>

      {showCloud ? (
        <div
          role="status"
          className="aqua-float absolute bottom-[3.5rem] right-0 z-10 w-max max-w-[min(17rem,calc(100vw-2rem))] sm:bottom-[3.9rem]"
        >
          <div className="relative rounded-xl border border-[color:var(--gold)]/50 bg-card px-4 py-2.5 pr-8 text-center shadow-[0_18px_40px_-20px_rgba(15,27,61,0.55)]">
            <button
              type="button"
              aria-label="Close"
              onClick={markSeen}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
            <button type="button" onClick={(e) => go("aqua", e)} className="block w-full text-center">
              <span dir="rtl" className="block text-sm font-bold leading-snug text-foreground sm:text-base">
                جرّب تلاخيص أكوا
              </span>
              <span className="block text-xs font-semibold text-[color:var(--primary)] sm:text-sm">Try the Aqua summaries</span>
            </button>
            {/* the tail of the cloud, pointing down at the AQUA button */}
            <span
              aria-hidden
              className="absolute -bottom-[7px] right-12 h-3.5 w-3.5 rotate-45 border-b border-r border-[color:var(--gold)]/50 bg-card"
            />
          </div>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Committee version"
        className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1 ${className}`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={version === "university"}
          onClick={(e) => go("university", e)}
          className={`${base} ${
            onUniversity ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Library size={16} strokeWidth={1.9} /> University
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={version === "aqua"}
          onClick={(e) => go("aqua", e)}
          className={`${base} relative overflow-hidden ${
            version === "aqua"
              ? "bg-primary text-primary-foreground shadow"
              : "aqua-glow bg-[color:var(--gold)]/15 text-primary ring-1 ring-[color:var(--gold)]/55 hover:bg-[color:var(--gold)]/25"
          }`}
        >
          <Sparkles size={16} strokeWidth={1.9} className={version === "aqua" ? "" : "text-[color:var(--gold)]"} /> AQUA version
        </button>
      </div>
    </div>
  );
}
