/**
 * Formats question stems so that:
 * 1. The question lead-in / stem is on its own line.
 * 2. Each numbered statement / case (e.g. 1., 2., 3., or I., II., III.) appears on its own line.
 * 3. Decimal numbers (e.g. 1.5 mg/dL, 37 weeks) inside sentences are safely preserved.
 * 4. Existing intentional newlines are respected without creating unnecessary gaps.
 */
export function formatQuestionStem(rawStem: string | null | undefined): string {
  if (!rawStem || typeof rawStem !== "string") return "";

  let stem = rawStem.trim();

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
