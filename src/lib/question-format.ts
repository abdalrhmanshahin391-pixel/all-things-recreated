/**
 * Formats question stems so that:
 * 1. Artificial topic-echoing preambles (e.g. "In the classification of...", "According to the text...") are stripped.
 * 2. Numbered statements 1., 2., 3., 4. for Combined (Form B) questions are reliably preserved and formatted.
 * 3. The question lead-in / stem is on its own line.
 * 4. Each numbered statement / case (e.g. 1., 2., 3., or I., II., III.) appears on its own line.
 * 5. Decimal numbers (e.g. 1.5 mg/dL, 37 weeks) inside sentences are safely preserved.
 * 6. Existing intentional newlines are respected without creating unnecessary gaps.
 */

/**
 * Strips artificial topic echoing preambles and textbook meta-framing from question stems.
 * e.g. "In the classification of general mechanisms responsible for the pathogenesis of cell injury, which..."
 * -> "Which..."
 * e.g. "According to the general principles and classification of cell injury pathogenesis, which..."
 * -> "Which..."
 * Does NOT touch legitimate clinical vignettes (e.g. "In a 45-year-old male with...").
 */
export function cleanQuestionPreamble(stem: string | null | undefined): string {
  if (!stem || typeof stem !== "string") return "";
  let s = stem.trim();

  // Pattern: Meta-academic opening followed by a question lead-in
  // Must NOT match clinical patient vignettes (e.g. "In a 45-year-old male...", "In an infant...", "In patients with...")
  const isClinicalVignette = (phrase: string): boolean => {
    return /\b(?:patient|male|female|man|woman|child|infant|neonate|newborn|year-old|yo\b|month-old|pregnant|presentation|presenting|admitted|history of|gravida|para|trimester)\b/i.test(
      phrase,
    );
  };

  // Match: Starts with "In...", "Within...", "Under...", "According to...", "Based on...", "Regarding...", "Concerning...", "With respect to...", "In terms of..."
  // followed by text up to a comma or colon, where the next word is a question lead-in
  const metaOpeningRegex =
    /^(?:In|Within|Under|Regarding|Concerning|With respect to|In terms of|According to|Based on|As described in|Referring to)\s+(?:the\s+)?[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i;

  // Disabled: stripping generic "In X, which…" clauses removed clinical context students need.
  const match = false as boolean ? s.match(metaOpeningRegex) : null;
  if (match && !isClinicalVignette(match[0])) {
    s = s.slice(match[0].length).trim();
    if (s.length > 0) {
      s = s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  // Also check explicit "According to / Based on ... [material/author/book/text]" even if not followed immediately by which/what
  const textRefRegex =
    /^(?:According to|Based on|As described in|Referring to)\s+(?:the\s+)?(?:provided\s+)?(?:text|textbook|chapter|section|excerpt|material|book|author|syllabus)[^,?:;]*[,\-:;]\s*/i;
  if (textRefRegex.test(s)) {
    s = s.replace(textRefRegex, "").trim();
    if (s.length > 0) {
      s = s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  return s;
}

/**
 * Assembles a complete question stem for Combined (Form B) questions.
 * Ensures the question lead-in is followed by all numbered statements (1., 2., 3., 4.),
 * each on its own line.
 */
export function buildCombinedStem(
  leadIn: string | null | undefined,
  statements?: Array<{ n?: string | number; text?: string }> | null,
): string {
  const cleanLead = formatQuestionStem(leadIn);
  if (!Array.isArray(statements) || statements.length === 0) {
    return cleanLead;
  }
  // If the lead-in already contains numbered statements (e.g. \n1. or \n1)), don't duplicate
  if (/(?:^|\n)\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+/i.test(cleanLead)) {
    return cleanLead;
  }
  const formattedStatements = statements
    .map((s, idx) => {
      const num = s.n || idx + 1;
      const text = String(s.text || "").replace(/^\s*(?:\d+|[A-Za-z])[\.\)\-:]\s*/, "").trim();
      return `${num}. ${text}`;
    })
    .filter((s) => s.length > 3)
    .join("\n");

  if (!formattedStatements) return cleanLead;
  return `${cleanLead}\n\n${formattedStatements}`.trim();
}

/**
 * If a question stem is a combined question missing its numbered statements,
 * extracts them from the explanation markdown table or options if available.
 */
export function ensureCombinedStemWithStatements(
  rawStem: string | null | undefined,
  explanation?: string | null,
  options?: Array<{ label?: string; text?: string }> | null,
): string {
  let stem = formatQuestionStem(rawStem);
  if (!stem) return "";

  // 1. If stem already has numbered statements 1. ... 2. ..., it is already complete
  if (/(?:^|\n)\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+/i.test(stem)) {
    return stem;
  }

  // 2. Detect combination options (e.g. "1, 2, and 3 only", "2 and 4 only", "1 and 2 only", "1 only")
  const isComboOptionText = (text?: string): boolean => {
    if (!text) return false;
    const t = text.trim();
    return (
      /^\s*(?:[1-5IVX](?:\s*,\s*|\s+and\s+|\s+or\s+|\s+only\b|\s+))+\s*$/i.test(t) ||
      /\b(?:1\s*,\s*2|1\s+and\s+2|2\s+and\s+4|1\s*,\s*3|2\s*,\s*3|3\s+and\s+4|1\s*,\s*2\s*,\s*3|2\s*,\s*3\s*,\s*4|all of the above|none of the above|1\s+only|2\s+only|3\s+only|4\s+only)\b/i.test(t)
    );
  };

  const hasComboOptions = Array.isArray(options) && options.filter((o) => isComboOptionText(o?.text)).length >= 2;

  // Check stem for combination keywords
  const hasComboStem = /(?:statements\s+are\s+correct|which\s+of\s+the\s+following\s+statements|following\s+statements\s+is\s+true|which\s+statements|following\s+(?:statements|mechanisms|findings|features|options)\s+are|combination|which\s+of\s+these\s+statements)/i.test(stem);

  // Check explanation for a statement breakdown table
  const hasStatementTable = !!explanation && /\|\s*(?:Statement|Assertion|Concept|Mechanism|Item)\s*\|/i.test(explanation);

  // If none of these indicators are present, it is not a combination question missing statements
  if (!hasComboOptions && !hasComboStem && !hasStatementTable) {
    return stem;
  }

  if (!explanation) return stem;

  // 3. Extract from markdown table: | Statement | Correct? | Explanation |
  const tableHeaderRegex = /\|([^\r\n]*(?:Statement|Assertion|Concept|Mechanism|Item)[^\r\n]*)\|/i;
  const headerMatch = explanation.match(tableHeaderRegex);

  if (headerMatch && headerMatch.index !== undefined) {
    const afterHeader = explanation.slice(headerMatch.index);
    const rows = afterHeader
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.includes("---"));

    if (rows.length >= 2) {
      const headerCols = rows[0].split("|").map((c) => c.trim()).filter(Boolean);
      let stmtColIdx = headerCols.findIndex((c) => /statement|assertion|concept|mechanism|item/i.test(c));
      if (stmtColIdx === -1) stmtColIdx = 0;

      const stmts: Array<{ n: string; text: string }> = [];
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split("|").map((c) => c.trim()).filter(Boolean);
        if (cols.length > stmtColIdx) {
          const itemText = cols[stmtColIdx]
            .replace(/^\s*(?:\d+|[A-Za-z])[\.\)\-:]\s*/, "")
            .replace(/^[*_]+|[*_]+$/g, "")
            .trim();
          if (itemText.length > 2 && !/^(?:yes|no|true|false|correct|incorrect|✓|✗)$/i.test(itemText)) {
            stmts.push({ n: String(stmts.length + 1), text: itemText });
          }
        }
      }

      if (stmts.length >= 2) {
        return buildCombinedStem(stem, stmts);
      }
    }
  }

  // 4. Fallback: Extract from numbered list in explanation breakdown if table not found
  const listMatch = explanation.match(/(?:Statements?|Breakdown|Analysis):\s*[\r\n]+((?:\s*(?:Statement\s+\d+|\d+[\.\)])\s+[^\n]+[\r\n]*)+)/i);
  if (listMatch) {
    const lines = listMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
    const stmts: Array<{ n: string; text: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].replace(/^\s*(?:Statement\s+\d+[:\-]?|\d+[\.\)\-:])\s*/i, "").trim();
      if (text.length > 3) {
        stmts.push({ n: String(i + 1), text });
      }
    }
    if (stmts.length >= 2) {
      return buildCombinedStem(stem, stmts);
    }
  }

  return stem;
}

