import { COLORS, type ColorKey } from "@/lib/committee-meta";

export const TAG_COLOR_KEYS: ColorKey[] = ["amber", "rose", "teal", "indigo", "mint", "violet", "sky", "orange"];

export function tagChipClass(color?: string | null) {
  const c = COLORS[(color as ColorKey)] ?? COLORS.amber;
  return c.chip;
}

export function SubjectTag({
  label,
  color,
  className = "",
}: {
  label?: string | null;
  color?: string | null;
  className?: string;
}) {
  const text = (label ?? "").trim();
  if (!text) return null;
  return (
    <span
      className={`inline-flex items-center max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ring-current/20 ${tagChipClass(color)} ${className}`}
      title={text}
    >
      {text}
    </span>
  );
}
