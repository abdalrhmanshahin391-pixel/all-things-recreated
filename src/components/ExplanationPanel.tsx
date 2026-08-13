import React, { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, X, StickyNote, Lightbulb, CheckCircle2, XCircle, Table as TableIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
// mhchem adds \ce{} so chemistry (structures, ions, reaction arrows) renders properly.
import "katex/contrib/mhchem";
import DOMPurify from "dompurify";


type Section = {
  kind: "concept" | "correct" | "wrong" | "summary";
  title: string;
  body: string;
};

// Some models occasionally emit the whole markdown table on a single line.
// Re-insert real line breaks so remark-gfm renders it as a table instead of
// showing the raw "| Option | Verdict | ..." text.
function normalizeMarkdownTables(raw: string): string {
  if (!raw) return raw;
  if (/\|\s*[-:]+\s*\|/.test(raw) && /\n\s*\|/.test(raw)) return raw;
  return raw.replace(
    /(\|[^\n]*\|)(\s*\|\s*[-:]+[-:\s|]*\|)([^\n]*)/g,
    (_m, header: string, sep: string, rest: string) => {
      const rows = rest.trim().split(/(?<=\|)\s+(?=\|)/g).filter(Boolean);
      return `${header.trim()}\n${sep.trim()}\n${rows.map((r) => r.trim()).join("\n")}`;
    },
  );
}

function parseExplanation(raw: string): Section[] {
  const text = normalizeMarkdownTables(raw.trim());
  if (!text) return [];
  const correctRe = /(?:^|\n)\s*\**\s*why\s+the\s+correct\s+answer\s+is\s+right\**\s*[:\s]*/i;
  const wrongRe = /(?:^|\n)\s*\**\s*why\s+the\s+other\s+options?\s+(?:are|is)\s+wrong\**\s*[:\s]*/i;
  const summaryRe = /(?:^|\n)\s*\**\s*summary\**\s*[:\s]*/i;
  const conceptRe = /(?:^|\n)\s*\**\s*concept\**\s*[:\s]*/i;

  const find = (re: RegExp) => {
    const m = text.match(re);
    return m ? { idx: text.indexOf(m[0]), len: m[0].length } : null;
  };

  const cMatch = find(conceptRe);
  const rMatch = find(correctRe);
  const wMatch = find(wrongRe);
  const sMatch = find(summaryRe);

  type Marker = { kind: Section["kind"]; title: string; start: number; bodyStart: number };
  const markers: Marker[] = [];
  if (cMatch) markers.push({ kind: "concept", title: "Concept", start: cMatch.idx, bodyStart: cMatch.idx + cMatch.len });
  else if (!rMatch && !wMatch && !sMatch) {
    return [{ kind: "concept", title: "Concept", body: text }];
  } else {
    const firstStart = Math.min(
      ...[rMatch, wMatch, sMatch].filter(Boolean).map((m) => (m as { idx: number }).idx),
    );
    const concept = text.slice(0, firstStart).trim();
    if (concept) markers.push({ kind: "concept", title: "Concept", start: 0, bodyStart: 0 });
  }
  if (rMatch) markers.push({ kind: "correct", title: "Why the correct answer is right", start: rMatch.idx, bodyStart: rMatch.idx + rMatch.len });
  if (wMatch) markers.push({ kind: "wrong", title: "Why the other options are wrong", start: wMatch.idx, bodyStart: wMatch.idx + wMatch.len });
  if (sMatch) markers.push({ kind: "summary", title: "Summary", start: sMatch.idx, bodyStart: sMatch.idx + sMatch.len });

  markers.sort((a, b) => a.start - b.start);
  const sections: Section[] = [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const next = markers[i + 1];
    const end = next ? next.start : text.length;
    let body =
      m.kind === "concept" && m.bodyStart === 0
        ? text.slice(0, end).trim()
        : text.slice(m.bodyStart, end).trim();
    // Peel off a trailing markdown table from non-summary sections so it
    // becomes its own Summary block at the bottom.
    if (m.kind !== "summary") {
      const tableMatch = body.match(/(\n\s*\|[^\n]*\|[\s\S]*?)$/);
      if (tableMatch && /\|\s*[-:]+\s*\|/.test(tableMatch[1])) {
        const tableStart = body.lastIndexOf(tableMatch[1]);
        const tableBody = body.slice(tableStart).trim();
        body = body.slice(0, tableStart).trim();
        if (body) sections.push({ kind: m.kind, title: m.title, body });
        sections.push({ kind: "summary", title: "Summary", body: tableBody });
        continue;
      }
    }
    if (body) sections.push({ kind: m.kind, title: m.title, body });
  }
  return sections;
}

export type CapturePayload = {
  snippetHtml: string;
  snippetText: string;
};

type Props = {
  explanation: string;
  onCapture: (payload: CapturePayload) => void;
};

// Inject inline styles into the captured fragment so it renders legibly
// inside the Save dialog and Notes page regardless of theme.
function styleCapturedHtml(rawHtml: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHtml;

  wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    el.style.color = "#0a0a0a";
    if (tag === "strong" || tag === "b") {
      el.style.fontWeight = "700";
    }
    if (tag === "table") {
      el.style.width = "100%";
      el.style.borderCollapse = "collapse";
      el.style.background = "#ffffff";
      el.style.margin = "8px 0";
      el.style.fontSize = "14px";
    }
    if (tag === "th") {
      el.style.background = "#0a0a0a";
      el.style.color = "#ffffff";
      el.style.padding = "10px 12px";
      el.style.textAlign = "left";
      el.style.fontWeight = "700";
      el.style.border = "1px solid #0a0a0a";
    }
    if (tag === "td") {
      el.style.background = "#ffffff";
      el.style.padding = "10px 12px";
      el.style.border = "1px solid #e4e4e7";
      el.style.verticalAlign = "top";
    }
    if (tag === "p") el.style.margin = "6px 0";
    if (tag === "ul" || tag === "ol") {
      el.style.margin = "6px 0";
      el.style.paddingLeft = "20px";
    }
  });

  return DOMPurify.sanitize(wrapper.innerHTML);
}

