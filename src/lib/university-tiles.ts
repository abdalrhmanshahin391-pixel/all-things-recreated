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
  FileQuestionMark,
  ClipboardList,
  ListChecks,
  ClipboardCheck,
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
  FileQuestionMark,
  ClipboardList,
  ListChecks,
  ClipboardCheck,
};

export const TILE_ICON_NAMES = Object.keys(TILE_ICONS);

export function tileIcon(name: string, kind?: TileKind): LucideIcon {
  // The Questions Bank card used to carry a book (then a question-mark page, then a checklist); a clipboard with a tick reads as an exam paper.
  if (kind === "courses" && (name === "BookOpen" || name === "FileQuestionMark" || name === "ListChecks")) return ClipboardCheck;
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
    icon: "ClipboardCheck",
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
