import { ShieldCheck, Star } from "lucide-react";

const LABEL = "لجنة الطب والجراحة";
const HEAD_LABEL = "رئيس لجنة الطب والجراحة";

/**
 * Red committee badge shown next to a committee member's name/avatar.
 * `dot` collapses to a single shield on very small screens so the header
 * never wraps on a phone.
 */
export function CommitteeBadge({
  size = "sm",
  dot,
  head,
  className = "",
}: {
  size?: "sm" | "md";
  dot?: boolean;
  head?: boolean;
  className?: string;
}) {
  const label = head ? HEAD_LABEL : LABEL;
  const Icon = head ? Star : ShieldCheck;
  if (dot) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full committee-chip ${className}`}
      >
        <Icon size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold committee-chip ${pad} ${className}`}
    >
      <Icon size={size === "md" ? 13 : 11} />
      <span dir="rtl">{label}</span>
    </span>
  );
}

/** Full badge on tablet and up, compact shield on phones. */
export function CommitteeBadgeResponsive({ className = "", head }: { className?: string; head?: boolean }) {
  return (
    <>
      <CommitteeBadge head={head} className={`hidden md:inline-flex ${className}`} />
      <CommitteeBadge head={head} dot className={`md:hidden ${className}`} />
    </>
  );
}
