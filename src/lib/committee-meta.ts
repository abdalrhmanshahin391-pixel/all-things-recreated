import {
  Activity,
  Baby,
  Bone,
  BookOpen,
  Brain,
  Bug,
  ClipboardList,
  Cross,
  Dna,
  FlaskConical,
  GraduationCap,
  Heart,
  HeartPulse,
  Microscope,
  Pill,
  Scissors,
  Sparkles,
  Stethoscope,
  Syringe,
  Shield,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  dna: Dna,
  microscope: Microscope,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  brain: Brain,
  cross: Cross,
  bone: Bone,
  "flask-conical": FlaskConical,
  "book-open": BookOpen,
  pill: Pill,
  bug: Bug,
  virus: Shield,
  scissors: Scissors,
  baby: Baby,
  sparkles: Sparkles,
  "graduation-cap": GraduationCap,
  "clipboard-list": ClipboardList,
  syringe: Syringe,
  heart: Heart,
  activity: Activity,
  book: BookOpen,
};

export const ICON_KEYS = Object.keys(ICONS);

export type ColorKey =
  | "mint"
  | "indigo"
  | "rose"
  | "amber"
  | "teal"
  | "violet"
  | "sky"
  | "orange";

export const COLORS: Record<
  ColorKey,
  { from: string; to: string; ring: string; chip: string; text: string; soft: string }
> = {
  mint:   { from: "from-emerald-400", to: "to-teal-500",  ring: "ring-emerald-300/60", chip: "bg-emerald-50 text-emerald-700",  text: "text-emerald-700",  soft: "bg-emerald-50" },
  indigo: { from: "from-indigo-500",  to: "to-violet-600", ring: "ring-indigo-300/60",  chip: "bg-indigo-50 text-indigo-700",    text: "text-indigo-700",   soft: "bg-indigo-50" },
  rose:   { from: "from-rose-400",    to: "to-pink-600",   ring: "ring-rose-300/60",    chip: "bg-rose-50 text-rose-700",        text: "text-rose-700",     soft: "bg-rose-50" },
  amber:  { from: "from-amber-400",   to: "to-orange-500", ring: "ring-amber-300/60",   chip: "bg-amber-50 text-amber-700",      text: "text-amber-700",    soft: "bg-amber-50" },
  teal:   { from: "from-teal-400",    to: "to-cyan-600",   ring: "ring-teal-300/60",    chip: "bg-teal-50 text-teal-700",        text: "text-teal-700",     soft: "bg-teal-50" },
  violet: { from: "from-violet-500",  to: "to-fuchsia-600",ring: "ring-violet-300/60",  chip: "bg-violet-50 text-violet-700",    text: "text-violet-700",   soft: "bg-violet-50" },
  sky:    { from: "from-sky-400",     to: "to-blue-600",   ring: "ring-sky-300/60",     chip: "bg-sky-50 text-sky-700",          text: "text-sky-700",      soft: "bg-sky-50" },
  orange: { from: "from-orange-400",  to: "to-red-500",    ring: "ring-orange-300/60",  chip: "bg-orange-50 text-orange-700",    text: "text-orange-700",   soft: "bg-orange-50" },
};

export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

export type ShapeKey = "circle" | "hexagon" | "squircle" | "diamond" | "ring" | "shield";
export const SHAPE_KEYS: ShapeKey[] = ["circle", "hexagon", "squircle", "diamond", "ring", "shield"];

export function colorOf(key: string) {
  return COLORS[(key as ColorKey)] ?? COLORS.indigo;
}
export function iconOf(key: string) {
  return ICONS[key] ?? BookOpen;
}
