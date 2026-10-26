/** Free-form decorative tags shown on university cards. They never gate access. */
export type UniversityTag = {
  label_en: string;
  label_ar?: string;
  color?: string;
};

export const TAG_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  // Redesign palette: navy, gold and warm neutrals (the names stay so saved tags keep working)
  emerald: { bg: "#E6EBF3", fg: "#13294B", border: "#C5D0E3" },
  amber: { bg: "#F8EBCB", fg: "#6F4E0E", border: "#E3C877" },
  rose: { bg: "#F4E4DF", fg: "#7A2E2A", border: "#E2BFB6" },
  indigo: { bg: "#DDE5F4", fg: "#1D3868", border: "#B5C6E6" },
  sky: { bg: "#E3EEF6", fg: "#1F4E79", border: "#BBD4E8" },
  slate: { bg: "#ECEAE3", fg: "#2B3445", border: "#D7D3C6" },
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
