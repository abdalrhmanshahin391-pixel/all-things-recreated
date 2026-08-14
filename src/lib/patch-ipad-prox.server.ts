// Server-only helpers for Patch iPad ProX. Keeping them here lets the
// .functions.ts file stay a thin wrapper of server-function declarations.

export const PROX_CUT_MODEL = "gemini-2.5-flash";
export const PROX_SOLVE_MODEL = "gemini-2.5-flash";
export const PROX_JOBS = "patch_prox_jobs";
export const PROX_PAGES = "patch_prox_pages";
export const PROX_ITEMS = "patch_prox_items";

export async function ensureProxAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return { supabase: supabase as any, userId: userId as string };
}

export async function getProxGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys").select("api_key, slot").eq("provider", "gemini")
    .order("slot", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/gemini-keys.");
  return data.api_key as string;
}

export async function submitProxBatch(apiKey: string, model: string, displayName: string, requests: any[]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ batch: { display_name: displayName, input_config: { requests: { requests } } } }),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Batch submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  const name: string | undefined = json?.name || json?.metadata?.name;
  if (!name) throw new Error("Batch submit returned no name");
  return name;
}

export function extractJson(text: string): any | null {
  const cleaned = String(text || "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch { /* keep trying */ }
  const lb = cleaned.search(/[[{]/);
  const rb = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (lb !== -1 && rb > lb) { try { return JSON.parse(cleaned.slice(lb, rb + 1)); } catch { /* give up */ } }
  return null;
}

export type ProxRegion = {
  n: number; label: string;
  y_top: number; y_bottom: number; x_left: number; x_right: number;
};

/**
 * Gemini returns raw bands. Left as-is they overlap, run into the next
 * question, or slice one in half — which is what produces unreadable crops.
 * Clean them per column: clamp, sort, de-overlap, snap each bottom to the next
 * top, and drop slivers that cannot be a whole question.
 */
export function normalizeProxRegions(raw: any[]): ProxRegion[] {
  const clamp = (v: number) => Math.max(0, Math.min(1000, v));
  const parsed = raw
    .map((r: any, idx: number) => {
      const yTop = clamp(Number(r?.y_top ?? 0));
      const yBottom = clamp(Number(r?.y_bottom ?? 0));
      const xLeft = clamp(Number(r?.x_left ?? 0));
      const xRight = clamp(Number(r?.x_right ?? 1000));
      return {
        n: Number(r?.n ?? idx + 1),
        label: String(r?.label ?? `Q${idx + 1}`).slice(0, 40),
        y_top: Math.min(yTop, yBottom),
        y_bottom: Math.max(yTop, yBottom),
        x_left: Math.min(xLeft, xRight),
        x_right: Math.max(xLeft, xRight),
      };
    })
    .filter((r) => Number.isFinite(r.y_top) && Number.isFinite(r.y_bottom) && r.x_right - r.x_left >= 80);

  // Group by column so a two-column page never snaps a left band to a right one.
  const columns = new Map<string, ProxRegion[]>();
  for (const r of parsed) {
    const key = `${Math.round(r.x_left / 100)}-${Math.round(r.x_right / 100)}`;
    const list = columns.get(key) ?? [];
    list.push(r);
    columns.set(key, list);
  }

  const out: ProxRegion[] = [];
  for (const list of columns.values()) {
    list.sort((a, b) => a.y_top - b.y_top);
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!;
      const next = list[i + 1];
      if (next) {
        // never let a band run past the start of the next question…
        if (cur.y_bottom > next.y_top) cur.y_bottom = next.y_top;
        // …and never leave a gap that swallows the top of the next one
        if (next.y_top < cur.y_bottom) next.y_top = cur.y_bottom;
      }
      if (cur.y_bottom - cur.y_top >= 40) out.push(cur);
    }
  }

  out.sort((a, b) => (a.x_left - b.x_left) || (a.y_top - b.y_top));
  return out.map((r, i) => ({ ...r, n: i + 1, label: r.label || `Q${i + 1}` }));
}

/** Re-solve ONE question picture outside the batch (used to repair failures). */
export async function solveSingleProxImage(
  apiKey: string, base64: string, subjectsBlock: string,
): Promise<any | null> {
  const body = {
    systemInstruction: { parts: [{ text: IMAGE_SOLVER_SYSTEM }] },
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: `${subjectsBlock}Solve this single question image and return JSON per the system prompt.` },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${PROX_SOLVE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => null as any);
  return extractJson(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

export function responseText(item: any): string {
  return item?.response?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.body?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.generateContentResponse?.body?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.candidates?.[0]?.content?.parts?.[0]?.text
    || item?.response?.text || item?.text || "";
}

export function getBatchResponses(json: any): any[] {
  const cleanArray = (arr: any[]) => arr.filter((item) => (
    responseText(item) || item?.error || item?.response || item?.generateContentResponse
    || item?.metadata?.key || item?.key
  ));
  const candidates = [
    json?.response?.output?.inlinedResponses?.inlinedResponses,
    json?.response?.output?.inlinedResponses,
    json?.output?.inlinedResponses?.inlinedResponses,
    json?.output?.inlinedResponses,
    json?.response?.responses, json?.responses,
    json?.response?.inlinedResponses?.inlinedResponses, json?.response?.inlinedResponses,
    json?.inlinedResponses?.inlinedResponses, json?.inlinedResponses,
  ];
  for (const x of candidates) {
    if (!Array.isArray(x)) continue;
    const cleaned = cleanArray(x);
    if (cleaned.length) return cleaned;
  }
  const found: any[][] = [];
  const walk = (value: any, depth = 0) => {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      const cleaned = cleanArray(value);
      if (cleaned.length) found.push(cleaned);
      for (const child of value) walk(child, depth + 1);
      return;
    }
    if (typeof value === "object") for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(json);
  if (found.length) return found.sort((a, b) => b.length - a.length)[0];
  return [];
}

export function getBatchState(json: any): string {
  return json?.metadata?.state || json?.response?.state || json?.state || "BATCH_STATE_UNKNOWN";
}

export function mapBatchStatus(state: string) {
  const s = String(state || "").toUpperCase();
  if (s.endsWith("SUCCEEDED")) return "succeeded";
  if (s.endsWith("FAILED")) return "failed";
  if (s.endsWith("CANCELLED")) return "cancelled";
  if (s.endsWith("EXPIRED")) return "expired";
  if (s.endsWith("RUNNING")) return "running";
  return "pending";
}

function getResponsesFile(json: any): string | undefined {
  const file = json?.response?.output?.responsesFile || json?.output?.responsesFile
    || json?.response?.responsesFile || json?.responsesFile;
  if (typeof file === "string") return file;
  return file?.name || file?.uri || file?.file;
}

export async function fetchBatch(apiKey: string, batchName: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

export async function downloadResponses(apiKey: string, json: any): Promise<any[]> {
  let inline = getBatchResponses(json);
  const file = getResponsesFile(json);
  if ((!inline || inline.length === 0) && file) {
    const fr = await fetch(
      `https://generativelanguage.googleapis.com/download/v1beta/${file}:download?alt=media`,
      { headers: { "x-goog-api-key": apiKey } },
    );
    if (!fr.ok) throw new Error(`Download responses failed (${fr.status})`);
    const text = await fr.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
      try { inline = JSON.parse(trimmed); } catch { inline = []; }
    } else {
      inline = trimmed.split("\n").map((l) => l.trim()).filter(Boolean)
        .map((l) => { try { return JSON.parse(l.replace(/^,\s*/, "")); } catch { return null; } })
        .filter(Boolean) as any[];
    }
  }
  return inline ?? [];
}

/** "a", "A.", "(b)" -> "A" / "B". Keeps letter case confusion out of the data. */
export function normalizeLetter(value: any): string {
  const m = String(value ?? "").trim().match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : "";
}

/**
 * The explanation is the authority for this page: Gemini writes
 * "Option **A** (arthralgia) is correct." about the option it actually solved,
 * even when the correct_letter field disagrees.
 */
export function correctLetterFromExplanation(explanation: string, letters: string[]): string | null {
  const text = String(explanation || "");
  const allowed = new Set(letters.map((l) => normalizeLetter(l)).filter(Boolean));
  const patterns = [
    /option\s*\**\s*\(?\s*([A-Za-z])\s*\)?\s*\**\s*[^.\n]{0,120}?\bis\s+(?:the\s+)?correct\b/i,
    /option\s*\**\s*\(?\s*([A-Za-z])\s*\)?\s*\**/i,
    /(?:answer|correct answer)\s*(?:is)?\s*[:\-]?\s*\**\s*\(?\s*([A-Za-z])\s*\)?\s*\**/i,
  ];
  const idx = text.toLowerCase().indexOf("correct answer is right");
  const scope = idx === -1 ? text : text.slice(idx);
  for (const source of [scope, text]) {
    for (const re of patterns) {
      const m = source.match(re);
      const letter = m ? normalizeLetter(m[1]) : "";
      if (letter && (!allowed.size || allowed.has(letter))) return letter;
    }
  }
  return null;
}

/** Letters listed under "why the other options are wrong" imply the correct one. */
export function impliedCorrectLetter(explanation: string, letters: string[]): string | null {
  const idx = String(explanation || "").toLowerCase().indexOf("other options are wrong");
  if (idx === -1) return null;
  const tail = explanation.slice(idx);
  const wrong = new Set<string>();
  for (const m of tail.matchAll(/^\s*[-*]\s*\*\*\s*([A-Za-z])\s*[.)]?\s*\*\*/gm)) wrong.add(normalizeLetter(m[1]));
  if (wrong.size < Math.max(2, letters.length - 2)) return null;
  const remaining = letters.map(normalizeLetter).filter((l) => l && !wrong.has(l));
  return remaining.length === 1 ? remaining[0] : null;
}

/** Explanation sentence first, then the "wrong options" list, then the raw field. */
export function decideCorrectLetter(explanation: string, letters: string[], rawField: any): string {
  const fromText = correctLetterFromExplanation(explanation, letters);
  if (fromText) return fromText;
  const implied = impliedCorrectLetter(explanation, letters);
  if (implied) return implied;
  const raw = normalizeLetter(rawField);
  if (raw) return raw;
  return normalizeLetter(letters[0]) || "A";
}

export function buildSubjectsBlock(candidates: string[]): string {
  if (!candidates.length) return "";
  return `SUBJECTS (pick exactly one index, or 0 if none fit):\n${candidates.map((c, i) => ` ${i + 1}. ${c}`).join("\n")}\n\n`;
}

/**
 * Optional "answer according to this textbook" instruction. Returns an empty
 * string when no book is set, so the prompt is byte-identical to before.
 */
export function buildReferenceBlock(book: any): string {
  const name = String(book ?? "").trim();
  if (!name) return "";
  return `REFERENCE TEXTBOOK — "${name}".
Answer and explain STRICTLY according to this textbook:
- use its terminology, classifications, staging and cut-off values;
- name the book once inside the **Concept** section;
- if the printed answer key disagrees with the textbook, choose the option the textbook supports.\n\n`;
}

export const CUTTER_SYSTEM = `You are given ONE full page image of a printed exam paper (equations, fractions, symbols and sometimes diagrams).

Your only job is to locate every distinct FULL QUESTION BLOCK on the page. A question block starts at the QUESTION NUMBER and includes the stem, every equation line, every diagram/graph/figure that belongs to it, and ALL printed answer choices (a, b, c, d). It ends right before the next question number begins.

CRITICAL: never return a box around only the graph/figure. If a diagram is in the middle of the question, expand the box upward to include the words/question number and downward to include all answer choices. The crop will be shown to students as the question itself, so the crop must be understandable without any surrounding page context.

Coordinate system: the page is normalized to 0..1000 on BOTH axes. y=0 is the very top of the page, y=1000 is the very bottom. x=0 is the left edge, x=1000 the right edge.

Rules:
- Return the questions in reading order. For a TWO-COLUMN page, return the whole left column top-to-bottom first, then the right column.
- y_top must start above the question number / first word of the stem, NOT at the diagram.
- y_bottom must end below the LAST answer choice, not below the diagram.
- For single-column layout set x_left=0 and x_right=1000. For a two-column layout, set x_left/x_right to that column only (e.g. 0..500 or 500..1000).
- Never let two questions overlap. Never merge two questions into one band.
- Ignore headers, footers, page numbers, instructions, and name/date lines.
- If the page has NO questions at all, return {"questions": []}.

Return STRICT JSON only:
{"questions":[{"n":1,"label":"Q1","y_top":40,"y_bottom":220,"x_left":0,"x_right":1000}]}`;

export const IMAGE_SOLVER_SYSTEM = `You are an expert exam tutor. The user gives you ONE image containing a SINGLE exam question: its stem, any figure, and its answer choices (usually A/B/C/D or a/b/c/d), plus a numbered list of SUBJECTS.

IMPORTANT — the paper may already be answered. A yellow highlight, a red tick, a circle or an underline on ONE option is the printed answer key. Treat such a marking as a STRONG HINT, verify it by solving the question yourself, and only disagree with it if you are certain it is wrong. If nothing is marked, solve the question and choose the option you can prove.

Return STRICT JSON only (no markdown fences):
{
  "prompt": "short plain-text restatement of the question (max 200 chars), used only for indexing — no LaTeX",
  "letters": ["A","B","C","D"],
  "correct_letter": "A",
  "correct_option_text": "verbatim (short) text of the option you chose",
  "concept": "≤8 words naming the core concept tested",
  "explanation": "GitHub-flavored Markdown with THREE sections separated by BLANK LINES:\\n\\n**Concept**\\n2-3 sentences on the principle used. Define every symbol.\\n\\n**Why the correct answer is right**\\nThis section MUST begin with EXACTLY this sentence shape, using an UPPERCASE letter: 'Option **X** (option text) is correct.' then 2-4 short bullets with the reasoning step by step, with units.\\n\\n**Why the other options are wrong**\\n- **B.** one sentence naming the specific mistake (list ONLY the letters that are NOT correct)\\n- **C.** ...\\n- **D.** ...",
  "subject_index": <integer 1..N, or 0 if nothing fits>,
  "confidence": "high" | "medium" | "low"
}

ANSWER CONSISTENCY (most important rule):
- Decide the answer FIRST, then write it in BOTH places. "correct_letter" and the letter written in the sentence 'Option **X** … is correct.' MUST be the same letter.
- Always write option letters in UPPERCASE (A, B, C, D), even when the paper prints them as a/b/c/d.
- The "Why the other options are wrong" list must NEVER contain the correct letter, and must list every other printed letter.

MATH FORMATTING (very important):
- Write EVERY formula, fraction, power, root and unit expression as LaTeX.
- Inline math uses single dollars: $F(r) = -\\frac{A}{r^{7}}$. A standalone derivation line uses double dollars: $$r_{eq} = \\sqrt[6]{\\frac{B}{A}}$$
- Use \\frac, \\sqrt[n]{}, ^{ }, _{ }, \\cdot, \\times, \\approx, \\Delta. Escape backslashes so the JSON stays valid.

CHEMISTRY FORMATTING (whenever the question is chemistry / biochemistry):
- Write EVERY formula, ion and reaction with \\ce inside math dollars: $\\ce{H2O}$, $\\ce{SO4^2-}$, $$\\ce{CH3COOH + NaOH -> CH3COONa + H2O}$$.
- Never leave a dangling bond hyphen at the start or end of a \\ce group.
- If an option is a DRAWN structure, refer to it by its letter and describe it in words.

Other rules:
- "letters" must be the answer-choice letters actually printed in the image, uppercase, in order. Do NOT transcribe full option text into "letters" — the student sees the image.
- subject_index MUST be an integer index from the SUBJECTS list, never a name. Use 0 only if nothing fits.
- Keep the whole JSON under 1200 words. Output JSON only.`;
