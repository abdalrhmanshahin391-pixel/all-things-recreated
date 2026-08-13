/**
 * Repeating diagonal SVG watermark, embedded as a data-URI background.
 * Tuned for dark backgrounds — white text at low opacity.
 */
export function watermarkBackground(siteName: string, opacity = 0.09) {
  const text = (siteName || "").toUpperCase();
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='420' height='260' viewBox='0 0 420 260'>
  <g transform='rotate(-28 210 130)' fill='#ffffff' fill-opacity='${opacity}' font-family='Inter, system-ui, sans-serif' font-weight='800' font-size='22' letter-spacing='4'>
    <text x='10' y='80'>${text}</text>
    <text x='10' y='200'>${text}</text>
  </g>
</svg>`.trim();
  const enc = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${enc}")`;
}

/** Big diagonal center stamp — harder to crop out, still subtle. */
export function CenterWatermark({ siteName }: { siteName: string }) {
  const text = (siteName || "").toUpperCase();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
      <svg
        viewBox="0 0 800 200"
        className="w-[140%] max-w-none opacity-[0.07]"
        style={{ transform: "rotate(-22deg)" }}
      >
        <defs>
          <linearGradient id="wm-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="50%" stopColor="#f9a8d4" />
            <stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
        </defs>
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={900}
          fontSize="120"
          letterSpacing="14"
          fill="url(#wm-grad)"
          stroke="#ffffff"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}

export function WatermarkLayer({ siteName }: { siteName: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: watermarkBackground(siteName),
        backgroundRepeat: "repeat",
      }}
    />
  );
}
