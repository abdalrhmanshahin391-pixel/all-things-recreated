import { forwardRef } from "react";
import { FONT_STACKS, SIZES, patternLayers, type AdDesign } from "@/lib/ad-studio";
import { Block, Cta, DeviceFrame, PlanCard, PriceRow, Ribbon, StatBlock, TickList } from "./parts";

export const CANVAS = 1080;

type Props = { design: AdDesign; bgUrl: string | null; urls?: Record<string, string | null> };

/** The ad artboard. Rendered at full size; the page scales it with a transform. */
export const AdCanvas = forwardRef<HTMLDivElement, Props>(function AdCanvas({ design: d, bgUrl, urls = {} }, ref) {
  const size = SIZES[d.size] ?? SIZES.square;
  const pat = patternLayers(d.bg.pattern, d.accent);
  const justify = d.vertical === "top" ? "flex-start" : d.vertical === "bottom" ? "flex-end" : "center";
  const items = d.align === "center" ? "center" : d.align === "right" ? "flex-end" : "flex-start";
  const u = (k: string | null | undefined) => (k ? (urls[k] ?? null) : null);

  const corner = d.logo.corner;
  const logoPos: React.CSSProperties = {
    position: "absolute",
    top: corner.startsWith("t") ? d.padding * 0.55 : undefined,
    bottom: corner.startsWith("b") ? d.padding * 0.55 : undefined,
    left: corner.endsWith("l") ? d.padding * 0.6 : undefined,
    right: corner.endsWith("r") ? d.padding * 0.6 : undefined,
  };

  const background =
    d.bg.type === "solid"
      ? d.bg.color
      : d.bg.type === "diagonal"
        ? `linear-gradient(${d.bg.angle}deg, ${d.bg.from} 0 ${d.bg.split ?? 45}%, ${d.bg.to} ${d.bg.split ?? 45}% 100%)`
        : `linear-gradient(${d.bg.angle}deg, ${d.bg.from}, ${d.bg.to})`;

  const texts = (
    <>
      <Ribbon d={d} />
      <Block f={d.eyebrow} fallbackAlign={d.align} />
      <Block f={d.headline} fallbackAlign={d.align} extra={{ lineHeight: 1.02 }} />
      <Block f={d.subheadline} fallbackAlign={d.align} extra={{ lineHeight: 1.3 }} />
      <Block f={d.body} fallbackAlign={d.align} extra={{ lineHeight: 1.5 }} />
      {d.bulletsShow && (
        <TickList
          items={d.bullets.filter(Boolean)}
          icon={d.bulletIcon}
          size={d.bulletSize}
          color={d.bulletColor}
          accent={d.accent}
          align={d.align}
        />
      )}
      <PriceRow d={d} />
      <Cta d={d} />
    </>
  );

  let content: React.ReactNode;

  if (d.layout === "plans") {
    content = (
      <div style={{ position: "absolute", inset: 0, padding: d.padding, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: items }}>
          <Ribbon d={d} />
          <Block f={d.eyebrow} fallbackAlign={d.align} />
          <Block f={d.headline} fallbackAlign={d.align} extra={{ lineHeight: 1.04 }} />
          <Block f={d.subheadline} fallbackAlign={d.align} extra={{ lineHeight: 1.3 }} />
        </div>
        <div style={{ display: "flex", gap: 26, flex: 1, alignItems: "stretch", minHeight: 0 }}>
          {d.plans.map((p, i) => (
            <PlanCard key={i} p={p} url={u(p.image)} accent={d.accent} compact={d.plans.length > 2} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Cta d={d} />
        </div>
      </div>
    );
  } else if (d.layout === "deal") {
    const dev = d.devices[0];
    content = (
      <div style={{ position: "absolute", inset: 0, padding: d.padding, display: "flex", gap: 40, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, alignItems: items, minWidth: 0 }}>
          {texts}
        </div>
        <div style={{ width: "42%", position: "relative", height: "78%" }}>
          {dev?.show ? (
            <DeviceFrame dev={{ ...dev, x: 50, y: 50 }} url={u(dev.image)} />
          ) : (
            u(d.plans[0]?.image ?? null) && (
              <img
                src={u(d.plans[0]!.image)!}
                alt=""
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 32, border: `6px solid ${d.accent}` }}
              />
            )
          )}
        </div>
      </div>
    );
  } else if (d.layout === "feature") {
    content = (
      <div style={{ position: "absolute", inset: 0, padding: d.padding, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: items }}>
          <Ribbon d={d} />
          <Block f={d.eyebrow} fallbackAlign={d.align} />
          <Block f={d.headline} fallbackAlign={d.align} extra={{ lineHeight: 1.04 }} />
          <Block f={d.subheadline} fallbackAlign={d.align} extra={{ lineHeight: 1.3 }} />
        </div>
        {d.bulletsShow && (
          <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
            {d.bullets.filter(Boolean).slice(0, 3).map((b, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 24,
                  padding: "18px 16px",
                  textAlign: "center",
                  background: "rgba(255,255,255,.08)",
                  border: `2px solid ${d.accent}55`,
                  fontSize: d.bulletSize,
                  fontWeight: 800,
                  color: d.bulletColor,
                }}
              >
                {b}
              </div>
            ))}
          </div>
        )}
        <div style={{ position: "relative", flex: 1 }}>
          {d.devices.map((dev, i) => (
            <DeviceFrame key={i} dev={dev} url={u(dev.image)} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Cta d={d} />
        </div>
      </div>
    );
  } else if (d.layout === "stats") {
    content = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: d.padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 34,
          alignItems: "center",
        }}
      >
        <Ribbon d={d} />
        <Block f={d.eyebrow} fallbackAlign="center" />
        <Block f={d.headline} fallbackAlign="center" extra={{ lineHeight: 1.04 }} />
        <div style={{ display: "flex", gap: 60, justifyContent: "center", flexWrap: "wrap" }}>
          {d.stats.map((s, i) => (
            <StatBlock key={i} s={s} accent={d.accent} color={d.headline.color} />
          ))}
        </div>
        <Block f={d.subheadline} fallbackAlign="center" extra={{ lineHeight: 1.3 }} />
        <Cta d={d} />
      </div>
    );
  } else if (d.layout === "split") {
    content = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: d.padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: justify,
          alignItems: items,
          gap: 26,
        }}
      >
        <Ribbon d={d} />
        <Block f={d.eyebrow} fallbackAlign={d.align} />
        <Block f={d.headline} fallbackAlign={d.align} extra={{ lineHeight: 0.98 }} />
        <Block f={d.subheadline} fallbackAlign={d.align} extra={{ lineHeight: 1.3 }} />
        {d.bulletsShow && (
          <TickList items={d.bullets.filter(Boolean)} icon={d.bulletIcon} size={d.bulletSize} color={d.bulletColor} accent={d.accent} align={d.align} />
        )}
        <PriceRow d={d} />
        <Cta d={d} />
      </div>
    );
  } else {
    content = (
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
            width: "100%",
            padding: d.card ? 44 : 0,
            borderRadius: d.card ? 32 : 0,
            background: d.card
              ? `color-mix(in srgb, ${d.cardColor} ${Math.round(d.cardOpacity * 100)}%, transparent)`
              : "transparent",
          }}
        >
          {texts}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      dir={d.dir}
      style={{
        position: "relative",
        width: size.w,
        height: size.h,
        overflow: "hidden",
        borderRadius: d.radius,
        background,
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
        <div style={{ ...logoPos, fontSize: 30, fontWeight: 900, letterSpacing: 1, color: d.logo.color, zIndex: 3 }}>
          {d.logo.text}
        </div>
      )}

      {/* free-floating devices for the stack/split layouts */}
      {(d.layout === "stack" || d.layout === "split" || d.layout === "stats") &&
        d.devices.map((dev, i) => <DeviceFrame key={i} dev={dev} url={u(dev.image)} />)}

      {content}

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
});
