import { ShieldCheck } from "lucide-react";

const LABEL = "لجنة الطب والجراحة";

/**
 * Red committee badge shown next to a committee member's name/avatar.
 * `dot` collapses to a single shield on very small screens so the header
 * never wraps on a phone.
 */
export function CommitteeBadge({
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
        title={LABEL}
        aria-label={LABEL}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full committee-chip ${className}`}
      >
        <ShieldCheck size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={LABEL}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold committee-chip ${pad} ${className}`}
    >
      <ShieldCheck size={size === "md" ? 13 : 11} />
      <span dir="rtl">{LABEL}</span>
    </span>
  );
}

/** Full badge on tablet and up, compact shield on phones. */
export function CommitteeBadgeResponsive({ className = "" }: { className?: string }) {
  return (
    <>
      <CommitteeBadge className={`hidden md:inline-flex ${className}`} />
      <CommitteeBadge dot className={`md:hidden ${className}`} />
    </>
  );
}
