export type HeaderDesign = "terminal" | "institutional" | "modern" | "editorial";

export const HEADER_DESIGNS: {
  id: HeaderDesign;
  name: string;
  note: string;
}[] = [
  { id: "terminal", name: "Terminal", note: "Dense monospace trading-desk bar" },
  { id: "institutional", name: "Institutional", note: "Tall, letter-spaced, bank-grade calm" },
  { id: "modern", name: "Modern", note: "Blurred bar with soft rounded chips" },
  { id: "editorial", name: "Editorial Rail", note: "Right-aligned nav behind a hairline rail" },
];

export type HeaderSkin = {
  header: string;
  inner: string;
  brandSize: number;
  brandWrap: string;
  navWrap: string;
  navIdle: string;
  navActive: string;
  navMobile: string;
  pillIdle: string;
  pillActive: string;
  soonBadge: string;
  iconBtn: string;
  loginBtn: string;
  registerBtn: string;
  avatarBtn: string;
  avatarShape: string;
  menuPanel: string;
  mobileSheet: string;
  rail: boolean;
};

const SHARED_SOON =
  "ms-1.5 align-middle rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground";

export const HEADER_SKINS: Record<HeaderDesign, HeaderSkin> = {
  terminal: {
    header: "sticky top-0 z-50 bg-background border-b border-border",
    inner: "h-[74px] gap-6 md:gap-10",
    brandSize: 25,
    brandWrap: "flex items-center gap-2 shrink-0",
    navWrap: "hidden lg:flex items-center gap-8",
    navIdle:
      "font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors py-1",
    navActive:
      "font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-foreground py-1 relative after:absolute after:inset-x-0 after:-bottom-[24px] after:h-[2px] after:bg-primary",
    navMobile: "font-mono text-[12px] uppercase tracking-[0.14em] py-2.5",
    pillIdle:
      "font-mono text-[11px] uppercase tracking-[0.16em] border border-border px-2 py-1 text-muted-foreground hover:text-foreground hover:border-primary/60",
    pillActive:
      "font-mono text-[11px] uppercase tracking-[0.16em] border border-primary px-2 py-1 text-primary",
    soonBadge: SHARED_SOON.replace("rounded-full", "rounded-none"),
    iconBtn:
      "inline-flex items-center justify-center h-8 px-2.5 border border-border bg-transparent font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors",
    loginBtn:
      "inline-flex items-center justify-center h-8 px-3 border border-border font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:border-primary/60 transition-colors",
    registerBtn:
      "inline-flex items-center justify-center h-8 px-3 font-mono text-[11px] uppercase tracking-[0.14em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
    avatarBtn: "flex items-center gap-2 border border-border ps-1 pe-1.5 py-1 hover:border-primary/60 transition-colors",
    avatarShape: "rounded-none",
    menuPanel: "rounded-none border border-border",
    mobileSheet: "lg:hidden border-t border-border bg-background",
    rail: false,
  },
  institutional: {
    header: "sticky top-0 z-50 bg-background border-b border-border",
    inner: "h-[88px] gap-6 md:gap-12",
    brandSize: 33,
    brandWrap: "flex items-center gap-3 shrink-0",
    navWrap: "hidden lg:flex items-center gap-10 lg:gap-12",
    navIdle:
      "text-[15px] uppercase tracking-[0.14em] font-bold text-muted-foreground hover:text-foreground transition-colors py-2",
    navActive:
      "text-[15px] uppercase tracking-[0.14em] font-black text-foreground py-2 relative after:absolute after:inset-x-0 after:-bottom-[30px] after:h-[3px] after:bg-primary after:rounded-full",
    navMobile: "text-[15px] uppercase tracking-[0.12em] font-bold py-3.5",
    pillIdle:
      "text-[12px] uppercase tracking-[0.16em] font-semibold rounded-sm border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground",
    pillActive:
      "text-[12px] uppercase tracking-[0.16em] font-semibold rounded-sm border border-primary/60 bg-primary/10 px-3 py-1.5 text-primary",
    soonBadge: SHARED_SOON,
    iconBtn:
      "inline-flex items-center justify-center h-10 px-3 rounded-sm border border-border text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors",
    loginBtn:
      "inline-flex items-center justify-center h-10 px-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground hover:text-primary transition-colors",
    registerBtn:
      "inline-flex items-center justify-center h-10 px-5 rounded-sm bg-primary text-primary-foreground text-[12px] font-semibold uppercase tracking-[0.18em] hover:opacity-90 transition-opacity",
    avatarBtn:
      "flex items-center gap-2 rounded-sm border border-border ps-1 pe-2 py-1 hover:border-primary/60 transition-colors",
    avatarShape: "rounded-full",
    menuPanel: "rounded-sm border border-border shadow-xl",
    mobileSheet: "lg:hidden border-t border-border bg-background",
    rail: false,
  },
  modern: {
    header:
      "sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/60 supports-[backdrop-filter]:bg-background/70",
    inner: "h-[84px] gap-6 md:gap-10",
    brandSize: 29,
    brandWrap: "flex items-center gap-2.5 shrink-0",
    navWrap: "hidden lg:flex items-center gap-2",
    navIdle:
      "text-[15px] font-bold rounded-full px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
    navActive: "text-[15px] font-black rounded-full px-4 py-2 bg-muted text-foreground",
    navMobile: "text-[15px] font-bold py-3",
    pillIdle:
      "text-sm font-semibold rounded-full px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors",
    pillActive: "text-sm font-semibold rounded-full px-3 py-1.5 bg-primary/12 text-primary ring-1 ring-primary/25",
    soonBadge: SHARED_SOON,
    iconBtn:
      "inline-flex items-center justify-center h-9 px-3 rounded-lg border border-border bg-card/60 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors",
    loginBtn:
      "inline-flex items-center justify-center h-9 px-3.5 rounded-lg border border-border bg-card/60 text-sm font-semibold text-foreground hover:bg-muted transition-colors",
    registerBtn:
      "inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity",
    avatarBtn:
      "flex items-center gap-2 rounded-full border border-border bg-card/60 ps-1 pe-2 py-1 hover:bg-muted transition-colors",
    avatarShape: "rounded-full",
    menuPanel: "rounded-2xl border border-border shadow-2xl",
    mobileSheet: "lg:hidden border-t border-border bg-background/95 backdrop-blur-xl",
    rail: false,
  },
  editorial: {
    header: "sticky top-0 z-50 bg-background border-b border-border",
    inner: "h-[84px] gap-6 md:gap-10",
    brandSize: 30,
    brandWrap: "flex items-center gap-2.5 shrink-0",
    navWrap: "hidden lg:flex flex-1 items-center justify-end gap-10",
    navIdle:
      "text-[14px] uppercase tracking-[0.16em] font-bold text-muted-foreground hover:text-foreground transition-colors",
    navActive:
      "text-[14px] uppercase tracking-[0.16em] font-black text-foreground relative after:absolute after:-bottom-2 after:inset-x-0 after:h-[2px] after:bg-foreground",
    navMobile: "text-[14px] uppercase tracking-[0.14em] font-bold py-3.5",
    pillIdle:
      "text-[12px] uppercase tracking-[0.18em] font-bold text-primary hover:opacity-80 transition-opacity",
    pillActive:
      "text-[12px] uppercase tracking-[0.18em] font-bold text-primary relative after:absolute after:-bottom-1.5 after:inset-x-0 after:h-px after:bg-primary",
    soonBadge: SHARED_SOON.replace("rounded-full", "rounded-sm"),
    iconBtn:
      "inline-flex items-center justify-center h-9 px-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors",
    loginBtn:
      "inline-flex items-center justify-center h-9 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground hover:text-primary transition-colors",
    registerBtn:
      "inline-flex items-center justify-center h-9 px-4 bg-foreground text-background text-[11px] font-bold uppercase tracking-[0.18em] hover:opacity-85 transition-opacity",
    avatarBtn: "flex items-center gap-2 ps-0 pe-1 py-1 hover:opacity-80 transition-opacity",
    avatarShape: "rounded-full",
    menuPanel: "rounded-md border border-border shadow-xl",
    mobileSheet: "lg:hidden border-t border-border bg-background",
    rail: true,
  },
};

export function resolveHeaderSkin(id: string | null | undefined): HeaderSkin {
  return HEADER_SKINS[(id as HeaderDesign) in HEADER_SKINS ? (id as HeaderDesign) : "institutional"];
}
