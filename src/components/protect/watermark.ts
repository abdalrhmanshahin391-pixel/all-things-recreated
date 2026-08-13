/** Personal, forensic watermark art. Every leaked screenshot carries the account. */

export type WatermarkIdentity = {
  name: string;
  username: string;
  email: string;
  phone: string;
  phoneTail: string;
  code: string;
};

export function identityLines(id: WatermarkIdentity) {
  // Username, phone and email — enough to identify a leaker, quiet enough to read through.
  const first = id.username ? `@${id.username}` : id.name || "";
  const second = id.phone || (id.phoneTail ? `•••${id.phoneTail}` : "");
  const third = id.email || "";
  return [first, second, third].filter(Boolean);
}

/** Tiled diagonal identity text as a repeating data-URI background. */
export function tiledWatermark(id: WatermarkIdentity, opacity = 0.08) {
  const lines = identityLines(id);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const block = (x: number, y: number) =>
    lines.map((l, i) => `<text x='${x}' y='${y + i * 19}'>${esc(l)}</text>`).join("");
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='340' height='240' viewBox='0 0 340 240'>
  <g transform='rotate(-24 170 120)' fill='#64748b' fill-opacity='${opacity}' font-family='Inter, system-ui, sans-serif' font-weight='700' font-size='13' letter-spacing='1.2'>
    ${block(-40, 40)}
    ${block(150, 150)}
  </g>
</svg>`.trim();
  const enc = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${enc}")`;
}

/**
 * Near-invisible fingerprint: the account code encoded as a faint dot grid.
 * Survives cropping better than text because it repeats across the page.
 */
export function fingerprintPattern(code: string, opacity = 0.035) {
  const bits = code
    .split("")
    .map((c) => parseInt(c, 36) || 0)
    .slice(0, 8);
  const dots = bits
    .map((v, i) => {
      const x = 6 + i * 14;
      const y = 6 + (v % 5) * 12;
      return `<circle cx='${x}' cy='${y}' r='1.6' />`;
    })
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='70' viewBox='0 0 120 70'><g fill='#000000' fill-opacity='${opacity}'>${dots}</g></svg>`;
  const enc = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${enc}")`;
}