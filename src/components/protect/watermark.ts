/** Personal, forensic watermark engine. Every leaked screenshot carries the account. */

export type WatermarkIdentity = {
  name: string;
  username: string;
  email: string;
  phone: string;
  phoneTail: string;
  code: string;
};

export function identityLines(id: WatermarkIdentity) {
  const userStr = id.username ? `@${id.username}` : "";
  const nameStr = id.name || "";
  const phoneStr = id.phoneTail ? `TEL: •••${id.phoneTail}` : id.phone ? `TEL: •••${id.phone.slice(-4)}` : "";
  const idStr = `CODE: ${id.code}`;

  return [userStr || nameStr, nameStr && userStr ? nameStr : "", phoneStr, idStr].filter(Boolean);
}

/**
 * AI-Resistant tiled identity watermark.
 * Uses an interlocking, dual-angle grid with micro-noise so AI inpainting models
 * cannot separate the watermark from medical question text without destroying the underlying text.
 */
export function tiledWatermark(id: WatermarkIdentity, opacity = 0.18, tick = 0) {
  const lines = identityLines(id);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Subtle dynamic jitter based on session tick counter to defeat multi-frame diffing
  const jitterX = (tick % 7) * 4;
  const jitterY = (tick % 5) * 3;

  const block = (x: number, y: number) =>
    lines
      .map(
        (l, i) =>
          `<text x='${x}' y='${y + i * 18}' font-weight='800'>${esc(l)}</text>`,
      )
      .join("");

  const crossLine = (x: number, y: number) =>
    `<text x='${x}' y='${y}' font-size='10' font-weight='700' letter-spacing='2'>[TRACED: ${esc(id.code)}]</text>`;

  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='360' height='260' viewBox='0 0 360 260'>
  <!-- Secondary cross-angle layer (disrupts AI direction filters) -->
  <g transform='rotate(16 180 130)' fill='#475569' fill-opacity='${(opacity * 0.55).toFixed(3)}' font-family='Inter, system-ui, sans-serif'>
    ${crossLine(20 + jitterX, 60 + jitterY)}
    ${crossLine(200 + jitterX, 190 + jitterY)}
  </g>
  <!-- Primary diagonal identity block -->
  <g transform='rotate(-24 180 130)' fill='#334155' fill-opacity='${opacity.toFixed(3)}' font-family='Inter, system-ui, sans-serif' font-size='12' letter-spacing='1.1'>
    ${block(-30 + jitterX, 45 + jitterY)}
    ${block(160 + jitterX, 165 + jitterY)}
  </g>
</svg>`.trim();

  const enc = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${enc}")`;
}

/**
 * Near-invisible fingerprint: the account code encoded as a faint dot grid.
 * Survives cropping and image scrubbing because it repeats in micro-clusters.
 */
export function fingerprintPattern(code: string, opacity = 0.045) {
  const bits = code
    .split("")
    .map((c) => parseInt(c, 36) || 0)
    .slice(0, 8);

  const dots = bits
    .map((v, i) => {
      const x = 6 + i * 14;
      const y = 6 + (v % 5) * 12;
      return `<circle cx='${x}' cy='${y}' r='1.5' />`;
    })
    .join("");

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='70' viewBox='0 0 120 70'><g fill='#0f172a' fill-opacity='${opacity}'>${dots}</g></svg>`;
  const enc = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${enc}")`;
}

/* =========================================================================
   Zero-Width Invisible Steganography
   Encodes the student's 8-character trace code inside invisible unicode spaces.
   If text is copied or scraped into chat/AI, the hidden code travels with it!
========================================================================= */

const ZW_0 = "\u200B"; // Zero-width space represents binary 0
const ZW_1 = "\u200C"; // Zero-width non-joiner represents binary 1
const ZW_START = "\u200D\u200E"; // Start delimiter
const ZW_END = "\u200F\u200D"; // End delimiter

/**
 * Encodes an account trace code into an invisible zero-width string.
 */
export function encodeZeroWidth(code: string): string {
  if (!code) return "";
  const clean = code.trim().toUpperCase().slice(0, 16);
  const payload = `AQ:${clean}`;

  let binary = "";
  for (let i = 0; i < payload.length; i++) {
    binary += payload.charCodeAt(i).toString(2).padStart(8, "0");
  }

  let zw = ZW_START;
  for (let i = 0; i < binary.length; i++) {
    zw += binary[i] === "1" ? ZW_1 : ZW_0;
  }
  zw += ZW_END;
  return zw;
}

/**
 * Scans any text for invisible zero-width markers and decodes the student trace code.
 */
export function decodeZeroWidth(text: string): string | null {
  if (!text) return null;

  // Search for delimited block
  const startIdx = text.indexOf(ZW_START);
  const endIdx = text.indexOf(ZW_END, startIdx + ZW_START.length);

  let binary = "";
  if (startIdx !== -1 && endIdx !== -1) {
    const zwContent = text.slice(startIdx + ZW_START.length, endIdx);
    for (const ch of zwContent) {
      if (ch === ZW_0) binary += "0";
      else if (ch === ZW_1) binary += "1";
    }
  } else {
    // Fallback: collect all zero-width bits in the text
    for (const ch of text) {
      if (ch === ZW_0) binary += "0";
      else if (ch === ZW_1) binary += "1";
    }
  }

  if (binary.length >= 24 && binary.length % 8 === 0) {
    let decoded = "";
    for (let i = 0; i < binary.length; i += 8) {
      decoded += String.fromCharCode(parseInt(binary.slice(i, i + 8), 2));
    }
    const match = decoded.match(/AQ:([0-9A-Z]{4,16})/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Injects invisible zero-width fingerprint seamlessly into user-visible text.
 */
export function injectZeroWidthFingerprint(content: string, code: string): string {
  const zw = encodeZeroWidth(code);
  if (!content) return zw;
  const firstSpace = content.indexOf(" ");
  if (firstSpace > 0) {
    return content.slice(0, firstSpace) + zw + content.slice(firstSpace) + zw;
  }
  return content + zw;
}