export function formatQuestionStem(rawStem: string | null | undefined): string {
  if (!rawStem || typeof rawStem !== "string") return "";

  // 1. Strip artificial topic-echoing preambles
  let stem = cleanQuestionPreamble(rawStem);

  // Pattern check: detect if the stem contains an inline sequence of numbered statements
  // e.g. "...question? 1. ... 2. ... 3. ..." or "...following: 1. ... 2. ..."
  const hasNumberedSequence =
    /(?:[?:\u061f]|\bstatements\b|\bfollowing\b|\binfants\b|\bpatients\b|\bfindings\b|\boptions\b|[a-zA-Z\u0600-\u06FF])\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+.+?\s+(?:2[\.\)]|\(2\)|\bII[\.\)]|\(II\))\s+/i.test(
      stem,
    ) || /[?:\u061f]\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+/i.test(stem);

  if (hasNumberedSequence) {
    // 1. Separate question lead-in from statement 1 or I (e.g. after question mark '?' or colon ':')
    stem = stem.replace(
      /([?:\u061f])\s*((?:[1-9]|10)[\.\)]|\([1-9]\)|\b(?:I|II|III|IV|V)[\.\)]|\((?:I|II|III|IV|V)\))\s+/g,
      "$1\n$2 ",
    );

    // Also if no question mark or colon immediately before statement 1, but preceded by words:
    if (
      !stem.includes("\n1.") &&
      !stem.includes("\n1)") &&
      !stem.includes("\n(1)") &&
      !stem.includes("\nI.") &&
      !stem.includes("\nI)")
    ) {
      stem = stem.replace(
        /([a-zA-Z\u0600-\u06FF,]+)\s+((?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+[A-Za-z\u0600-\u06FF])/g,
        "$1\n$2",
      );
    }

    // 2. Separate subsequent statements: " 2. ", " 3. ", " 4. ", etc. (or II., III., etc.)
    // Matches only when followed by text so decimal numbers (e.g. 1.5) are never touched
    stem = stem.replace(
      /\s+((?:[2-9]|10)[\.\)]|\([2-9]\)|\b(?:II|III|IV|V|VI|VII|VIII)[\.\)]|\((?:II|III|IV|V|VI|VII|VIII)\))\s+([A-Za-z\u0600-\u06FF])/g,
      "\n$1 $2",
    );
  }

  // Normalize excessive vertical whitespace
  return stem.replace(/\n{3,}/g, "\n\n");
}
