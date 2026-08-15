/** Ad Studio — shared types, templates and presets for the admin poster maker. */

export type AdAlign = "left" | "center" | "right";

export type AdTextField = {
  show: boolean;
  text: string;
  size: number;
  weight: number;
  color: string;
  italic?: boolean;
  uppercase?: boolean;
  letterSpacing?: number;
  shadow?: boolean;
  outline?: boolean;
  /** per-block alignment; "auto" follows the ad alignment */
  align?: AdAlign | "auto";
  /** a word/phrase inside the text that gets the accent colour */
  accentWord?: string;
  accentColor?: string;
  /** thick rule under the block */
  underline?: boolean;
};

export type AdBackground = {
  type: "gradient" | "solid" | "pattern" | "image" | "diagonal";
  from: string;
  to: string;
  angle: number;
  color: string;
  pattern: string;
  /** storage path in `ad-media`, or an absolute URL (site images) */
  image: string | null;
  overlay: number;
  blur: number;
  zoom: number;
  /** diagonal split position, 0-100 */
  split?: number;
};

export type AdPlan = {
  title: string;
  subtitle: string;
  price: string;
  old: string;
  save: string;
  bullets: string[];
  note: string;
  bg: string;
  color: string;
  accent: string;
  image: string | null;
  highlight: boolean;
};

export type AdDeviceKind = "ipad" | "ipad-land" | "iphone" | "macbook" | "browser" | "screen";

export type AdDevice = {
  show: boolean;
  kind: AdDeviceKind;
  image: string | null;
  x: number; // % of canvas width, centre of the device
  y: number; // % of canvas height
  scale: number; // %
  rotate: number;
  shadow: boolean;
  glow: boolean;
};

export type AdStat = { value: string; label: string };

export type AdSizeKey = "square" | "portrait" | "story" | "wide";

export const SIZES: Record<AdSizeKey, { w: number; h: number; name: string }> = {
  square: { w: 1080, h: 1080, name: "Square 1:1" },
  portrait: { w: 1080, h: 1350, name: "Portrait 4:5" },
  story: { w: 1080, h: 1920, name: "Story 9:16" },
  wide: { w: 1600, h: 900, name: "Wide 16:9" },
};

export type AdLayout = "stack" | "split" | "plans" | "deal" | "feature" | "stats";

export type AdDesign = {
  template: string;
  layout: AdLayout;
  size: AdSizeKey;
  dir: "ltr" | "rtl";
  font: "display" | "sans" | "serif";
  align: AdAlign;
  vertical: "top" | "center" | "bottom";
  padding: number;
  radius: number;
  frame: boolean;
  frameColor: string;
  accent: string;
  card: boolean;
  cardColor: string;
  cardOpacity: number;
  logo: { show: boolean; text: string; corner: "tl" | "tr" | "bl" | "br"; color: string };
  ribbon: { show: boolean; text: string; color: string; textColor: string };
  price: { show: boolean; value: string; old: string; color: string; size: number; note: string };
  cta: { show: boolean; text: string; bg: string; color: string; radius: number; size: number };
  footer: { show: boolean; text: string; color: string; size: number };
  bg: AdBackground;
  eyebrow: AdTextField;
  headline: AdTextField;
  subheadline: AdTextField;
  body: AdTextField;
  /** tick list */
  bullets: string[];
  bulletIcon: "check" | "dot" | "star" | "arrow" | "spark";
  bulletsShow: boolean;
  bulletSize: number;
  bulletColor: string;
  /** comparison cards */
  plans: AdPlan[];
  /** milestone numbers */
  stats: AdStat[];
  /** device mockups */
  devices: AdDevice[];
};

export const BRAND = {
  navy: "#0B1B33",
  navy2: "#12294D",
  gold: "#D4AF37",
  orange: "#F27127",
  sand: "#F5E6B8",
  white: "#FFFFFF",
  ink: "#0A0A0A",
};

