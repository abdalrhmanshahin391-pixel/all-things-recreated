import type { AdDesign, AdDevice, AdPlan, AdTextField } from "@/lib/ad-studio";
import { savePercent } from "@/lib/ad-studio";

export function textStyle(f: AdTextField, fallbackAlign: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    fontSize: f.size,
    fontWeight: f.weight,
    color: f.color,
    fontStyle: f.italic ? "italic" : "normal",
    textTransform: f.uppercase ? "uppercase" : "none",
    letterSpacing: `${f.letterSpacing ?? 0}px`,
    lineHeight: 1.12,
    whiteSpace: "pre-line",
    textAlign: (f.align && f.align !== "auto" ? f.align : fallbackAlign) as React.CSSProperties["textAlign"],
    width: "100%",
    textShadow: f.shadow ? "0 6px 24px rgba(0,0,0,.45)" : "none",
    WebkitTextStroke: f.outline ? "2px rgba(0,0,0,.55)" : undefined,
    margin: 0,
    ...extra,
  };
}

/** Renders the text with the accent word tinted. */
export function AccentText({ f }: { f: AdTextField }) {
  const word = (f.accentWord ?? "").trim();
  if (!word) return <>{f.text}</>;
  const parts = f.text.split(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === word.toLowerCase() ? (
          <span key={i} style={{ color: f.accentColor || "#D4AF37" }}>{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function Block({ f, fallbackAlign, extra }: { f: AdTextField; fallbackAlign: string; extra?: React.CSSProperties }) {
  if (!f.show || !f.text) return null;
  const align = f.align && f.align !== "auto" ? f.align : fallbackAlign;
  return (
    <div style={{ width: "100%" }}>
      <p style={textStyle(f, fallbackAlign, extra)}>
        <AccentText f={f} />
      </p>
      {f.underline && (
        <div
          style={{
            height: 10,
            width: 220,
            marginTop: 18,
            borderRadius: 999,
            background: f.accentColor || "#D4AF37",
            marginLeft: align === "center" ? "auto" : align === "right" ? "auto" : 0,
            marginRight: align === "center" ? "auto" : align === "right" ? 0 : "auto",
          }}
        />
      )}
    </div>
  );
}

const ICONS: Record<string, string> = { check: "✓", dot: "•", star: "★", arrow: "→", spark: "✦" };

export function TickList({
  items, icon, size, color, accent, align,
}: { items: string[]; icon: string; size: number; color: string; accent: string; align: string }) {
  if (!items.length) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Math.round(size * 0.5),
        width: "100%",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: size * 1.15,
              height: size * 1.15,
              borderRadius: 999,
              background: accent,
              color: "#0B1B33",
              fontSize: size * 0.7,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            {ICONS[icon] ?? "✓"}
          </span>
          <span style={{ fontSize: size, fontWeight: 700, color }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- device mockups --------------------------- */

const DEVICE_SPECS: Record<string, { w: number; h: number; radius: number; bezel: number; notch: boolean; base?: boolean }> = {
  ipad: { w: 460, h: 620, radius: 34, bezel: 18, notch: false },
  "ipad-land": { w: 620, h: 460, radius: 34, bezel: 18, notch: false },
  iphone: { w: 280, h: 570, radius: 48, bezel: 12, notch: true },
  macbook: { w: 720, h: 450, radius: 16, bezel: 14, notch: false, base: true },
  browser: { w: 720, h: 470, radius: 16, bezel: 0, notch: false },
  screen: { w: 640, h: 420, radius: 24, bezel: 0, notch: false },
};

export function DeviceFrame({ dev, url }: { dev: AdDevice; url: string | null }) {
  if (!dev.show) return null;
  const s = DEVICE_SPECS[dev.kind] ?? DEVICE_SPECS.ipad!;
  const screen = (
    <div
      style={{
        position: "relative",
        width: s.w - s.bezel * 2,
        height: s.h - s.bezel * 2,
        borderRadius: Math.max(s.radius - s.bezel, 6),
        overflow: "hidden",
        background: "#0B1B33",
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
        />
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        left: `${dev.x}%`,
        top: `${dev.y}%`,
        transform: `translate(-50%, -50%) rotate(${dev.rotate}deg) scale(${dev.scale / 100})`,
        filter: dev.shadow ? "drop-shadow(0 40px 60px rgba(0,0,0,.55))" : undefined,
      }}
    >
      {dev.glow && (
        <div
          style={{
            position: "absolute",
            inset: -60,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(212,175,55,.35), transparent 70%)",
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          width: s.w,
          height: s.h,
          borderRadius: s.radius,
          background: dev.kind === "browser" ? "#1B2536" : "#0A0F18",
          border: "3px solid rgba(255,255,255,.18)",
          padding: s.bezel,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {dev.kind === "browser" && (
          <div style={{ display: "flex", gap: 8, padding: "0 4px 10px" }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
            ))}
          </div>
        )}
        {s.notch && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 110,
              height: 22,
              borderRadius: 999,
              background: "#0A0F18",
              zIndex: 2,
            }}
          />
        )}
        <div style={{ flex: 1, display: "flex" }}>{screen}</div>
      </div>
      {s.base && (
        <div
          style={{
            width: s.w * 1.18,
            height: 22,
            marginLeft: -(s.w * 0.09),
            borderRadius: "0 0 18px 18px",
            background: "linear-gradient(#2B3547,#151C28)",
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- plan cards ----------------------------- */

export function PlanCard({ p, url, accent, compact }: { p: AdPlan; url: string | null; accent: string; compact?: boolean }) {
  const save = p.save || savePercent(p.price, p.old);
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: compact ? 26 : 34,
        borderRadius: 34,
        background: p.bg,
        color: p.color,
        border: p.highlight ? `4px solid ${p.accent || accent}` : "3px solid rgba(255,255,255,.12)",
        boxShadow: "0 24px 60px rgba(0,0,0,.35)",
        textAlign: "left",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: compact ? 38 : 46, fontWeight: 900, lineHeight: 1 }}>{p.title}</div>
        {save && (
          <span
            style={{
              background: p.accent || accent,
              color: "#0B1B33",
              fontSize: 20,
              fontWeight: 900,
              padding: "8px 14px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {save}
          </span>
        )}
      </div>
      {p.subtitle && <div style={{ fontSize: 24, fontWeight: 700, opacity: 0.75 }}>{p.subtitle}</div>}

      {url && (
        <div style={{ height: compact ? 130 : 170, borderRadius: 22, overflow: "hidden" }}>
          <img src={url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}

      {(p.price || p.old) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          {p.price && (
            <span style={{ fontSize: compact ? 56 : 68, fontWeight: 900, color: p.accent || accent, lineHeight: 1 }}>
              {p.price}
            </span>
          )}
          {p.old && (
            <span style={{ fontSize: 30, fontWeight: 800, opacity: 0.6, textDecoration: "line-through" }}>{p.old}</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {p.bullets.filter(Boolean).map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: p.accent || accent, fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>✓</span>
            <span style={{ fontSize: 24, fontWeight: 600, opacity: 0.95 }}>{b}</span>
          </div>
        ))}
      </div>

      {p.note && <div style={{ fontSize: 20, fontWeight: 700, opacity: 0.7 }}>{p.note}</div>}
    </div>
  );
}

export function StatBlock({ s, accent, color }: { s: { value: string; label: string }; accent: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 120, fontWeight: 900, color: accent, lineHeight: 1 }}>{s.value}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color, opacity: 0.9, marginTop: 10 }}>{s.label}</div>
    </div>
  );
}

export function Ribbon({ d }: { d: AdDesign }) {
  if (!d.ribbon.show || !d.ribbon.text) return null;
  return (
    <span
      style={{
        background: d.ribbon.color,
        color: d.ribbon.textColor,
        fontSize: 26,
        fontWeight: 900,
        letterSpacing: 3,
        textTransform: "uppercase",
        padding: "12px 26px",
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      {d.ribbon.text}
    </span>
  );
}

export function Cta({ d }: { d: AdDesign }) {
  if (!d.cta.show || !d.cta.text) return null;
  return (
    <span
      style={{
        background: d.cta.bg,
        color: d.cta.color,
        borderRadius: d.cta.radius,
        fontSize: d.cta.size,
        fontWeight: 900,
        padding: `${Math.round(d.cta.size * 0.55)}px ${Math.round(d.cta.size * 1.4)}px`,
        letterSpacing: 1,
        alignSelf: "flex-start",
      }}
    >
      {d.cta.text}
    </span>
  );
}

export function PriceRow({ d }: { d: AdDesign }) {
  if (!d.price.show || (!d.price.value && !d.price.old)) return null;
  const save = savePercent(d.price.value, d.price.old);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
      {d.price.old && (
        <span style={{ fontSize: d.price.size * 0.45, fontWeight: 800, color: d.subheadline.color, opacity: 0.7, textDecoration: "line-through" }}>
          {d.price.old}
        </span>
      )}
      {d.price.value && (
        <span style={{ fontSize: d.price.size, fontWeight: 900, color: d.price.color, lineHeight: 1 }}>{d.price.value}</span>
      )}
      {save && (
        <span style={{ background: d.accent, color: "#0B1B33", fontSize: d.price.size * 0.24, fontWeight: 900, padding: "8px 16px", borderRadius: 999 }}>
          {save}
        </span>
      )}
      {d.price.note && (
        <span style={{ fontSize: d.price.size * 0.3, fontWeight: 700, color: d.subheadline.color }}>{d.price.note}</span>
      )}
    </div>
  );
}
