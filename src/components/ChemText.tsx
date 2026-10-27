import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import { QuestionImage } from "@/components/quiz/QuestionImage";
import { ARROWS, splitChem, splitMath, splitScripts, type ChemPart } from "@/lib/chem";

const PICTURE_MARK = /\[\[img:([^\]\s]+)\]\]/g;

/** The text split around its [[img:path]] marks, or null when it has none. */
export function splitPictures(text: string): Array<{ img?: string; text?: string }> | null {
  if (!text.includes("[[img:")) return null;
  const out: Array<{ img?: string; text?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(PICTURE_MARK)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ img: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

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
  // An option (or text) that is a picture cut from the question paper is stored as [[img:path]] and drawn here as that picture.
  const pictures = useMemo(() => splitPictures(text ?? ""), [text]);
  if (pictures) {
    return (
      <>
        {pictures.map((x, i) =>
          x.img ? (
            <QuestionImage key={i} path={x.img} compact alt="Answer option, shown as a picture" className="!w-auto max-w-full !bg-white p-1 align-middle" />
          ) : x.text?.trim() ? (
            <ChemText key={i} text={x.text ?? ""} />
          ) : null,
        )}
      </>
    );
  }
  return <ChemTextBody text={text} />;
}

function ChemTextBody({ text }: { text: string | null | undefined }) {
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