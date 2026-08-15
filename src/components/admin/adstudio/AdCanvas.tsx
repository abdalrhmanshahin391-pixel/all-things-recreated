import { forwardRef } from "react";
import { FONT_STACKS, patternLayers, type AdDesign, type AdTextField } from "@/lib/ad-studio";

export const CANVAS = 1080;

function textStyle(f: AdTextField, extra?: React.CSSProperties): React.CSSProperties {
  return {
    fontSize: f.size,
    fontWeight: f.weight,
    color: f.color,
    fontStyle: f.italic ? "italic" : "normal",
    textTransform: f.uppercase ? "uppercase" : "none",
    letterSpacing: `${f.letterSpacing ?? 0}px`,
    lineHeight: 1.12,
    whiteSpace: "pre-line",
    textShadow: f.shadow ? "0 6px 24px rgba(0,0,0,.45)" : "none",
    WebkitTextStroke: f.outline ? "2px rgba(0,0,0,.55)" : undefined,
    margin: 0,
    ...extra,
  };
}

/** The 1080×1080 ad. Rendered at full size; the page scales it with a transform. */
export const AdCanvas = forwardRef<HTMLDivElement, { design: AdDesign; bgUrl: string | null }>(
  function AdCanvas({ design: d, bgUrl }, ref) {
    const pat = patternLayers(d.bg.pattern, d.accent);
    const justify =
      d.vertical === "top" ? "flex-start" : d.vertical === "bottom" ? "flex-end" : "center";
    const items = d.align === "center" ? "center" : d.align === "right" ? "flex-end" : "flex-start";

    const corner = d.logo.corner;
    const logoPos: React.CSSProperties = {
      position: "absolute",
      top: corner.startsWith("t") ? d.padding * 0.55 : undefined,
      bottom: corner.startsWith("b") ? d.padding * 0.55 : undefined,
      left: corner.endsWith("l") ? d.padding * 0.6 : undefined,
      right: corner.endsWith("r") ? d.padding * 0.6 : undefined,
    };

    return (
      <div
        ref={ref}
        dir={d.dir}
        style={{
          position: "relative",
          width: CANVAS,
          height: CANVAS,
          overflow: "hidden",
          borderRadius: d.radius,
          background:
            d.bg.type === "solid"
              ? d.bg.color
              : `linear-gradient(${d.bg.angle}deg, ${d.bg.from}, ${d.bg.to})`,
          fontFamily: FONT_STACKS[d.font],
          textAlign: d.align,
          isolation: "isolate",
        }}
      >
        {d.bg.type === "image" && bgUrl && (
          <img
            src={bgUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${d.bg.zoom / 100})`,
              filter: d.bg.blur ? `blur(${d.bg.blur}px)` : undefined,
            }}
          />
        )}

        {pat && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: pat.backgroundImage,
              backgroundSize: pat.backgroundSize,
              opacity: pat.opacity,
            }}
          />
        )}

        {d.bg.overlay > 0 && (
          <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${d.bg.overlay})` }} />
        )}

        {d.frame && (
          <div
            style={{
              position: "absolute",
              inset: d.padding * 0.42,
              border: `4px solid ${d.frameColor}`,
              borderRadius: 24,
              opacity: 0.85,
            }}
          />
        )}

        {d.logo.show && (
          <div
            style={{
              ...logoPos,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: 1,
              color: d.logo.color,
            }}
          >
            {d.logo.text}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: justify,
            alignItems: items,
            padding: d.padding,
            gap: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: items,
              gap: 22,
              maxWidth: "100%",
              padding: d.card ? 44 : 0,
              borderRadius: d.card ? 32 : 0,
              background: d.card
                ? `color-mix(in srgb, ${d.cardColor} ${Math.round(d.cardOpacity * 100)}%, transparent)`
                : "transparent",
              backdropFilter: d.card ? "blur(2px)" : undefined,
            }}
          >
            {d.ribbon.show && d.ribbon.text && (
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
                }}
              >
                {d.ribbon.text}
              </span>
            )}

            {d.eyebrow.show && d.eyebrow.text && <p style={textStyle(d.eyebrow)}>{d.eyebrow.text}</p>}
            {d.headline.show && d.headline.text && (
              <h1 style={textStyle(d.headline, { lineHeight: 1.02 })}>{d.headline.text}</h1>
            )}
            {d.subheadline.show && d.subheadline.text && (
              <p style={textStyle(d.subheadline, { lineHeight: 1.3 })}>{d.subheadline.text}</p>
            )}
            {d.body.show && d.body.text && (
              <p style={textStyle(d.body, { lineHeight: 1.5 })}>{d.body.text}</p>
            )}

            {d.price.show && (d.price.value || d.price.old) && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
                {d.price.old && (
                  <span
                    style={{
                      fontSize: d.price.size * 0.45,
                      fontWeight: 800,
                      color: "#FFFFFF",
                      opacity: 0.65,
                      textDecoration: "line-through",
                    }}
                  >
                    {d.price.old}
                  </span>
                )}
                {d.price.value && (
                  <span style={{ fontSize: d.price.size, fontWeight: 900, color: d.price.color, lineHeight: 1 }}>
                    {d.price.value}
                  </span>
                )}
                {d.price.note && (
                  <span style={{ fontSize: d.price.size * 0.3, fontWeight: 700, color: "#E8EEF7" }}>
                    {d.price.note}
                  </span>
                )}
              </div>
            )}

            {d.cta.show && d.cta.text && (
              <span
                style={{
                  background: d.cta.bg,
                  color: d.cta.color,
                  borderRadius: d.cta.radius,
                  fontSize: d.cta.size,
                  fontWeight: 900,
                  padding: `${Math.round(d.cta.size * 0.55)}px ${Math.round(d.cta.size * 1.4)}px`,
                  letterSpacing: 1,
                }}
              >
                {d.cta.text}
              </span>
            )}
          </div>
        </div>

        {d.footer.show && d.footer.text && (
          <div
            style={{
              position: "absolute",
              bottom: d.padding * 0.5,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: d.footer.size,
              fontWeight: 700,
              color: d.footer.color,
              opacity: 0.9,
            }}
          >
            {d.footer.text}
          </div>
        )}
      </div>
    );
  },
);
