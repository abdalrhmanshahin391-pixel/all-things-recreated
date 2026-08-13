import {
  Compass, FileText, MoonStar, Sparkles, Languages, Zap, Settings, Type,
  FolderTree, Users, Smartphone, Ticket, Archive, BookOpen, Video, Package,
  ListPlus, BarChart3, GraduationCap, Palette, ShieldAlert, LifeBuoy, Info,
  UsersRound, Server, History, Star, Heart, Flag, Link2, Wrench, Rocket,
  ListChecks, CalendarDays, Timer, Library,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Compass, FileText, MoonStar, Sparkles, Languages, Zap, Settings, Type,
  FolderTree, Users, Smartphone, Ticket, Archive, BookOpen, Video, Package,
  ListPlus, BarChart3, GraduationCap, Palette, ShieldAlert, LifeBuoy, Info,
  UsersRound, Server, History, Star, Heart, Flag, Link2, Wrench, Rocket,
  ListChecks, CalendarDays, Timer, Library,
};


export const ICON_NAMES = Object.keys(ICONS);

export type HubTile = {
  id: string;
  to: string;
  label: string;
  labelAr?: string;
  icon: string;
  hidden?: boolean;
  custom?: boolean;
  external?: boolean;
};

export type HubGroup = {
  id: string;
  label: string;
  labelAr?: string;
  tiles: HubTile[];
};

export type HubLayout = { groups: HubGroup[] };

function t(to: string, label: string, icon: string): HubTile {
  return { id: to, to, label, icon };
}

export const DEFAULT_LAYOUT: HubLayout = {
  groups: [
    {
      id: "appearance",
      label: "Appearance",
      labelAr: "المظهر",
      tiles: [
        t("/admin/theme", "Theme", "Palette"),
        t("/admin/site-settings", "Site Settings", "Settings"),
        t("/admin/content", "Website Text", "Type"),
        t("/admin/navigation", "Navigation & Buttons", "Compass"),
        t("/admin/pages", "Pages & Sections", "FolderTree"),
        t("/admin/about", "About Page", "Info"),
      ],
    },
    {
      id: "content",
      label: "Content",
      labelAr: "المحتوى",
      tiles: [
        t("/admin/courses", "Courses Control", "BookOpen"),
        t("/admin/lectures", "Lectures Syllabus", "Video"),
        t("/admin/questions", "Questions", "ListPlus"),
        t("/admin/question-generator", "Questions Generator", "Sparkles"),
        t("/admin/question-bank", "Question Bank", "Library"),

        t("/admin/packages", "Packages Table", "Package"),
        t("/admin/committee", "Committee Hub", "FolderTree"),
        t("/admin/committee-log", "Committee Log", "History"),
        t("/admin/german", "German Learning", "Languages"),
        t("/admin/universities", "Universities", "GraduationCap"),
        t("/admin/study-hub", "Study Hub Control", "Rocket"),
        t("/admin/legal", "Terms & Privacy", "FileText"),
      ],
    },
    {
      id: "people",
      label: "People",
      labelAr: "المستخدمون",
      tiles: [
        t("/admin/people", "People Intelligence", "BarChart3"),
        t("/admin/users", "Users & Roles", "Users"),
        t("/admin/groups", "Groups", "UsersRound"),
        t("/admin/support", "Support Center", "LifeBuoy"),
        t("/admin/devices", "Device Security", "Smartphone"),
        t("/admin/content-protection", "Content Protection", "ShieldAlert"),
        t("/admin/coupons", "Coupons", "Ticket"),
        t("/admin/marketing", "Marketing", "BarChart3"),
      ],
    },
    {
      id: "tools",
      label: "Tools",
      labelAr: "أدوات",
      tiles: [
        t("/mentor", "My Mentor · مرشدي", "MoonStar"),
        t("/admin/pdf-slicer", "PDF Slicer", "FileText"),
        t("/admin/jarvis-batch", "Jarvis Batch (50% off)", "MoonStar"),
        t("/admin/jarvis-batch-v2", "Jarvis Batch v2", "Sparkles"),
        t("/admin/jarvis-batch-v2-ipad", "Jarvis Batch v2 iPad", "Sparkles"),
        t("/admin/vision-pro-batch", "Vision Pro batch 50%", "ScanEye"),
        t("/admin/aquavisionx", "AquaVisionX", "ScanEye"),
        t("/admin/patch-ipad-prox", "Patch iPad ProX", "ScanEye"),
        t("/admin/jarvis-batch-german-ipad", "50% iPad Germany", "Languages"),
        t("/admin/gemini-keys", "Gemini Batch Keys", "Zap"),
        t("/admin/sonic", "Sonic (immediate)", "Zap"),
        t("/admin/backups", "Backups", "Archive"),
        t("/admin/transfer", "Site Transfer", "Rocket"),
        t("/admin/servers", "Servers", "Server"),
        t("/admin/database", "Database Ultimate", "Wrench"),

      ],
    },
  ],
};

/**
 * Merge a stored layout over the defaults so newly shipped admin pages
 * still show up in their default group even if they aren't in the saved copy.
 */
export function mergeLayout(stored: unknown): HubLayout {
  const s = stored as HubLayout | null | undefined;
  if (!s || !Array.isArray(s.groups) || s.groups.length === 0) {
    return structuredClone(DEFAULT_LAYOUT);
  }

  const groups: HubGroup[] = s.groups.map((g) => ({
    id: g.id,
    label: g.label,
    labelAr: g.labelAr,
    tiles: (g.tiles ?? []).filter((x) => x && x.to),
  }));

  const known = new Set(groups.flatMap((g) => g.tiles.map((x) => x.id ?? x.to)));

  for (const dg of DEFAULT_LAYOUT.groups) {
    const missing = dg.tiles.filter((x) => !known.has(x.id));
    if (missing.length === 0) continue;
    const target = groups.find((g) => g.id === dg.id);
    if (target) target.tiles.push(...missing.map((m) => ({ ...m })));
    else groups.push({ ...dg, tiles: missing.map((m) => ({ ...m })) });
  }

  return { groups };
}