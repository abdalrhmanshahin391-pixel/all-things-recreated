import {
  BookOpen,
  Video,
  Library,
  Sparkles,
  GraduationCap,
  FileText,
  FlaskConical,
  Stethoscope,
  Brain,
  Calendar,
  Download,
  Link as LinkIcon,
  Users,
  Trophy,
  Microscope,
  type LucideIcon,
} from "lucide-react";

export type TileKind = "courses" | "lectures" | "resources" | "custom";

export type UniversityTile = {
  id: string;
  university_id: string;
  kind: TileKind;
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  badge_en: string;
  badge_ar: string;
  icon: string;
  href: string;
  visible: boolean;
  highlighted: boolean;
  sort_order: number;
  locked?: boolean;
  lock_note_en?: string;
  lock_note_ar?: string;
  lock_color?: string;
};

/** Badge styles for a locked ("coming soon") card. */
export const LOCK_COLORS: Record<string, string> = {
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  teal: "bg-teal-100 text-teal-900 border-teal-300",
  rose: "bg-rose-100 text-rose-900 border-rose-300",
  indigo: "bg-indigo-100 text-indigo-900 border-indigo-300",
  slate: "bg-slate-200 text-slate-800 border-slate-300",
};

export const LOCK_COLOR_NAMES = Object.keys(LOCK_COLORS);

export function lockChip(color?: string | null) {
  return LOCK_COLORS[color ?? "amber"] ?? LOCK_COLORS.amber!;
}

/**
 * Soft colour wash used behind a hub card. Keeps the card readable on the dark
 * hero background while still carrying the tile's accent colour.
 */
export const TILE_WASHES: Record<string, string> = {
  amber:
    "border-amber-400/30 bg-[linear-gradient(150deg,rgba(251,191,36,0.22),rgba(180,83,9,0.10)_60%,transparent)] hover:border-amber-400/60",
  teal:
    "border-teal-400/30 bg-[linear-gradient(150deg,rgba(45,212,191,0.20),rgba(13,148,136,0.10)_60%,transparent)] hover:border-teal-400/60",
  rose:
    "border-rose-400/30 bg-[linear-gradient(150deg,rgba(251,113,133,0.20),rgba(190,18,60,0.10)_60%,transparent)] hover:border-rose-400/60",
  indigo:
    "border-indigo-400/30 bg-[linear-gradient(150deg,rgba(129,140,248,0.20),rgba(67,56,202,0.10)_60%,transparent)] hover:border-indigo-400/60",
  slate:
    "border-slate-400/25 bg-[linear-gradient(150deg,rgba(148,163,184,0.18),rgba(51,65,85,0.10)_60%,transparent)] hover:border-slate-300/50",
};

export function tileWash(color?: string | null) {
  return TILE_WASHES[color ?? "slate"] ?? TILE_WASHES.slate!;
}


export const TILE_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Video,
  Library,
  Sparkles,
  GraduationCap,
  FileText,
  FlaskConical,
  Stethoscope,
  Brain,
  Calendar,
  Download,
  Link: LinkIcon,
  Users,
  Trophy,
  Microscope,
};

export const TILE_ICON_NAMES = Object.keys(TILE_ICONS);

export function tileIcon(name: string): LucideIcon {
  return TILE_ICONS[name] ?? Sparkles;
}

export const BUILT_IN_TILE_LABEL: Record<TileKind, string> = {
  courses: "Courses card",
  lectures: "Lectures card",
  resources: "Resources card",
  custom: "Custom card",
};

/** Pick the right language, falling back to English when a translation is blank. */
export function pickText(en: string, ar: string, lang: string) {
  if (lang === "ar") return (ar || "").trim() || en;
  return en;
}

export const TILE_DEFAULTS: Record<
  Exclude<TileKind, "custom">,
  Pick<UniversityTile, "title_en" | "title_ar" | "subtitle_en" | "subtitle_ar" | "icon" | "href" | "highlighted">
> = {
  courses: {
    title_en: "Courses",
    title_ar: "الكورسات",
    subtitle_en: "Question banks · Year-by-year syllabus",
    subtitle_ar: "بنوك الأسئلة · منهج سنة بسنة",
    icon: "BookOpen",
    href: "/courses",
    highlighted: true,
  },
  lectures: {
    title_en: "Lectures",
    title_ar: "المحاضرات",
    subtitle_en: "Video lectures with quizzes",
    subtitle_ar: "محاضرات مصوّرة مع اختبارات",
    icon: "Video",
    href: "/lectures",
    highlighted: false,
  },
  resources: {
    title_en: "Resources",
    title_ar: "المصادر",
    subtitle_en: "Free books, past papers & study material",
    subtitle_ar: "كتب مجانية وأوراق سابقة ومواد دراسية",
    icon: "Library",
    href: "/committee",
    highlighted: true,
  },
};