export const GRADIENTS: { name: string; from: string; to: string; angle: number }[] = [
  { name: "Navy night", from: "#0B1B33", to: "#12294D", angle: 160 },
  { name: "Navy → gold", from: "#0B1B33", to: "#8A6A16", angle: 150 },
  { name: "Gold rush", from: "#D4AF37", to: "#8A6A16", angle: 140 },
  { name: "Sand", from: "#F5E6B8", to: "#D4AF37", angle: 160 },
  { name: "Deep teal", from: "#062B2B", to: "#0B1B33", angle: 150 },
  { name: "Royal", from: "#1B1140", to: "#0B1B33", angle: 150 },
  { name: "Ember", from: "#3A0D0D", to: "#0B1B33", angle: 150 },
  { name: "Midnight glass", from: "#101826", to: "#1F2937", angle: 120 },
  { name: "Ivory", from: "#FFFFFF", to: "#F1E7CE", angle: 160 },
  { name: "Emerald", from: "#052E23", to: "#0B1B33", angle: 150 },
];

export const PATTERNS: { id: string; name: string }[] = [
  { id: "none", name: "None" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Grid" },
  { id: "diagonal", name: "Diagonal lines" },
  { id: "rays", name: "Rays" },
  { id: "waves", name: "Waves" },
  { id: "cross", name: "Medical cross" },
  { id: "noise", name: "Soft glow" },
];

/** One-click colour themes. */
export const THEMES: {
  id: string;
  name: string;
  swatch: string[];
  apply: (d: AdDesign) => AdDesign;
}[] = [
  {
    id: "navy-gold",
    name: "Navy & gold",
    swatch: ["#0B1B33", "#12294D", "#D4AF37"],
    apply: (d) => tint(d, { bgFrom: "#0B1B33", bgTo: "#12294D", accent: "#D4AF37", text: "#FFFFFF", muted: "#C7D4E8", ctaBg: "#D4AF37", ctaText: "#0B1B33" }),
  },
  {
    id: "navy-orange",
    name: "Navy & orange",
    swatch: ["#0B1B33", "#14335C", "#F27127"],
    apply: (d) => tint(d, { bgFrom: "#0B1B33", bgTo: "#14335C", accent: "#F27127", text: "#FFFFFF", muted: "#C7D4E8", ctaBg: "#F27127", ctaText: "#FFFFFF" }),
  },
  {
    id: "light-sand",
    name: "Light sand",
    swatch: ["#FBF7EE", "#F1E7CE", "#0B1B33"],
    apply: (d) => tint(d, { bgFrom: "#FBF7EE", bgTo: "#F1E7CE", accent: "#0B1B33", text: "#0B1B33", muted: "#4A5568", ctaBg: "#0B1B33", ctaText: "#FFFFFF" }),
  },
  {
    id: "black-orange",
    name: "Black & orange",
    swatch: ["#0A0A0A", "#1A1A1A", "#FF6B2C"],
    apply: (d) => tint(d, { bgFrom: "#0A0A0A", bgTo: "#1A1A1A", accent: "#FF6B2C", text: "#FFFFFF", muted: "#BFBFBF", ctaBg: "#FF6B2C", ctaText: "#0A0A0A" }),
  },
  {
    id: "clean-white",
    name: "Clean white",
    swatch: ["#FFFFFF", "#F3F5F9", "#1D6FE0"],
    apply: (d) => tint(d, { bgFrom: "#FFFFFF", bgTo: "#F3F5F9", accent: "#1D6FE0", text: "#0B1B33", muted: "#5A6478", ctaBg: "#1D6FE0", ctaText: "#FFFFFF" }),
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: ["#052E23", "#0B1B33", "#3DD68C"],
    apply: (d) => tint(d, { bgFrom: "#052E23", bgTo: "#0B1B33", accent: "#3DD68C", text: "#FFFFFF", muted: "#BFE7D5", ctaBg: "#3DD68C", ctaText: "#052E23" }),
  },
];

function tint(
  d: AdDesign,
  c: { bgFrom: string; bgTo: string; accent: string; text: string; muted: string; ctaBg: string; ctaText: string },
): AdDesign {
  const dark = isDark(c.bgFrom);
  return {
    ...d,
    accent: c.accent,
    frameColor: c.accent,
    bg: { ...d.bg, from: c.bgFrom, to: c.bgTo, color: c.bgFrom },
    eyebrow: { ...d.eyebrow, color: c.accent },
    headline: { ...d.headline, color: c.text, accentColor: c.accent },
    subheadline: { ...d.subheadline, color: c.muted, accentColor: c.accent },
    body: { ...d.body, color: c.muted },
    bulletColor: c.text,
    price: { ...d.price, color: c.accent },
    cta: { ...d.cta, bg: c.ctaBg, color: c.ctaText },
    footer: { ...d.footer, color: c.muted },
    logo: { ...d.logo, color: c.accent },
    ribbon: { ...d.ribbon, color: c.accent, textColor: dark ? "#0B1B33" : "#FFFFFF" },
    cardColor: dark ? "#000000" : "#FFFFFF",
    plans: d.plans.map((p, i) => ({
      ...p,
      bg: i === 0 ? (dark ? "#132747" : "#FFFFFF") : dark ? "#0F1F3A" : "#F7F8FB",
      color: c.text,
      accent: c.accent,
    })),
  };
}

function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/** CSS background layers for a pattern, drawn on top of the base colour. */
export function patternLayers(pattern: string, accent: string): {
  backgroundImage: string;
  backgroundSize: string;
  opacity: number;
} | null {
  const a = accent;
  switch (pattern) {
    case "dots":
      return { backgroundImage: `radial-gradient(${a} 2px, transparent 2px)`, backgroundSize: "36px 36px", opacity: 0.22 };
    case "grid":
      return {
        backgroundImage: `linear-gradient(${a} 1px, transparent 1px), linear-gradient(90deg, ${a} 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        opacity: 0.16,
      };
    case "diagonal":
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${a} 0 2px, transparent 2px 18px)`,
        backgroundSize: "auto",
        opacity: 0.14,
      };
    case "rays":
      return {
        backgroundImage: `repeating-conic-gradient(from 0deg at 50% 50%, ${a} 0deg 6deg, transparent 6deg 18deg)`,
        backgroundSize: "auto",
        opacity: 0.1,
      };
    case "waves":
      return {
        backgroundImage: `repeating-radial-gradient(circle at 50% 120%, ${a} 0 2px, transparent 2px 40px)`,
        backgroundSize: "auto",
        opacity: 0.16,
      };
    case "cross":
      return {
        backgroundImage: `linear-gradient(${a} 0 0), linear-gradient(${a} 0 0)`,
        backgroundSize: "10px 34px, 34px 10px",
        opacity: 0.12,
      };
    case "noise":
      return {
        backgroundImage: `radial-gradient(circle at 20% 20%, ${a} 0%, transparent 45%), radial-gradient(circle at 80% 70%, ${a} 0%, transparent 40%)`,
        backgroundSize: "auto",
        opacity: 0.35,
      };
    default:
      return null;
  }
}

function field(text: string, size: number, weight = 900, color = "#FFFFFF"): AdTextField {
  return {
    show: true, text, size, weight, color,
    uppercase: false, letterSpacing: 0, shadow: true, outline: false,
    align: "auto", accentWord: "", accentColor: BRAND.gold, underline: false,
  };
}

export function blankPlan(title: string, price = ""): AdPlan {
  return {
    title,
    subtitle: "",
    price,
    old: "",
    save: "",
    bullets: ["Full question bank", "Video lectures", "Explanations"],
    note: "",
    bg: "#132747",
    color: "#FFFFFF",
    accent: BRAND.gold,
    image: null,
    highlight: false,
  };
}

export function blankDevice(kind: AdDeviceKind = "ipad"): AdDevice {
  return { show: true, kind, image: null, x: 50, y: 62, scale: 100, rotate: 0, shadow: true, glow: false };
}

export function baseDesign(): AdDesign {
  return {
    template: "offer",
    layout: "stack",
    size: "square",
    dir: "ltr",
    font: "display",
    align: "left",
    vertical: "center",
    padding: 86,
    radius: 0,
    frame: true,
    frameColor: BRAND.gold,
    accent: BRAND.gold,
    card: false,
    cardColor: "#000000",
    cardOpacity: 0.35,
    logo: { show: true, text: "AquaQBank", corner: "tl", color: BRAND.gold },
    ribbon: { show: true, text: "LIMITED OFFER", color: BRAND.gold, textColor: BRAND.navy },
    price: { show: true, value: "", old: "", color: BRAND.gold, size: 96, note: "" },
    cta: { show: true, text: "aquaqbank.com", bg: BRAND.gold, color: BRAND.navy, radius: 999, size: 30 },
    footer: { show: true, text: "aquaqbank.com", color: "#E8EEF7", size: 24 },
    bg: {
      type: "gradient",
      from: BRAND.navy,
      to: BRAND.navy2,
      angle: 160,
      color: BRAND.navy,
      pattern: "dots",
      image: null,
      overlay: 0.25,
      blur: 0,
      zoom: 100,
      split: 45,
    },
    eyebrow: { ...field("NEW ON AQUAQBANK", 26, 900, BRAND.gold), uppercase: true, letterSpacing: 4 },
    headline: field("Your headline here", 92),
    subheadline: field("A short supporting line that sells it.", 36, 700, "#DCE6F5"),
    body: { ...field("• Point one\n• Point two\n• Point three", 28, 600, "#C7D4E8"), shadow: false },
    bullets: ["Full question bank", "Video lectures", "Detailed explanations"],
    bulletIcon: "check",
    bulletsShow: false,
    bulletSize: 30,
    bulletColor: "#FFFFFF",
    plans: [blankPlan("Elite", "25 JOD"), blankPlan("Group", "60 JOD")],
    stats: [
      { value: "1000+", label: "Students" },
      { value: "12,000+", label: "Questions" },
    ],
    devices: [blankDevice("ipad")],
  };
}

/** Upgrade a design saved with an older shape. */
export function normalizeDesign(input: Partial<AdDesign> | null | undefined): AdDesign {
  const base = baseDesign();
  const d = { ...base, ...(input ?? {}) } as AdDesign;
  const mergeField = (k: "eyebrow" | "headline" | "subheadline" | "body") => {
    d[k] = { ...base[k], ...((input as any)?.[k] ?? {}) };
  };
  mergeField("eyebrow"); mergeField("headline"); mergeField("subheadline"); mergeField("body");
  d.bg = { ...base.bg, ...((input as any)?.bg ?? {}) };
  d.logo = { ...base.logo, ...((input as any)?.logo ?? {}) };
  d.ribbon = { ...base.ribbon, ...((input as any)?.ribbon ?? {}) };
  d.price = { ...base.price, ...((input as any)?.price ?? {}) };
  d.cta = { ...base.cta, ...((input as any)?.cta ?? {}) };
  d.footer = { ...base.footer, ...((input as any)?.footer ?? {}) };
  d.bullets = Array.isArray(d.bullets) ? d.bullets : base.bullets;
  d.stats = Array.isArray(d.stats) && d.stats.length ? d.stats : base.stats;
  d.plans = Array.isArray(d.plans) && d.plans.length
    ? d.plans.map((p) => ({ ...blankPlan(p?.title ?? "Plan"), ...p }))
    : base.plans;
  d.devices = Array.isArray(d.devices) && d.devices.length
    ? d.devices.map((v) => ({ ...blankDevice(), ...v }))
    : base.devices;
  if (!d.layout) d.layout = "stack";
  if (!d.size) d.size = "square";
  return d;
}

export type AdTemplate = {
  id: string;
  name: string;
  hint: string;
  kind: "offer" | "package" | "feature" | "milestone" | "announcement" | "reminder" | "free";
  apply: (d: AdDesign) => AdDesign;
};

const g = (i: number) => GRADIENTS[i]!;

export const TEMPLATES: AdTemplate[] = [
  {
    id: "split",
    name: "Split headline",
    hint: "Huge stacked words, one line in colour",
    kind: "announcement",
    apply: (d) => ({
      ...d,
      layout: "split",
      align: "center",
      vertical: "center",
      frame: false,
      padding: 90,
      ribbon: { ...d.ribbon, show: false },
      price: { ...d.price, show: false },
      bulletsShow: false,
      headline: { ...d.headline, size: 130, weight: 900, uppercase: true, underline: true, letterSpacing: -1 },
      subheadline: { ...d.subheadline, size: 40, weight: 800 },
      bg: { ...d.bg, type: "gradient", from: "#FBF7EE", to: "#F1E7CE", angle: 160, pattern: "none", overlay: 0 },
    }),
  },
  {
    id: "plans",
    name: "Two-plan comparison",
    hint: "Side-by-side pricing cards",
    kind: "package",
    apply: (d) => ({
      ...d,
      layout: "plans",
      align: "center",
      vertical: "top",
      frame: false,
      padding: 64,
      price: { ...d.price, show: false },
      body: { ...d.body, show: false },
      bulletsShow: false,
      headline: { ...d.headline, size: 72, uppercase: true },
      subheadline: { ...d.subheadline, size: 30, show: true },
      bg: { ...d.bg, type: "gradient", from: "#0B1B33", to: "#14335C", angle: 160, pattern: "grid", overlay: 0 },
    }),
  },
  {
    id: "deal",
    name: "Single deal card",
    hint: "Image + price + tick list",
    kind: "offer",
    apply: (d) => ({
      ...d,
      layout: "deal",
      align: "left",
      vertical: "center",
      frame: false,
      padding: 72,
      bulletsShow: true,
      price: { ...d.price, show: true, size: 104 },
      headline: { ...d.headline, size: 84, uppercase: true },
      bg: { ...d.bg, type: "diagonal", from: "#F27127", to: "#0B1B33", split: 42, pattern: "none", overlay: 0 },
    }),
  },
  {
    id: "feature",
    name: "Feature launch",
    hint: "Device mockup + three points",
    kind: "feature",
    apply: (d) => ({
      ...d,
      layout: "feature",
      align: "center",
      vertical: "top",
      frame: false,
      padding: 78,
      price: { ...d.price, show: false },
      ribbon: { ...d.ribbon, show: false },
      bulletsShow: true,
      headline: { ...d.headline, size: 90, uppercase: true },
      devices: d.devices.length ? d.devices : [blankDevice("ipad")],
      bg: { ...d.bg, type: "gradient", from: "#0B1B33", to: "#12294D", angle: 160, pattern: "noise", overlay: 0 },
    }),
  },
  {
    id: "stats",
    name: "Milestone / stats",
    hint: "Two big numbers",
    kind: "milestone",
    apply: (d) => ({
      ...d,
      layout: "stats",
      align: "center",
      vertical: "center",
      frame: false,
      price: { ...d.price, show: false },
      bulletsShow: false,
      headline: { ...d.headline, size: 96, uppercase: true },
      bg: { ...d.bg, type: d.bg.image ? "image" : "gradient", overlay: d.bg.image ? 0.55 : 0, pattern: "none" },
    }),
  },
  {
    id: "offer",
    name: "Big offer",
    hint: "Price + discount ribbon",
    kind: "offer",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "left",
      vertical: "center",
      frame: true,
      ribbon: { ...d.ribbon, show: true, text: d.ribbon.text || "LIMITED OFFER" },
      price: { ...d.price, show: true, size: 120 },
      bg: { ...d.bg, type: "gradient", from: g(1).from, to: g(1).to, angle: g(1).angle, pattern: "rays" },
    }),
  },
  {
    id: "spotlight",
    name: "Course spotlight",
    hint: "Image background + course name",
    kind: "offer",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "left",
      vertical: "bottom",
      card: true,
      cardOpacity: 0.45,
      price: { ...d.price, show: true, size: 84 },
      bg: { ...d.bg, type: d.bg.image ? "image" : "gradient", overlay: 0.5, pattern: "none" },
    }),
  },
  {
    id: "coupon",
    name: "Coupon code",
    hint: "Big code in the middle",
    kind: "offer",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "center",
      vertical: "center",
      frame: true,
      card: true,
      cardOpacity: 0.3,
      price: { ...d.price, show: false },
      cta: { ...d.cta, show: true, radius: 18 },
      bg: { ...d.bg, type: "gradient", from: g(0).from, to: g(0).to, angle: g(0).angle, pattern: "grid" },
    }),
  },
  {
    id: "announce",
    name: "Announcement",
    hint: "Clean statement card",
    kind: "announcement",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "center",
      vertical: "center",
      frame: true,
      price: { ...d.price, show: false },
      ribbon: { ...d.ribbon, show: false },
      bg: { ...d.bg, type: "gradient", from: g(0).from, to: g(0).to, angle: 150, pattern: "cross" },
    }),
  },
  {
    id: "reminder",
    name: "Reminder / deadline",
    hint: "Urgent, high contrast",
    kind: "reminder",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "center",
      vertical: "center",
      accent: "#FF5A4E",
      frameColor: "#FF5A4E",
      ribbon: { ...d.ribbon, show: true, text: "REMINDER", color: "#FF5A4E", textColor: "#FFFFFF" },
      price: { ...d.price, show: false },
      bg: { ...d.bg, type: "gradient", from: "#160A0A", to: "#0B1B33", angle: 150, pattern: "diagonal" },
    }),
  },
  {
    id: "quote",
    name: "Tip / quote",
    hint: "Editorial, calm",
    kind: "free",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "center",
      vertical: "center",
      font: "serif",
      frame: false,
      price: { ...d.price, show: false },
      ribbon: { ...d.ribbon, show: false },
      headline: { ...d.headline, size: 74, weight: 700, shadow: false },
      bg: { ...d.bg, type: "gradient", from: g(8).from, to: g(8).to, angle: 160, pattern: "noise" },
      eyebrow: { ...d.eyebrow, color: "#8A6A16" },
      subheadline: { ...d.subheadline, color: "#3B4657" },
      body: { ...d.body, color: "#4A5568" },
      footer: { ...d.footer, color: "#5A6478" },
      logo: { ...d.logo, color: "#8A6A16" },
    }),
  },
  {
    id: "university",
    name: "University",
    hint: "Logo-friendly, tagged",
    kind: "announcement",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "center",
      vertical: "center",
      card: true,
      cardOpacity: 0.28,
      price: { ...d.price, show: false },
      bg: { ...d.bg, type: d.bg.image ? "image" : "gradient", overlay: 0.45, pattern: "waves" },
    }),
  },
  {
    id: "bold",
    name: "Bold statement",
    hint: "Huge type, nothing else",
    kind: "free",
    apply: (d) => ({
      ...d,
      layout: "stack",
      align: "left",
      vertical: "bottom",
      frame: false,
      ribbon: { ...d.ribbon, show: false },
      price: { ...d.price, show: false },
      subheadline: { ...d.subheadline, show: true },
      body: { ...d.body, show: false },
      headline: { ...d.headline, size: 128, letterSpacing: -2 },
      bg: { ...d.bg, type: "gradient", from: g(3).from, to: g(3).to, angle: 150, pattern: "none" },
      eyebrow: { ...d.eyebrow, color: BRAND.navy },
    }),
  },
];

