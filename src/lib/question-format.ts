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

  const patterns = [
    // 1. 'In the classification of ...'
    /^In the classification of\s+[^,?:;]+[,\-:;]\s*/i,
    // 2. 'In the context / discussion / study / topic / chapter / section of/on ...'
    /^In the (?:context|discussion|study|topic|chapter|section)\s+(?:of|on)\s+[^,?:;]+[,\-:;]\s*/i,
    // 3. 'According to / Based on ... which/what/how...'
    /^(?:According to|Based on|As described in|Referring to)\s+(?:the\s+)?[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
    // 4. 'According to / Based on the (provided) text / chapter / section / excerpt / book ...'
    /^(?:According to|Based on|As described in|Referring to)\s+(?:the\s+)?(?:provided\s+)?(?:text|textbook|chapter|section|excerpt|material|book|author|syllabus)[^,?:;]*[,\-:;]\s*/i,
    // 5. 'Regarding the (classification / pathogenesis / mechanisms / etiology / pathophysiology) of ...'
    /^Regarding\s+(?:the\s+)?(?:classification|pathogenesis|mechanisms?|etiology|pathophysiology|concept)\s+of\s+[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
    // 6. 'In the (pathogenesis / etiology / mechanisms) of ..., which/what/how...'
    /^In\s+(?:the\s+)?(?:pathogenesis|etiology|mechanisms?|pathophysiology)\s+of\s+[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
    // 7. 'With respect to / In terms of the classification of ...'
    /^(?:With respect to|In terms of)\s+(?:the\s+)?(?:classification\s+of\s+)?[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
  ];

  for (const p of patterns) {
    if (p.test(s)) {
      s = s.replace(p, "");
      // Capitalize first letter of remainder
      s = s.charAt(0).toUpperCase() + s.slice(1);
      break;
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
 * extracts them from the explanation markdown table if available.
 */
export function ensureCombinedStemWithStatements(
  rawStem: string | null | undefined,
  explanation?: string | null,
): string {
  let stem = formatQuestionStem(rawStem);
  if (!stem) return "";

  // Check if stem already has numbered statements 1. ... 2. ...
  if (/(?:^|\n)\s*(?:1[\.\)]|\(1\)|\bI[\.\)]|\(I\))\s+/i.test(stem)) {
    return stem;
  }

  // Check if stem indicates a combination question
  const isCombo = /(?:statements\s+are\s+correct|which\s+of\s+the\s+following\s+statements|following\s+statements\s+is\s+true|which\s+statements)/i.test(stem);
  if (!isCombo || !explanation) return stem;

  // Extract from markdown table: | Statement | Correct? | Explanation |
  const tableMatch = explanation.match(/\|\s*Statement\s*\|\s*Correct\??\s*\|\s*Explanation\s*\|([\s\S]*?)(?:\n\s*###|\n\s*##|$)/i);
  if (!tableMatch) return stem;

  const rows = tableMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !l.includes("---"));

  const stmts: Array<{ n: string; text: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 1) {
      const itemText = cols[0].replace(/^\s*(?:\d+|[A-Za-z])[\.\)\-:]\s*/, "").trim();
      if (itemText.length > 3) {
        stmts.push({ n: String(i + 1), text: itemText });
      }
    }
  }

  if (stmts.length > 0) {
    return buildCombinedStem(stem, stmts);
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
