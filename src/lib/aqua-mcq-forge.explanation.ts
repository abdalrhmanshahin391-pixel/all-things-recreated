/**
 * Aqua MCQ Forge — Structured Explanation Builder
 *
 * Enforces the exact medical explanation format:
 * 1. Medical Topic Title (## ...)
 * 2. Overview and concept (3-4 lines)
 * 3. Why the correct answer is right (2-3 lines) — omitted if all are correct
 * 4. Why the other options are wrong (1-2 lines per distractor) — omitted if nothing is correct
 * 5. Breakdown Table:
 *    - Standard: | Option | Correct? | Explanation | (First col has option text verbatim, NO A/B/C/D)
 *    - Combined: | Statement | Correct? | Explanation | (First col has statement text verbatim, NO 1/2/3/4)
 * 6. Clinical distinction (2-3 lines)
 * 7. Easy way to remember (memory aid)
 * 8. Optional Source Fidelity citation block
 */

export interface ExplanationTableRow {
  item: string;
  correct: boolean;
  reason: string;
}

export interface ExplanationData {
  title?: string;
  concept?: string;
  overview?: string;
  why_correct?: string;
  why_wrong?: string;
  table_rows?: ExplanationTableRow[];
  clinical_distinction?: string;
  memory_aid?: string;
}

export interface SourceFidelityData {
  source?: string;
  page?: string | number;
  section?: string;
  evidence?: string;
}

export function cleanMarkdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips leading 'A)', 'B.', '1-', '2)', etc. from an item's wording */
export function stripPrefix(text: string): string {
  return cleanMarkdownCell(text).replace(/^\s*(?:[A-Za-z]|\d+)\s*[.)\-:]\s*/, "");
}

export function buildForgeExplanation(
  form: "A" | "B",
  data: ExplanationData,
  displayItems: Array<{ label: string; text: string }>,
  correctLabels: string[],
  sourceFidelity?: SourceFidelityData | null,
): string {
  const parts: string[] = [];
  const title = cleanMarkdownCell(data.title || data.concept || "Detailed Explanation");
  parts.push(`## ${title}`);

  // 1. Overview and concept (3-4 lines)
  const overview = cleanMarkdownCell(data.overview || data.concept || "");
  if (overview) {
    parts.push(overview);
  }

  const isAllCorrect = displayItems.length > 0 && correctLabels.length === displayItems.length;
  const isNoneCorrect = correctLabels.length === 0;

  // 2. Why the correct answer is right (omitted if all are correct or none correct)
  if (!isNoneCorrect && !isAllCorrect && data.why_correct?.trim()) {
    parts.push(`### Why the correct answer is right\n${data.why_correct.trim()}`);
  } else if (!isNoneCorrect && isAllCorrect && data.why_correct?.trim()) {
    parts.push(`### Why all options are correct\n${data.why_correct.trim()}`);
  }

  // 3. Why the other options are wrong (omitted if all are correct or none correct)
  if (!isAllCorrect && !isNoneCorrect && data.why_wrong?.trim()) {
    parts.push(`### Why the other options are wrong\n${data.why_wrong.trim()}`);
  }

  // 4. Breakdown Table
  // Standard Form A: First column header is "Option"
  // Combined Form B: First column header is "Statement"
  const firstColHeader = form === "B" ? "Statement" : "Option";
  const correctSet = new Set(correctLabels.map((l) => String(l).trim().toUpperCase()));

  const rowsMap = new Map<string, ExplanationTableRow>();
  for (const r of data.table_rows ?? []) {
    const key = stripPrefix(r.item).toLowerCase();
    rowsMap.set(key, r);
  }

  const tableLines: string[] = [
    `| ${firstColHeader} | Correct? | Explanation |`,
    `|---|---|---|`,
  ];

  for (const item of displayItems) {
    const rawText = item.text || "";
    const cleanText = stripPrefix(rawText);
    const lookupKey = cleanText.toLowerCase();
    const rowInfo = rowsMap.get(lookupKey);

    const isMarkedCorrect = correctSet.has(String(item.label).trim().toUpperCase());
    const isCorrect = rowInfo?.correct !== undefined ? rowInfo.correct : isMarkedCorrect;
    const verdict = isCorrect ? "✓ Yes" : "✗ No";

    const reason = cleanMarkdownCell(rowInfo?.reason || "See detailed concept above.");
    tableLines.push(`| ${cleanText} | ${verdict} | ${reason} |`);
  }

  parts.push(tableLines.join("\n"));

  // 5. Clinical distinction (2-3 lines)
  if (data.clinical_distinction?.trim()) {
    parts.push(`### Clinical distinction\n${data.clinical_distinction.trim()}`);
  }

  // 6. Easy way to remember
  if (data.memory_aid?.trim()) {
    parts.push(`### Easy way to remember\n${data.memory_aid.trim()}`);
  }

  // 7. Source Fidelity Citation Block
  if (sourceFidelity && (sourceFidelity.source || sourceFidelity.evidence)) {
    const citationLines: string[] = ["### Source Citation"];
    if (sourceFidelity.source) citationLines.push(`**Source:** ${sourceFidelity.source}`);
    if (sourceFidelity.page) citationLines.push(`**Page:** ${sourceFidelity.page}`);
    if (sourceFidelity.section) citationLines.push(`**Section:** ${sourceFidelity.section}`);
    if (sourceFidelity.evidence) citationLines.push(`> "${cleanMarkdownCell(sourceFidelity.evidence)}"`);
    parts.push(citationLines.join("\n\n"));
  }

  return parts.join("\n\n").trim();
}
