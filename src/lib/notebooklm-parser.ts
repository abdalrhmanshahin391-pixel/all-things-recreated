import { formatQuestionStem } from "@/lib/question-format";

export type ParsedOption = {
  letter: string;
  body: string;
  is_correct: boolean;
  wrong_reason: string;
};

export type ParsedItem = {
  key: string;
  stem: string;
  options: ParsedOption[];
  correct_explanation: string;
  reference_note: string;
  selected: boolean;
  is_combined?: boolean;
};

/**
 * Master Prompt for Google NotebookLM.
 * Strictly requires solving from uploaded sources, citing book references,
 * and creating a Markdown Statement Breakdown Table for combined questions.
 */
export const NOTEBOOKLM_MASTER_PROMPT = `You are an expert medical professor, academic examiner, and medical textbook specialist.

I have uploaded our medical textbook / syllabus source documents to this notebook. Below is a batch of questions from our medical question bank.

Your task is to solve each question STRICTLY based on the uploaded reference sources, provide the correct answer, cite the exact textbook source/page, and provide a thorough, high-yield explanation.

==================================================
CRITICAL REQUIREMENT FOR COMBINED QUESTIONS:
If a question is COMBINED (contains numbered statements like 1, 2, 3, 4 followed by combination options like A. 1 and 2, B. 2 and 3, C. 1, 2, and 4, D. All of the above):
- In the Explanation, you MUST include a Markdown Table explaining why EACH INDIVIDUAL STATEMENT (1, 2, 3, 4...) is TRUE/CORRECT or FALSE/INCORRECT based on the textbook.
- Do NOT just explain why option A or B is right/wrong. You MUST break down Statement 1, Statement 2, Statement 3, Statement 4 individually in the table!
==================================================

Please output EVERY question using this EXACT structured format:

### Question [Number]
[Paste the full question stem here. If it has numbered statements 1, 2, 3, 4, keep each statement on its own line]

A. [Option text]
B. [Option text]
C. [Option text]
D. [Option text]
(Include E if applicable)

- Correct Answer: [Option Letter, e.g. B]
- Book Reference: [Exact textbook title, edition, chapter name/number, and page number or heading from the uploaded source]
- Explanation:
[Provide a clear, high-yield medical explanation explaining the core concept]

[IF COMBINED QUESTION (Statements 1, 2, 3, 4), INCLUDE THIS TABLE IN THE EXPLANATION]:
| Statement | Verdict | Explanation from Book |
| :--- | :--- | :--- |
| **1** | **Correct (True)** or **Incorrect (False)** | [Exact explanation and textbook evidence for Statement 1] |
| **2** | **Correct (True)** or **Incorrect (False)** | [Exact explanation and textbook evidence for Statement 2] |
| **3** | **Correct (True)** or **Incorrect (False)** | [Exact explanation and textbook evidence for Statement 3] |
| **4** | **Correct (True)** or **Incorrect (False)** | [Exact explanation and textbook evidence for Statement 4] |

- Why other options are incorrect:
• [Letter]: [Brief note on why this option is wrong]
• [Letter]: [Brief note on why this option is wrong]
• [Letter]: [Brief note on why this option is wrong]

==================================================

RULES:
1. Grounding: All answers and explanations MUST be verified against the uploaded book/sources. Do not fabricate information.
2. Structure: Keep the exact headings (- Correct Answer:, - Book Reference:, - Explanation:, | Statement | Verdict | Explanation from Book |) so our automated importer can parse them without errors.
3. Completeness: Solve all provided questions without skipping any.

Here are the questions to solve:
[PASTE YOUR COPIED QUESTIONS FROM AQUAQBANK HERE]`;

function parseOptionLine(line: string): { letter: string; body: string } | null {
  // 1. (A) Body or [A] Body
  const parenMatch = line.match(/^\s*(?:[-*•]\s*)?[\(\[]([A-Ea-e])[\)\]]\s+(.+)$/);
  if (parenMatch) {
    return {
      letter: parenMatch[1].toUpperCase(),
      body: parenMatch[2].replace(/^\*+|\*+$/g, "").trim(),
    };
  }

  // 2. A. Body, A) Body, **A.** Body, **A)** Body, **A**. Body, - A. Body
  const standardMatch = line.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?([A-Ea-e])(?:\.|\)|:)(?:\*\*)?\s+(.+)$/);
  if (standardMatch) {
    return {
      letter: standardMatch[1].toUpperCase(),
      body: standardMatch[2].replace(/^\*+|\*+$/g, "").trim(),
    };
  }

  // 3. **A** Body (if preceded by bullet or list)
  const bulletBoldMatch = line.match(/^\s*[-*•]\s+\*\*([A-Ea-e])\*\*\s+(.+)$/);
  if (bulletBoldMatch) {
    return {
      letter: bulletBoldMatch[1].toUpperCase(),
      body: bulletBoldMatch[2].replace(/^\*+|\*+$/g, "").trim(),
    };
  }

  return null;
}