export const AD_KINDS: { id: AdTemplate["kind"]; name: string; hint: string }[] = [
  { id: "offer", name: "Course offer", hint: "A course or a discount" },
  { id: "package", name: "Package / two plans", hint: "Compare two bundles" },
  { id: "feature", name: "New feature", hint: "Show the app or site" },
  { id: "milestone", name: "Milestone / stats", hint: "Numbers to celebrate" },
  { id: "announcement", name: "Announcement", hint: "Something is ready" },
  { id: "reminder", name: "Reminder", hint: "A deadline is close" },
  { id: "free", name: "Free-form", hint: "Anything else" },
];

export const FONT_STACKS: Record<AdDesign["font"], string> = {
  display: '"Cairo", "Baloo Bhaijaan 2", ui-sans-serif, system-ui, sans-serif',
  sans: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  serif: 'Georgia, "Times New Roman", "Amiri", serif',
};

/** Percent saved between two price strings, e.g. "25 JOD" vs "40 JOD". */
export function savePercent(now: string, old: string): string {
  const n = parseFloat((now || "").replace(/[^\d.]/g, ""));
  const o = parseFloat((old || "").replace(/[^\d.]/g, ""));
  if (!isFinite(n) || !isFinite(o) || o <= 0 || n >= o) return "";
  return `SAVE ${Math.round(((o - n) / o) * 100)}%`;
}

export function telegramCaption(d: AdDesign, link: string): string {
  const planLines = d.layout === "plans"
    ? d.plans.map((p) => `• ${p.title}${p.price ? ` — ${p.price}` : ""}${p.old ? ` (was ${p.old})` : ""}`).join("\n")
    : "";
  const lines = [
    d.headline.show && d.headline.text ? `**${d.headline.text}**` : "",
    d.subheadline.show && d.subheadline.text ? d.subheadline.text : "",
    d.bulletsShow && d.bullets.length ? d.bullets.map((b) => `✅ ${b}`).join("\n") : "",
    d.body.show && d.body.text ? d.body.text : "",
    planLines,
    d.price.show && d.price.value ? `💰 ${d.price.value}${d.price.old ? ` (was ${d.price.old})` : ""}` : "",
    link ? `🔗 ${link}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}
