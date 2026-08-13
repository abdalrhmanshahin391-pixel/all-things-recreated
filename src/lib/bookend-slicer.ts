// Locate questions inside a chunk of PDF text and slice each one out LOCALLY
// — no AI tokens spent.
//
// Hybrid input from the bookend extractor:
//   { first_words, last_words }   — long questions (>15 words)
//   { exact_text }                — short questions (≤15 words); use the
//                                   verbatim block as both the locator and
//                                   the slice.
//
// Matching is whitespace-insensitive and case-insensitive. PDF text often has
// odd spacing / line breaks, so we collapse whitespace before searching but
// keep a mapping back to the original string so the returned slice is the
// human-readable text.
//
// After each successful match we **delete the consumed range** from the
// working text so two short questions sharing the same opening words can't
// collide.

function buildNormMap(s: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = "";
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (!prevSpace && norm.length > 0) {
        norm += " ";
        map.push(i);
      }
      prevSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  return { norm, map };
}

function normalizePhrase(p: string): string {
  return p.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find phrase in haystack starting from fromOrigIdx. Returns {start,end} in original coords, or null. */
export function findPhrase(
  haystack: string,
  phrase: string,
  fromOrigIdx = 0,
): { start: number; end: number } | null {
  const { norm, map } = buildNormMap(haystack);
  const needle = normalizePhrase(phrase);
  if (!needle) return null;
  let normFrom = 0;
  for (let i = 0; i < map.length; i++) {
    if (map[i] >= fromOrigIdx) { normFrom = i; break; }
    if (i === map.length - 1) normFrom = map.length;
  }
  const at = norm.indexOf(needle, normFrom);
  if (at === -1) return null;
  const start = map[at] ?? 0;
  const endIdx = at + needle.length - 1;
  const end = (map[endIdx] ?? map[map.length - 1] ?? 0) + 1;
  return { start, end };
}

// Hybrid bookend type. Either (first_words + last_words) OR exact_text.
// Legacy field names (first_4_words/last_4_words) are still accepted for
// backwards compatibility with the previous bookend output shape.
export type Bookend = {
  first_words?: string;
  last_words?: string;
  exact_text?: string;
  exact?: string;
  // legacy aliases
  first_4_words?: string;
  last_4_words?: string;
  first_5?: string;
  last_5?: string;
};

export type Slice = {
  text: string;
  start: number;
  end: number;
  bookend: Bookend;
};

function pickFirst(be: Bookend): string | undefined {
  return be.first_words ?? be.first_5 ?? be.first_4_words;
}
function pickLast(be: Bookend): string | undefined {
  return be.last_words ?? be.last_5 ?? be.last_4_words;
}

export function sliceByBookends(chunkText: string, bookends: Bookend[]): Slice[] {
  const out: Slice[] = [];
  let remaining = chunkText;
  let consumedOffset = 0;
  for (const be of bookends) {
    let span: { start: number; end: number } | null = null;
    const exact = be.exact_text ?? be.exact;
    if (exact && exact.trim().length >= 5) {
      // Short question — use the verbatim block directly.
      span = findPhrase(remaining, exact, 0);
    } else {
      const first = pickFirst(be);
      const last = pickLast(be);
      if (!first || !last) continue;
      const f = findPhrase(remaining, first, 0);
      if (!f) continue;
      const l = findPhrase(remaining, last, f.start);
      if (!l) continue;
      if (l.end <= f.start) continue;
      span = { start: f.start, end: l.end };
    }
    if (!span) continue;
    const text = remaining.slice(span.start, span.end).trim();
    if (text.length < 5) continue;
    out.push({
      text,
      start: consumedOffset + span.start,
      end: consumedOffset + span.end,
      bookend: be,
    });
    consumedOffset += span.end;
    remaining = remaining.slice(span.end);
  }
  return out;
}

/**
 * Local no-AI fallback: split text by numbered question markers (e.g. "29.",
 * "30)", "31:"). Each numbered block runs until the next number or end of
 * text. Used when the Gemini bookend pass under-covers a chunk — we still
 * capture the missing questions locally so the pipeline never skips one.
 */
export function sliceByNumbers(chunkText: string): Slice[] {
  const re = /(?:^|\n)\s*(\d{1,3})\s*[.):]\s+/g;
  const marks: { idx: number; num: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunkText))) {
    marks.push({ idx: m.index + (m[0].length - m[0].trimStart().length), num: Number(m[1]) });
  }
  if (marks.length < 2) return [];
  const out: Slice[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : chunkText.length;
    const text = chunkText.slice(start, end).trim();
    if (text.length < 15) continue;
    // Require at least one options-ish marker or an "Answer" line inside — otherwise it's likely a TOC entry.
    if (!/(?:Ans(?:wer)?\b|\b[A-Ea-e]\s*[\).:\-]|[•∙]\s*[A-Ea-e])/i.test(text)) continue;
    out.push({ text, start, end, bookend: { exact_text: text.slice(0, 40) } });
  }
  return out;
}
