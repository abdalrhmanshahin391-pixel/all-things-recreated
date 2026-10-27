import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import { ARROWS, splitChem, splitMath, splitScripts, type ChemPart } from "@/lib/chem";

type Piece = { kind: "math"; html: string; raw: string } | { kind: "chem"; p: ChemPart };

function mathHtml(src: string): string {
  try {
    return katex.renderToString(src, { throwOnError: false, strict: false, output: "html", trust: false });
  } catch {
    return "";
  }
}

/** Plain text with arrows drawn larger and unicode subscripts / superscripts as real sub / sup. */
function Plain({ text }: { text: string }) {
  return (
    <>
      {splitScripts(text).map((s, j) =>
        s.k === "sub" ? (
          <sub key={j}>{s.v}</sub>
        ) : s.k === "sup" ? (
          <sup key={j}>{s.v}</sup>
        ) : (
          <Fragment key={j}>
            {s.v.split(ARROWS).map((piece, n) =>
              n % 2 === 1 ? (
                <span key={n} className="arrow">
                  {piece}
                </span>
              ) : (
                <Fragment key={n}>{piece}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

/**
 * Question text with its chemical formulas drawn properly: bold, with real subscripts and superscripts
 * (CaCl₂, (NH₄)₃PO₄, Fe³⁺, 2H₂O), clear arrows, and formulas written as $LaTeX$ (fractions, exponents) drawn with KaTeX.
 * Everything else stays plain text, so it is safe for any question.
 */
export function ChemText({ text }: { text: string | null | undefined }) {
  const parts = useMemo(
    () =>
      splitMath(text ?? "").flatMap((m): Piece[] =>
        m.math ? [{ kind: "math", html: mathHtml(m.text), raw: m.text }] : splitChem(m.text).map((p): Piece => ({ kind: "chem", p })),
      ),
    [text],
  );
  return (
    <>
      {parts.map((x, i) =>
        x.kind === "math" ? (
          x.html ? (
            <span key={i} className="tex" dangerouslySetInnerHTML={{ __html: x.html }} />
          ) : (
            <Fragment key={i}>{x.raw}</Fragment>
          )
        ) : x.p.chem ? (
          <strong key={i} className="chem">
            {x.p.segs.map((s, j) => (s.k === "sub" ? <sub key={j}>{s.v}</sub> : s.k === "sup" ? <sup key={j}>{s.v}</sup> : <Fragment key={j}>{s.v}</Fragment>))}
          </strong>
        ) : (
          <Plain key={i} text={x.p.text} />
        ),
      )}
    </>
  );
}