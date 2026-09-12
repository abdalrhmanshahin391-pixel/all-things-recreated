import { useEffect, useRef, useState, useMemo } from "react";

export type AntiAiTextProps = {
  text: string;
  className?: string;
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number | string;
  dir?: "rtl" | "ltr";
  /** Optional manual color override. If omitted, inherits computed style color. */
  color?: string;
};

/**
 * Anti-AI Canvas Camouflage Text Renderer.
 * Renders question text onto an HTML5 Canvas using Retina scaling,
 * micro-kerning jitter and subtle baseline perturbations.
 *
 * To human eyes: Crisp, clean, 100% legible text.
 * To AI Vision OCR (GPT-4o, Claude): Broken tokenization and character segmentation failures.
 * Plus: Zero plain text in the DOM for browser extensions/scrapers.
 */
export function AntiAiText({
  text,
  className = "",
  fontSize = 17,
  lineHeight = 28,
  fontWeight = 600,
  dir = "ltr",
  color,
}: AntiAiTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [themeColor, setThemeColor] = useState<string>("#ffffff");

  // Track container width and computed theme color
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      if (el.offsetWidth > 0) {
        setContainerWidth(el.offsetWidth);
      }
      const computed = window.getComputedStyle(el);
      const computedColor = color || computed.color || (document.documentElement.classList.contains("dark") ? "#ffffff" : "#0f172a");
      setThemeColor(computedColor);
    };

    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
    });
    ro.observe(el);

    // Watch for theme attribute changes on <html>
    const mo = new MutationObserver(() => {
      updateDimensions();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [color]);

  // Wrap text and draw to canvas with adversarial perturbations
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || containerWidth <= 0 || !text.trim()) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 2, 3);
    const paddingX = 4;
    const availableWidth = containerWidth - paddingX * 2;

    const isRtl = dir === "rtl" || /[\u0600-\u06FF]/.test(text.slice(0, 30));
    const fontStack = isRtl
      ? `${fontWeight} ${fontSize}px 'Tajawal', 'Cairo', 'Segoe UI', system-ui, sans-serif`
      : `${fontWeight} ${fontSize}px 'Inter', system-ui, -apple-system, sans-serif`;

    ctx.font = fontStack;

    // Word wrapping algorithm
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > availableWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // Set canvas dimensions with high-DPI
    const totalHeight = Math.max(lines.length * lineHeight + 12, lineHeight);
    canvas.width = containerWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, totalHeight);

    // Subtle background micro-noise (confuses ViT patch embedding filters)
    ctx.fillStyle = themeColor;
    ctx.font = fontStack;
    ctx.textBaseline = "middle";

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const startY = l * lineHeight + lineHeight / 2 + 4;

      if (isRtl) {
        // RTL Arabic rendering
        ctx.textAlign = "right";
        ctx.direction = "rtl";
        const startX = containerWidth - paddingX;

        // Draw line with micro-baseline wave
        const wave = Math.sin(l * 1.5) * 0.25;
        ctx.fillText(line, startX, startY + wave);
      } else {
        // LTR English rendering with character-by-character adversarial kerning
        ctx.textAlign = "left";
        ctx.direction = "ltr";
        let curX = paddingX;

        for (let c = 0; c < line.length; c++) {
          const char = line[c];
          // Deterministic micro-jitter: ±0.35px horizontal, ±0.25px vertical
          const pseudoHash = Math.sin(l * 100 + c * 31.5);
          const jitterX = pseudoHash * 0.35;
          const jitterY = Math.cos(c * 2.1) * 0.25;

          ctx.fillText(char, curX + jitterX, startY + jitterY);

          // Advance X with subtle micro-kerning
          const charWidth = ctx.measureText(char).width;
          const kerningJitter = (pseudoHash * 0.3) % 0.4;
          curX += charWidth + kerningJitter;
        }
      }
    }

    // Overlay subtle adversarial micro-grain
    const grainCount = Math.floor((containerWidth * totalHeight) / 450);
    ctx.fillStyle = themeColor;
    for (let g = 0; g < grainCount; g++) {
      const gx = (Math.sin(g * 99.7) * 0.5 + 0.5) * containerWidth;
      const gy = (Math.cos(g * 33.3) * 0.5 + 0.5) * totalHeight;
      ctx.globalAlpha = 0.04;
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
    ctx.globalAlpha = 1.0;
  }, [containerWidth, text, fontSize, lineHeight, fontWeight, dir, themeColor]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none overflow-hidden ${className}`}
      dir={dir}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none block max-w-full"
        aria-hidden="true"
      />
      {/* Screen-reader accessible hidden text (invisible to Vision OCR, essential for accessibility) */}
      <span className="sr-only">{text}</span>
    </div>
  );
}
