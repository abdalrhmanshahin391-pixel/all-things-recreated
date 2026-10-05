import type { ReactNode } from "react";
import { ArrowRight, Lock, LockOpen, Sparkles } from "lucide-react";

/*
 * Building blocks of the AQUA version. Everything uses the site's theme colours (primary, card, border,
 * muted ...) and nothing is hard-coded, so when the site design is changed here it changes too.
 */

/** Soft glow behind the page, tinted with the theme's primary colour. */
export function AquaBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[26rem] overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -top-10 right-0 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
    </div>
  );
}

export function AquaBadge({ children = "AQUA version" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground shadow-sm">
      <Sparkles size={11} /> {children}
    </span>
  );
}

export function StateChip({ open }: { open: boolean }) {
  return open ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Open
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
      <Lock size={10} /> Coming soon · قريباً
    </span>
  );
}

/** Open / close switch shown to the committee on every card. */
export function OpenToggle({
  open,
  busy,
  onToggle,
  className = "",
}: {
  open: boolean;
  busy?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      disabled={busy}
      title={open ? "Open for students. Click to close it (coming soon)." : "Closed (coming soon). Click to open it for students."}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
        open
          ? "border-primary/40 bg-primary text-primary-foreground hover:opacity-90"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      } ${className}`}
    >
      {open ? <LockOpen size={11} /> : <Lock size={11} />}
      {open ? "Open" : "Closed"}
    </button>
  );
}

/**
 * One tile (year, semester, module or subject).
 * Students cannot enter a closed tile; the committee can, and gets the open/close switch.
 */
export function AquaNodeCard({
  icon,
  eyebrow,
  title,
  meta,
  mark,
  open,
  canManage,
  onToggle,
  toggling,
  link,
  compact = false,
  footer,
}: {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  /** big faint number or letter in the corner */
  mark?: string;
  open: boolean;
  canManage: boolean;
  onToggle?: () => void;
  toggling?: boolean;
  /** wraps the card in a link / button; students get no link while the tile is closed */
  link: (card: ReactNode, className: string) => ReactNode;
  compact?: boolean;
  footer?: ReactNode;
}) {
  const enterable = open || canManage;
  // The committee already sees the state on the switch in the corner, so the chip is only for students.
  const showChip = !(canManage && onToggle);
  const body = (
    <>
      {mark && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-4 select-none text-8xl font-black leading-none text-primary/[0.07]"
        >
          {mark}
        </span>
      )}
      <div className={`relative flex ${compact ? "flex-col items-center text-center gap-3" : "items-start gap-4"}`}>
        <div
          className={`grid shrink-0 place-items-center rounded-xl ${compact ? "h-12 w-12" : "h-12 w-12"} ${
            open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
          )}
          <div className={`font-bold leading-snug text-foreground ${compact ? "text-sm" : "text-lg"}`}>{title}</div>
          {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {!compact && enterable && (
          <ArrowRight size={18} className="mt-1 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        )}
      </div>
      {(showChip || footer) && (
        <div className={`relative mt-4 flex items-center gap-2 ${compact ? "justify-center" : "justify-between"}`}>
          {showChip && <StateChip open={open} />}
          {footer}
        </div>
      )}
    </>
  );

  const cls = `group relative block w-full overflow-hidden rounded-2xl border bg-card p-5 text-left transition-all ${
    canManage && onToggle ? "pt-12" : ""
  } ${
    open
      ? "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
      : canManage
        ? "border-dashed border-border opacity-90 hover:opacity-100 hover:border-primary/40"
        : "cursor-not-allowed border-dashed border-border opacity-80"
  }`;

  return (
    <div className="relative">
      {enterable ? (
        link(body, cls)
      ) : (
        <div className={cls} title="Coming soon" aria-disabled>
          {body}
        </div>
      )}
      {canManage && onToggle && (
        <OpenToggle open={open} busy={toggling} onToggle={onToggle} className="absolute right-3 top-3 z-20" />
      )}
    </div>
  );
}

export function AquaHero({
  titleAr,
  titleEn,
  subtitle,
  children,
}: {
  titleAr: string;
  titleEn: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="aqua-rise relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card via-card to-accent/25 px-6 py-10 text-center shadow-[0_0_60px_-20px_var(--accent)] md:px-12 md:py-14">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <AquaBadge />
        <h1
          dir="rtl"
          lang="ar"
          className="aqua-gold-text mt-5 text-4xl font-bold leading-tight tracking-tight md:text-6xl"
          style={{ fontFamily: "'Tajawal','Inter',system-ui,sans-serif", letterSpacing: 0 }}
        >
          {titleAr}
        </h1>
        <p className="mt-2 font-sans text-lg font-bold tracking-[0.18em] text-foreground/90 uppercase sm:text-xl md:text-2xl">{titleEn}</p>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">{subtitle}</p>
        {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>}
      </div>
    </section>
  );
}

/** Shown to the committee when the database update has not been applied yet. */
export function AquaSetupNotice({ migration }: { migration: string }) {
  return (
    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <b>AQUA version setup:</b> the database update is not applied yet, so everything shows as coming soon and opening
      items will not save. Ask Lovable to apply the migration <code className="rounded bg-background/60 px-1">{migration}</code>.
    </div>
  );
}