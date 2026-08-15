/** Ad Studio — shared types, templates and presets for the admin poster maker. */

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
};

export type AdBackground = {
  type: "gradient" | "solid" | "pattern" | "image";
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
};

export type AdDesign = {
  template: string;
  dir: "ltr" | "rtl";
  font: "display" | "sans" | "serif";
  align: "left" | "center" | "right";
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
};

export const BRAND = {
  navy: "#0B1B33",
  navy2: "#12294D",
  gold: "#D4AF37",
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
  return { show: true, text, size, weight, color, uppercase: false, letterSpacing: 0, shadow: true, outline: false };
}

export function baseDesign(): AdDesign {
  return {
    template: "offer",
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
    },
    eyebrow: { ...field("NEW ON AQUAQBANK", 26, 900, BRAND.gold), uppercase: true, letterSpacing: 4 },
    headline: field("Your headline here", 92),
    subheadline: field("A short supporting line that sells it.", 36, 700, "#DCE6F5"),
    body: { ...field("• Point one\n• Point two\n• Point three", 28, 600, "#C7D4E8"), shadow: false },
  };
}

export type AdTemplate = {
  id: string;
  name: string;
  hint: string;
  apply: (d: AdDesign) => AdDesign;
};

const g = (i: number) => GRADIENTS[i]!;

export const TEMPLATES: AdTemplate[] = [
  {
    id: "offer",
    name: "Big offer",
    hint: "Price + discount ribbon",
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
    apply: (d) => ({
      ...d,
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
      headline_placeholder: undefined,
    }) as AdDesign,
  },
];

export const FONT_STACKS: Record<AdDesign["font"], string> = {
  display: '"Cairo", "Baloo Bhaijaan 2", ui-sans-serif, system-ui, sans-serif',
  sans: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  serif: 'Georgia, "Times New Roman", "Amiri", serif',
};

export function telegramCaption(d: AdDesign, link: string): string {
  const lines = [
    d.headline.show && d.headline.text ? `**${d.headline.text}**` : "",
    d.subheadline.show && d.subheadline.text ? d.subheadline.text : "",
    d.body.show && d.body.text ? d.body.text : "",
    d.price.show && d.price.value ? `💰 ${d.price.value}${d.price.old ? ` (was ${d.price.old})` : ""}` : "",
    link ? `🔗 ${link}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}
