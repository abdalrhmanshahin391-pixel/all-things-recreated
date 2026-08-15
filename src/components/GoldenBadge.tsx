import { Crown } from "lucide-react";

/**
 * Gold "Golden" badge shown next to a Golden member's name/avatar.
 * `dot` collapses to a single gem on very small screens so the header
 * never wraps on a phone.
 */
export function GoldenBadge({
  size = "sm",
  dot,
  className = "",
}: {
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  if (dot) {
    return (
      <span
        title="Golden member"
        aria-label="Golden member"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] golden-chip ${className}`}
      >
        <Crown size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title="Golden member"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-black uppercase tracking-[0.14em] golden-chip ${pad} ${className}`}
    >
      <Crown size={size === "md" ? 13 : 11} />
      Golden
    </span>
  );
}

/** Same badge, but only rendered for the signed-in user when they are Golden. */
export function GoldenBadgeResponsive({ className = "" }: { className?: string }) {
  return (
    <>
      <GoldenBadge className={`hidden sm:inline-flex ${className}`} />
      <GoldenBadge dot className={`sm:hidden ${className}`} />
    </>
  );
}
