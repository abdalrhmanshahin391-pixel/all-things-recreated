import { ShieldCheck, Star } from "lucide-react";

const LABEL = "Committee";
const HEAD_LABEL = "Committee Head";

/**
 * Red committee badge shown next to a committee member's name/avatar.
 * `dot` collapses to a single shield on very small screens so the header
 * never wraps on a phone.
 */
export function CommitteeBadge({
  size = "sm",
  dot,
  head,
  label: customLabel,
  isAr,
  className = "",
}: {
  size?: "sm" | "md";
  dot?: boolean;
  head?: boolean;
  label?: string;
  isAr?: boolean;
  className?: string;
}) {
  const defaultLabel = isAr
    ? head
      ? "رئيس لجنة الطب والجراحة"
      : "لجنة الطب والجراحة"
    : head
    ? "Committee Head"
    : "Committee";
  const label = customLabel || defaultLabel;
  const isArabicText = /[\u0600-\u06FF]/.test(label);
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
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold committee-chip ${pad} ${className}`}
    >
      <Icon size={size === "md" ? 13 : 11} />
      <span dir={isArabicText ? "rtl" : undefined}>{label}</span>
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
