/**
 * Formats question stems so that:
 * 1. Artificial topic-echoing preambles (e.g. "In the classification of...", "According to the text...") are stripped.
 * 2. The question lead-in / stem is on its own line.
 * 3. Each numbered statement / case (e.g. 1., 2., 3., or I., II., III.) appears on its own line.
 * 4. Decimal numbers (e.g. 1.5 mg/dL, 37 weeks) inside sentences are safely preserved.
 * 5. Existing intentional newlines are respected without creating unnecessary gaps.
 */

/**
 * Strips artificial topic echoing preambles and textbook meta-framing from question stems.
 * e.g. "In the classification of general mechanisms responsible for the pathogenesis of cell injury, which..."
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
    // 3. 'According to / Based on the (provided) text / chapter / section / excerpt / book ...'
    /^(?:According to|Based on|As described in|Referring to)\s+(?:the\s+)?(?:provided\s+)?(?:text|textbook|chapter|section|excerpt|material|book|author|syllabus)[^,?:;]*[,\-:;]\s*/i,
    // 4. 'Regarding the (classification / pathogenesis / mechanisms / etiology / pathophysiology) of ...'
    /^Regarding\s+(?:the\s+)?(?:classification|pathogenesis|mechanisms?|etiology|pathophysiology|concept)\s+of\s+[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
    // 5. 'In the (pathogenesis / etiology / mechanisms) of ..., which/what/how...'
    /^In\s+(?:the\s+)?(?:pathogenesis|etiology|mechanisms?|pathophysiology)\s+of\s+[^,?:;]+[,\-:;]\s*(?=(?:which|what|how|why|when|where|who|identify|select|name)\b)/i,
    // 6. 'With respect to / In terms of the classification of ...'
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
