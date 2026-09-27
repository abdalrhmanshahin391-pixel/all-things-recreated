/**
 * Aqua MCQ Forge — Similarity & Deduplication Engine
 */

export function dupHash(stem: string): string {
  const norm = String(stem ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = (h * 31 + norm.charCodeAt(i)) | 0;
  }
  return `${norm.slice(0, 60)}#${h}`;
}

/** Tokenize and normalize medical text into character n-grams and word tokens */
function extractFeatures(text: string): Map<string, number> {
  const clean = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = clean.split(" ").filter((w) => w.length > 2);
  const freq = new Map<string, number>();

  // Word tokens
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 2.0);
  }

  // 3-word shingles for phrase matching
  for (let i = 0; i < words.length - 2; i++) {
    const shingle = `${words[i]}_${words[i + 1]}_${words[i + 2]}`;
    freq.set(shingle, (freq.get(shingle) ?? 0) + 3.0);
  }

  return freq;
}

/** Computes cosine similarity between two question stems (0.0 to 100.0) */
export function calculateSimilarity(stemA: string, stemB: string): number {
  if (!stemA || !stemB) return 0;
  if (stemA.trim().toLowerCase() === stemB.trim().toLowerCase()) return 100;

  const fA = extractFeatures(stemA);
  const fB = extractFeatures(stemB);

  if (fA.size === 0 || fB.size === 0) return 0;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const [key, val] of fA) {
    magA += val * val;
    if (fB.has(key)) {
      dotProduct += val * (fB.get(key) ?? 0);
    }
  }

  for (const [, val] of fB) {
    magB += val * val;
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) return 0;

  const score = (dotProduct / denominator) * 100;
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

/**
 * Checks a new question stem against a list of existing question stems.
 * Returns the highest similarity score found and the matching stem.
 */
export function checkDuplicate(
  newStem: string,
  existingStems: string[],
): { maxScore: number; duplicateStem: string | null } {
  let maxScore = 0;
  let duplicateStem: string | null = null;

  for (const existing of existingStems) {
    const score = calculateSimilarity(newStem, existing);
    if (score > maxScore) {
      maxScore = score;
      duplicateStem = existing;
    }
  }

  return { maxScore, duplicateStem };
}
