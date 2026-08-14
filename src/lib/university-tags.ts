/** Free-form decorative tags shown on university cards. They never gate access. */
export type UniversityTag = {
  label_en: string;
  label_ar?: string;
  color?: string;
};

export const TAG_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  emerald: { bg: "#dcfce7", fg: "#065f46", border: "#86efac" },
  amber: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  rose: { bg: "#ffe4e6", fg: "#9f1239", border: "#fda4af" },
  indigo: { bg: "#e0e7ff", fg: "#3730a3", border: "#a5b4fc" },
  sky: { bg: "#e0f2fe", fg: "#075985", border: "#7dd3fc" },
  slate: { bg: "#e2e8f0", fg: "#1e293b", border: "#cbd5e1" },
};

export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS);

export function tagStyle(color?: string) {
  const c = TAG_COLORS[color ?? "emerald"] ?? TAG_COLORS.emerald!;
  return { background: c.bg, color: c.fg, borderColor: c.border };
}

/** Safely read the jsonb column coming back from the database. */
export function parseTags(value: unknown): UniversityTag[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      label_en: String(t.label_en ?? "").trim(),
      label_ar: typeof t.label_ar === "string" ? t.label_ar : "",
      color: typeof t.color === "string" ? t.color : "emerald",
    }))
    .filter((t) => t.label_en.length > 0);
}

export function tagLabel(tag: UniversityTag, lang: string) {
  if (lang === "ar") return (tag.label_ar || "").trim() || tag.label_en;
  return tag.label_en;
}