function parseCorrectAnswer(line: string): string | null {
  const plain = line.replace(/[*_~`]/g, "").trim();
  const m = plain.match(/^(?:[-*•]\s*)?(?:correct\s*(?:answer|option)?|answer)\s*[:=-]\s*(?:option\s*)?([a-e])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function parseReference(line: string): string | null {
  const plain = line.replace(/[*_~`]/g, "").trim();
  const m = plain.match(/^(?:[-*•]\s*)?(?:book\s*reference|reference|book\s*source|source|citation)\s*[:=-]\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

function isExplanationHeader(line: string): boolean {
  const plain = line.replace(/[*_~`]/g, "").trim();
  return /^(?:[-*•]\s*)?(?:explanation|source\s*evidence|detailed\s*explanation)\s*[:=-]?/i.test(plain);
}

function isNewQuestionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (/^={4,}|^-{4,}$/.test(trimmed)) return true;
  if (/^#{1,4}\s*Question\s*\d+/i.test(trimmed)) return true;
  if (/^Question\s+\d+[:\.]/i.test(trimmed)) return true;
  if (/^Q\d+[:\.]/i.test(trimmed)) return true;
  return false;
}

/**
 * Detects if a question is combined (has numbered statements 1, 2, 3... in stem
 * or options referencing statements like "1 and 2", "all of the above").
 */
function isCombinedQuestion(stem: string, options: ParsedOption[]): boolean {
  const hasStatementsInStem = /(?:^|\n)\s*(?:[1-4]\.|\([1-4]\)|[1-4]\)|I\.|II\.)/i.test(stem);
  const hasComboOptions = options.some((o) =>
    /(?:1\s*(?:and|&)\s*2|2\s*(?:and|&)\s*3|all\s+of\s+the\s+above|none\s+of\s+the\s+above)/i.test(o.body),
  );
  return hasStatementsInStem || hasComboOptions;
}

/**
 * Parses raw text or JSON generated by Google NotebookLM into reviewed Question items.
 */
export function parseNotebookLmQuestions(raw: string): ParsedItem[] {
  const text = (raw || "").trim();
  if (!text) return [];

  // 1. Try parsing JSON format
  const cleanJson = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  if (cleanJson.startsWith("[") && cleanJson.endsWith("]")) {
    try {
      const arr = JSON.parse(cleanJson);
      if (Array.isArray(arr) && arr.length > 0 && (arr[0].stem || arr[0].question)) {
        return arr.map((item, idx) => {
          const stemRaw = (item.stem || item.question || "").trim();
          const stem = formatQuestionStem(stemRaw);
          const options: ParsedOption[] = (item.options || []).map((o: any, oIdx: number) => ({
            letter: o.letter || String.fromCharCode(65 + oIdx),
            body: (o.body || o.text || "").trim(),
            is_correct: Boolean(
              o.is_correct ||
                o.isCorrect ||
                item.correct_answer === o.letter ||
                item.correctAnswer === o.letter,
            ),
            wrong_reason: (o.wrong_reason || o.wrongReason || "").trim(),
          }));
          const combined = isCombinedQuestion(stem, options);
          return {
            key: `nb-json-${Date.now()}-${idx}`,
            stem,
            options,
            correct_explanation: (item.correct_explanation || item.explanation || "").trim(),
            reference_note: (item.reference_note || item.reference || item.source || "").trim(),
            selected: true,
            is_combined: combined,
          };
        });
      }
    } catch {
      /* proceed to structured text parse */
    }
  }

  // 2. Structured text / Markdown partitioner
  const lines = text.split("\n");
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isNewQuestionHeader(line) && currentChunk.length > 0) {
      if (currentChunk.join("\n").trim().length > 20) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }
    if (!/^={4,}|^-{4,}$/.test(line.trim())) {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0 && currentChunk.join("\n").trim().length > 20) {
    chunks.push(currentChunk);
  }

  const results: ParsedItem[] = [];

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunkLines = chunks[cIdx];
    const stemLines: string[] = [];
    let isParsingStem = true;
    const explanationLines: string[] = [];
    let isParsingExplanation = false;
    let correctLetter = "";
    let bookRef = "";
    const optionMatches: ParsedOption[] = [];

    for (let i = 0; i < chunkLines.length; i++) {
      const line = chunkLines[i];
      const trimmed = line.trim();

      // Skip question header itself in stem (e.g. "### Question 1")
      if (
        /^#{1,4}\s*Question\s*\d+/i.test(trimmed) ||
        /^Question\s+\d+[:\.]/i.test(trimmed) ||
        /^Q\d+[:\.]/i.test(trimmed)
      ) {
        continue;
      }

      const corr = parseCorrectAnswer(line);
      if (corr) {
        correctLetter = corr;
        isParsingStem = false;
        isParsingExplanation = true;
        continue;
      }

      const ref = parseReference(line);
      if (ref) {
        bookRef = ref;
        isParsingStem = false;
        isParsingExplanation = true;
        continue;
      }

      const opt = parseOptionLine(line);
      if (opt && !isParsingExplanation) {
        isParsingStem = false;
        optionMatches.push({
          letter: opt.letter,
          body: opt.body,
          is_correct: false,
          wrong_reason: "",
        });
        continue;
      }

      if (isExplanationHeader(line)) {
        isParsingStem = false;
        isParsingExplanation = true;
        const cleaned = line.replace(/^[^:]*[:=-]\s*/, "").trim();
        if (cleaned) explanationLines.push(cleaned);
        continue;
      }

      if (isParsingStem && !isParsingExplanation) {
        stemLines.push(line);
      } else if (isParsingExplanation) {
        explanationLines.push(line);
      }
    }

    if (optionMatches.length >= 2) {
      if (correctLetter) {
        for (const opt of optionMatches) {
          if (opt.letter === correctLetter) {
            opt.is_correct = true;
          }
        }
      }

      const rawStem = stemLines.join("\n").trim();
      const stem = formatQuestionStem(rawStem);
      const explanation = explanationLines.join("\n").trim();
      const combined = isCombinedQuestion(stem, optionMatches);

      results.push({
        key: `nb-item-${Date.now()}-${cIdx}`,
        stem,
        options: optionMatches,
        correct_explanation: explanation,
        reference_note: bookRef,
        selected: true,
        is_combined: combined,
      });
    }
  }

  return results;
}
