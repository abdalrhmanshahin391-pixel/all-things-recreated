import { CheckSquare } from "lucide-react";

/**
 * Special badge for QA Reviewers.
 * Crisp emerald/teal styling indicating Quality Assurance clearance.
 */
export function QaBadge({
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
        title="QA Reviewer"
        aria-label="QA Reviewer"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full qa-chip ${className}`}
      >
        <CheckSquare size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title="QA Reviewer"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-black uppercase tracking-[0.14em] qa-chip ${pad} ${className}`}
    >
      <CheckSquare size={size === "md" ? 13 : 11} />
      QA
    </span>
  );
}

/** Full badge on tablet and up, compact chip on phones. */
export function QaBadgeResponsive({ className = "" }: { className?: string }) {
  return (
    <>
      <QaBadge className={`hidden sm:inline-flex ${className}`} />
      <QaBadge dot className={`sm:hidden ${className}`} />
    </>
  );
}