const headingStyles: Record<Section["kind"], { color: string; icon: React.ReactNode; label: string }> = {
  concept: {
    color: "text-amber-800",
    icon: <Lightbulb className="w-[18px] h-[18px] text-amber-600" />,
    label: "Concept",
  },
  correct: {
    color: "text-emerald-700",
    icon: <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600" />,
    label: "Why the correct answer is right",
  },
  wrong: {
    color: "text-rose-700",
    icon: <XCircle className="w-[18px] h-[18px] text-rose-600" />,
    label: "Why the other options are wrong",
  },
  summary: {
    color: "text-foreground",
    icon: <TableIcon className="w-[18px] h-[18px] text-muted-foreground" />,
    label: "Summary",
  },
};

export function ExplanationPanel({ explanation, onCapture }: Props) {
  const [captureMode, setCaptureMode] = useState(false);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRangeRef = useRef<Range | null>(null);

  const sections = useMemo(() => parseExplanation(explanation), [explanation]);

  function toggleCapture() {
    setCaptureMode((v) => !v);
    setFloatPos(null);
    pendingRangeRef.current = null;
    window.getSelection()?.removeAllRanges();
  }

  useEffect(() => {
    if (!captureMode) return;

    function updateFromSelection() {
      const sel = window.getSelection();
      const container = containerRef.current;
      if (!sel || !container || sel.rangeCount === 0 || sel.isCollapsed) {
        setFloatPos(null);
        pendingRangeRef.current = null;
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setFloatPos(null);
        pendingRangeRef.current = null;
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setFloatPos(null);
        pendingRangeRef.current = null;
        return;
      }
      pendingRangeRef.current = range.cloneRange();
      const rects = range.getClientRects();
      const last = rects[rects.length - 1];
      if (!last) {
        setFloatPos(null);
        return;
      }
      const x = Math.min(window.innerWidth - 180, Math.max(12, last.right - 60));
      const y = Math.min(window.innerHeight - 60, last.bottom + 10);
      setFloatPos({ x, y });
    }

    function onPointerUp() { requestAnimationFrame(updateFromSelection); }
    function onSelChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setFloatPos(null);
        pendingRangeRef.current = null;
      }
    }
    function onScroll() { requestAnimationFrame(updateFromSelection); }

    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("selectionchange", onSelChange);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectionchange", onSelChange);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [captureMode]);

  function handleCapture() {
    const range = pendingRangeRef.current;
    if (!range) return;
    const frag = range.cloneContents();
    const tmp = document.createElement("div");
    tmp.appendChild(frag);
    const rawHtml = tmp.innerHTML;
    const text = range.toString();
    const snippetHtml = styleCapturedHtml(rawHtml);

    pendingRangeRef.current = null;
    setFloatPos(null);
    setCaptureMode(false);
    window.getSelection()?.removeAllRanges();

    onCapture({ snippetHtml, snippetText: text });
  }

  return (
    <div className="mx-6 mb-6 rounded-2xl border border-rose-900/15 bg-[hsl(30_40%_98%)] text-zinc-900 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-rose-900/10 bg-rose-50/60">
        <div className="font-bold text-sm text-rose-900">Explanation</div>
        <button
          onClick={toggleCapture}
          type="button"
          title={captureMode ? "Cancel" : "Create a note from this explanation"}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-bold shadow-sm transition-all ${
            captureMode
              ? "bg-card text-rose-900 ring-2 ring-rose-300 hover:bg-rose-50"
              : "bg-gradient-to-r from-orange-500 to-rose-600 text-white hover:from-orange-400 hover:to-rose-500"
          }`}
        >
          {captureMode ? <X className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
          {captureMode ? "Cancel" : "Create Note"}
        </button>
      </div>

      <div
        ref={containerRef}
        className={`relative px-5 md:px-6 py-6 text-[15px] leading-relaxed ${
          captureMode ? "bg-amber-50/40 ring-2 ring-inset ring-amber-300/60 capture-active" : ""
        }`}
      >
        <style>{`
          .capture-active ::selection { background:#fde68a; color:#0a0a0a; }
          .capture-active ::-moz-selection { background:#fde68a; color:#0a0a0a; }
        `}</style>

        {captureMode && (
          <div className="mb-4 text-xs text-rose-800 bg-rose-100/70 border border-rose-200 rounded-lg px-3 py-2">
            Drag to highlight any text — including the summary table — then tap
            <strong> Capture</strong>.
          </div>
        )}

        {/* All sections live inside ONE unified box, headings colored, body neutral */}
        <div className="space-y-6">
          {sections.map((s, si) => (
            <SectionBlock key={si} section={s} showDivider={si > 0} />
          ))}
        </div>
      </div>

      {captureMode && floatPos && (
        <button
          onClick={handleCapture}
          onPointerDown={(e) => e.preventDefault()}
          type="button"
          style={{ position: "fixed", left: floatPos.x, top: floatPos.y, zIndex: 80 }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-600 text-white text-sm font-bold shadow-xl ring-2 ring-white animate-in fade-in zoom-in-95"
        >
          <StickyNote className="w-4 h-4" />
          Capture
        </button>
      )}
    </div>
  );
}

function SectionBlock({ section, showDivider }: { section: Section; showDivider: boolean }) {
  const h = headingStyles[section.kind];
  return (
    <div>
      {showDivider && <div className="border-t border-rose-900/10 mb-5" aria-hidden />}
      <div className="flex items-center gap-2 mb-2.5">
        {h.icon}
        <h3 className={`font-extrabold text-[15px] md:text-[16px] tracking-tight ${h.color}`}>
          {h.label}
        </h3>
      </div>

      <div className="text-zinc-800 [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1 [&_strong]:font-bold [&_strong]:text-zinc-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-rose-100 [&_code]:text-rose-900 [&_code]:text-[13px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, trust: true }]]}

          components={{
            table: ({ children }) => (
              <div
                className="overflow-x-auto my-3 rounded-xl shadow-sm"
                style={{ background: "#ffffff", border: "1px solid #e4e4e7" }}
              >
                <table
                  className="w-full border-collapse"
                  style={{ background: "#ffffff", color: "#0a0a0a", fontSize: 14, lineHeight: 1.55 }}
                >
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead style={{ background: "#0a0a0a" }}>{children}</thead>
            ),
            th: ({ children }) => (
              <th
                className="text-left"
                style={{
                  color: "#ffffff",
                  background: "#0a0a0a",
                  padding: "12px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {children}
              </th>
            ),
            tr: ({ children }) => (
              <tr style={{ background: "#ffffff", borderTop: "1px solid #e4e4e7" }}>{children}</tr>
            ),
            td: ({ children }) => {
              const raw = Array.isArray(children)
                ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                : typeof children === "string"
                  ? children
                  : "";
              const isCorrect = /✓/.test(raw);
              const isWrong = /✗|✘|×/.test(raw) && !isCorrect;
              let color = "#0a0a0a";
              let weight: number | undefined;
              if (isCorrect) { color = "#047857"; weight = 700; }
              else if (isWrong) { color = "#a1a1aa"; }
              return (
                <td
                  style={{
                    background: "#ffffff",
                    color,
                    padding: "12px 14px",
                    verticalAlign: "top",
                    fontWeight: weight,
                  }}
                  className="first:font-bold"
                >
                  {children}
                </td>
              );
            },
          }}
        >
          {section.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
