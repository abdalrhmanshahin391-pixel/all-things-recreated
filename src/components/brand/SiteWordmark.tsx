import { useSiteSettings } from "@/hooks/useSiteSettings";

export type BrandStyle =
  | "aqua-flow"
  | "split-weight"
  | "droplet-badge"
  | "outline-wave"
  | "platform-lock"
  | "droplet-platform"
  | "stacked-platform"
  | "gradient-q-badge";

export const BRAND_STYLES: { id: BrandStyle; label: string; hint: string }[] = [
  { id: "aqua-flow", label: "Aqua Flow", hint: "Teal → cyan gradient with a soft glow" },
  { id: "split-weight", label: "Split Weight", hint: "Light + black weights with an accent Q" },
  { id: "droplet-badge", label: "Droplet Badge", hint: "Water-drop monogram tile beside the name" },
  { id: "outline-wave", label: "Outline Wave", hint: "Outlined caps over a sweeping wave" },
  { id: "platform-lock", label: "Academy Lock", hint: "Name, hairline divider, ACADEMY in caps" },
  { id: "droplet-platform", label: "Droplet Academy", hint: "Drop tile + name with an ACADEMY micro-label" },
  { id: "stacked-platform", label: "Stacked Academy", hint: "Name over a full-width ACADEMY line" },
  { id: "gradient-q-badge", label: "Gradient Q + Chip", hint: "Golden Q only, with an ACADEMY chip" },
];

const PLATFORM = "ACADEMY";



/** Brand gold — the accent "Q" and the divider/labels that sit beside it. */
const GOLD_FROM = "#b45309";
const GOLD_MID = "#e0a90f";
const GOLD_TO = "#fcd34d";


/** Splits a name into [head, accent, tail] around the first capital "Q" (falls back gracefully). */
function splitName(name: string) {
  const i = name.indexOf("Q", 1);
  if (i === -1) return [name, "", ""] as const;
  return [name.slice(0, i), name[i]!, name.slice(i + 1)] as const;
}

