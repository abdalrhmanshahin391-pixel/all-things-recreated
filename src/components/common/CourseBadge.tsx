export const BADGE_PRESETS: { label: string; color: string }[] = [
  { label: "NEW", color: "#58cc02" },
  { label: "HOT OFFER", color: "#f43f5e" },
  { label: "MOST WANTED", color: "#f59e0b" },
  { label: "LIMITED", color: "#8b5cf6" },
  { label: "FREE", color: "#1cb0f6" },
];

export function badgeIsLive(expires?: string | null) {
  if (!expires) return true;
  return new Date(expires).getTime() > Date.now();
}

/** Chunky attention badge shown on the corner of a course card. */
export function CourseBadge({
  label,
  color,
  expiresAt,
}: {
  label?: string | null;
  color?: string | null;
  expiresAt?: string | null;
}) {
  if (!label || !badgeIsLive(expiresAt)) return null;
  const c = color || "#f43f5e";
  return (
    <span
      className="course-badge absolute top-2.5 left-2.5 z-10 inline-flex items-center overflow-hidden text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white"
      style={{ background: c, boxShadow: `0 2px 0 color-mix(in oklab, ${c} 70%, black)` }}
    >
      {label}
    </span>
  );
}