export function SiteWordmark({
  size = 26,
  color,
  style: styleOverride,
  name: nameOverride,
  className = "",
}: {
  size?: number;
  /** Force a name instead of the saved one (used by the admin previews). */
  name?: string;
  /** Force a flat color (used on colored backgrounds). */
  color?: string;
  /** Force a variant instead of the admin-selected one (used by the admin previews). */
  style?: BrandStyle;
  className?: string;
}) {
  const settings = useSiteSettings();
  const name = nameOverride || settings.site_name || "AquaQBank";
  const variant = (styleOverride ?? (settings.brand_style as BrandStyle)) || "aqua-flow";
  const [head, accent, tail] = splitName(name);
  const mono = !!color;

  const base: React.CSSProperties = {
    fontSize: size,
    lineHeight: 1,
    letterSpacing: "-0.03em",
    whiteSpace: "nowrap",
  };

  if (variant === "split-weight") {
    return (
      <span className={`font-display select-none inline-flex items-baseline ${className}`} style={base}>
        <span style={{ fontWeight: 300, color: color ?? "var(--foreground)" }}>{head}</span>
        <span
          style={{
            fontWeight: 900,
            color: color ?? GOLD_MID,
            transform: "translateY(-0.02em)",
            display: "inline-block",
          }}
        >
          {accent}
        </span>
        <span style={{ fontWeight: 900, color: color ?? "var(--foreground)" }}>{tail}</span>
      </span>
    );
  }

  if (variant === "droplet-badge") {
    const tile = size * 1.15;
    return (
      <span className={`select-none inline-flex items-center ${className}`} style={{ gap: size * 0.32 }}>
        <span
          className="inline-grid place-items-center shrink-0"
          style={{
            width: tile,
            height: tile,
            borderRadius: `${tile * 0.36}px ${tile * 0.36}px ${tile * 0.36}px ${tile * 0.12}px`,
            background: mono ? "rgba(255,255,255,0.18)" : `linear-gradient(150deg, ${GOLD_TO}, ${GOLD_FROM})`,
            boxShadow: mono ? "none" : `0 ${tile * 0.12}px ${tile * 0.4}px -${tile * 0.18}px ${GOLD_FROM}88`,
          }}
        >
          <span
            className="font-display"
            style={{ fontSize: tile * 0.62, fontWeight: 900, color: "#fff", lineHeight: 1 }}
          >
            {accent || name.charAt(0)}
          </span>
        </span>
        <span
          className="font-display"
          style={{ ...base, fontWeight: 800, color: color ?? "var(--foreground)" }}
        >
          {name}
        </span>
      </span>
    );
  }

  if (variant === "outline-wave") {
    return (
      <span className={`select-none inline-flex flex-col ${className}`} style={{ gap: size * 0.12 }}>
        <span
          className="font-display"
          style={{
            ...base,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: "transparent",
            WebkitTextStroke: `${Math.max(1, size * 0.045)}px ${color ?? GOLD_FROM}`,
          }}
        >
          {name}
        </span>
        <svg
          width="100%"
          height={size * 0.28}
          viewBox="0 0 120 10"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path
            d="M0 6 Q 15 0 30 6 T 60 6 T 90 6 T 120 6"
            fill="none"
            stroke={color ?? GOLD_MID}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  if (variant === "platform-lock") {
    return (
      <span className={`select-none inline-flex items-center ${className}`} style={{ gap: size * 0.42 }}>
        <span className="font-display" style={{ ...base, fontWeight: 900 }}>
          <span style={{ color: color ?? "var(--foreground)" }}>{head}</span>
          <span style={{ color: color ?? GOLD_MID }}>{accent}</span>
          <span style={{ color: color ?? "var(--foreground)" }}>{tail}</span>
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: size * 0.86,
            background: color ?? GOLD_MID,
            opacity: mono ? 0.5 : 0.55,
          }}
        />
        <span
          style={{
            fontSize: Math.max(8, size * 0.36),
            fontWeight: 700,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: color ?? "var(--muted-foreground)",
            lineHeight: 1,
          }}
        >
          {PLATFORM}
        </span>
      </span>
    );
  }

  if (variant === "droplet-platform") {
    const tile = size * 1.32;
    return (
      <span className={`select-none inline-flex items-center ${className}`} style={{ gap: size * 0.34 }}>
        <span
          className="inline-grid place-items-center shrink-0"
          style={{
            width: tile,
            height: tile,
            borderRadius: `${tile * 0.4}px ${tile * 0.4}px ${tile * 0.4}px ${tile * 0.12}px`,
            background: mono ? "rgba(255,255,255,0.18)" : `linear-gradient(150deg, ${GOLD_TO}, ${GOLD_FROM})`,
            boxShadow: mono ? "none" : `0 ${tile * 0.12}px ${tile * 0.42}px -${tile * 0.2}px ${GOLD_FROM}99`,
          }}
        >
          <span
            className="font-display"
            style={{ fontSize: tile * 0.6, fontWeight: 900, color: "#fff", lineHeight: 1 }}
          >
            {accent || name.charAt(0)}
          </span>
        </span>
        <span className="inline-flex flex-col" style={{ gap: size * 0.1 }}>
          <span
            className="font-display"
            style={{ ...base, fontWeight: 900, color: color ?? "var(--foreground)" }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: Math.max(7, size * 0.3),
              fontWeight: 700,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: color ?? GOLD_MID,
              lineHeight: 1,
            }}
          >
            {PLATFORM}
          </span>
        </span>
      </span>
    );
  }

  if (variant === "stacked-platform") {
    return (
      <span className={`select-none inline-flex flex-col ${className}`} style={{ gap: size * 0.14 }}>
        <span className="font-display" style={{ ...base, fontWeight: 900 }}>
          <span style={{ color: color ?? "var(--foreground)" }}>{head}</span>
          <span
            style={
              mono
                ? { color }
                : {
                    backgroundImage: `linear-gradient(120deg, ${GOLD_FROM}, ${GOLD_TO})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }
            }
          >
            {accent}
          </span>
          <span style={{ color: color ?? "var(--foreground)" }}>{tail}</span>
        </span>
        <span
          className="inline-flex items-center"
          style={{ gap: size * 0.22, width: "100%" }}
        >
          <span
            aria-hidden="true"
            style={{ flex: 1, height: 1, background: color ?? GOLD_MID, opacity: 0.4 }}
          />
          <span
            style={{
              fontSize: Math.max(7, size * 0.3),
              fontWeight: 700,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: color ?? "var(--muted-foreground)",
              lineHeight: 1,
            }}
          >
            {PLATFORM}
          </span>
          <span
            aria-hidden="true"
            style={{ flex: 1, height: 1, background: color ?? GOLD_MID, opacity: 0.4 }}
          />
        </span>
      </span>
    );
  }

  if (variant === "gradient-q-badge") {
    return (
      <span className={`select-none inline-flex items-center ${className}`} style={{ gap: size * 0.34 }}>
        <span className="font-display" style={{ ...base, fontWeight: 900 }}>
          <span style={{ color: color ?? "var(--foreground)" }}>{head}</span>
          <span
            style={
              mono
                ? { color }
                : {
                    backgroundImage: `linear-gradient(100deg, ${GOLD_FROM}, ${GOLD_MID} 55%, ${GOLD_TO})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    filter: `drop-shadow(0 ${size * 0.05}px ${size * 0.3}px ${GOLD_MID}77)`,
                  }
            }
          >
            {accent}
          </span>
          <span style={{ color: color ?? "var(--foreground)" }}>{tail}</span>
        </span>
        <span
          style={{
            fontSize: Math.max(7, size * 0.3),
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            lineHeight: 1,
            padding: `${size * 0.16}px ${size * 0.3}px`,
            borderRadius: 999,
            color: color ?? "var(--primary)",
            background: mono ? "rgba(255,255,255,0.16)" : "var(--primary-soft, rgba(6,182,212,0.14))",
          }}
        >
          {PLATFORM}
        </span>
      </span>
    );
  }


  // aqua-flow (default) — foreground name with a golden Q
  return (
    <span className={`font-display select-none ${className}`} style={{ ...base, fontWeight: 900 }}>
      <span style={{ color: color ?? "var(--foreground)" }}>{head}</span>
      <span
        style={
          mono
            ? { color }
            : {
                backgroundImage: `linear-gradient(100deg, ${GOLD_FROM} 0%, ${GOLD_MID} 55%, ${GOLD_TO} 100%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: `drop-shadow(0 ${size * 0.05}px ${size * 0.3}px ${GOLD_MID}66)`,
              }
        }
      >
        {accent}
      </span>
      <span style={{ color: color ?? "var(--foreground)" }}>{tail}</span>
    </span>
  );
}
